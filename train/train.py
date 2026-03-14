from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import torch

from data import load_dataset_manifest, load_shard, split_shard_paths
from net import NnueNetwork


def _scaled_loss(prediction: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    return torch.nn.functional.smooth_l1_loss(
        torch.tanh(prediction / 400.0), torch.tanh(target / 400.0)
    )


def evaluate_shards(
    network: NnueNetwork,
    shard_paths: Sequence[Path],
    batch_size: int,
    device: torch.device,
) -> float | None:
    total_error = 0.0
    position_count = 0
    network.eval()
    with torch.no_grad():
        for shard_path in shard_paths:
            side, opponent, score = load_shard(shard_path)
            for start in range(0, len(score), batch_size):
                end = start + batch_size
                side_batch = torch.from_numpy(side[start:end]).to(
                    device=device, dtype=torch.long
                )
                opponent_batch = torch.from_numpy(opponent[start:end]).to(
                    device=device, dtype=torch.long
                )
                target = torch.from_numpy(score[start:end]).to(
                    device=device, dtype=torch.float32
                )
                prediction = network(side_batch, opponent_batch)
                total_error += float(
                    torch.nn.functional.l1_loss(
                        prediction, target, reduction="sum"
                    )
                )
                position_count += len(target)
    return total_error / position_count if position_count else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data")
    parser.add_argument("out")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    if args.epochs <= 0 or args.batch <= 0 or args.lr <= 0:
        parser.error("epochs batch and learning rate must be positive")

    torch.manual_seed(args.seed)
    manifest, dataset_directory = load_dataset_manifest(args.data)
    training_shards = split_shard_paths(
        manifest, dataset_directory, "train"
    )
    validation_shards = split_shard_paths(
        manifest, dataset_directory, "validation"
    )
    if not training_shards:
        parser.error("training split is empty")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    network = NnueNetwork().to(device)
    optimizer = torch.optim.AdamW(network.parameters(), lr=args.lr)

    for epoch in range(args.epochs):
        random = np.random.default_rng(args.seed + epoch)
        shard_order = random.permutation(len(training_shards))
        network.train()
        total_loss = 0.0
        training_count = 0
        for shard_index in shard_order:
            side, opponent, score = load_shard(
                training_shards[int(shard_index)]
            )
            row_order = random.permutation(len(score))
            for start in range(0, len(row_order), args.batch):
                batch_indices = row_order[start : start + args.batch]
                side_batch = torch.from_numpy(side[batch_indices]).to(
                    device=device, dtype=torch.long
                )
                opponent_batch = torch.from_numpy(
                    opponent[batch_indices]
                ).to(device=device, dtype=torch.long)
                target = torch.from_numpy(score[batch_indices]).to(
                    device=device, dtype=torch.float32
                )
                prediction = network(side_batch, opponent_batch)
                loss = _scaled_loss(prediction, target)
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
                total_loss += float(loss.detach()) * len(target)
                training_count += len(target)
        validation_loss = evaluate_shards(
            network, validation_shards, args.batch, device
        )
        validation_text = (
            f"{validation_loss:.2f}" if validation_loss is not None else "n/a"
        )
        print(
            f"epoch {epoch + 1} "
            f"loss {total_loss / training_count:.6f} "
            f"val {validation_text}"
        )

    torch.save(network.state_dict(), args.out)


if __name__ == "__main__":
    main()
