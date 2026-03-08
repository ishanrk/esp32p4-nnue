from __future__ import annotations

import argparse

import numpy as np
import torch

from net import NnueNetwork


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data")
    parser.add_argument("out")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    data = np.load(args.data)
    side_features = torch.from_numpy(data["a"]).long()
    opponent_features = torch.from_numpy(data["b"]).long()
    labels = torch.from_numpy(data["y"]).float()
    position_count = len(labels)
    split = max(1, int(position_count * 0.95))
    permutation = torch.randperm(position_count)
    train_indices = permutation[:split]
    validation_indices = permutation[split:]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    network = NnueNetwork().to(device)
    optimizer = torch.optim.AdamW(network.parameters(), lr=args.lr)

    for epoch in range(args.epochs):
        network.train()
        order = train_indices[torch.randperm(len(train_indices))]
        total_loss = 0.0
        for start in range(0, len(order), args.batch):
            batch_indices = order[start : start + args.batch]
            prediction = network(
                side_features[batch_indices].to(device),
                opponent_features[batch_indices].to(device),
            )
            target = labels[batch_indices].to(device)
            loss = torch.nn.functional.smooth_l1_loss(
                torch.tanh(prediction / 400.0), torch.tanh(target / 400.0)
            )
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach()) * len(batch_indices)
        network.eval()
        validation_loss = 0.0
        if len(validation_indices):
            with torch.no_grad():
                prediction = network(
                    side_features[validation_indices].to(device),
                    opponent_features[validation_indices].to(device),
                )
                target = labels[validation_indices].to(device)
                validation_loss = float(
                    torch.nn.functional.l1_loss(prediction, target)
                )
        print(
            f"epoch {epoch + 1} "
            f"loss {total_loss / len(train_indices):.6f} "
            f"val {validation_loss:.2f}"
        )

    torch.save(network.state_dict(), args.out)


if __name__ == "__main__":
    main()
