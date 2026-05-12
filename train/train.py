from __future__ import annotations

import argparse
from collections.abc import Iterator, Sequence
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch

from data import (
    dataset_profile,
    load_dataset_manifest,
    load_shard,
    split_shard_paths,
)
from profiles import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    ACTIVATION_CLIP,
    FEATURES_PER_BUCKET,
    FEATURE_QUANTIZATION,
    FEATURE_MAPPING_VERSION,
    MODEL_FORMAT_VERSION,
    NnueProfile,
    OUTPUT_QUANTIZATION,
)
from net import NnueNetwork

TRAINING_MANIFEST_VERSION = 1
CHECKPOINT_SELECTION_RULE = "minimum validation transformed smooth l1"


def constrain_quantized_parameters(
    network: NnueNetwork,
) -> dict[str, int]:
    limits = {
        "feature_weights": (
            network.feature_transformer.weight,
            -128 / FEATURE_QUANTIZATION,
            127 / FEATURE_QUANTIZATION,
        ),
        "feature_bias": (
            network.feature_bias,
            ACCUMULATOR_BIAS_MIN / FEATURE_QUANTIZATION,
            ACCUMULATOR_BIAS_MAX / FEATURE_QUANTIZATION,
        ),
        "output_weights": (
            network.output.weight,
            -32768 / OUTPUT_QUANTIZATION,
            32767 / OUTPUT_QUANTIZATION,
        ),
        "output_bias": (
            network.output.bias,
            -(2**31) / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION),
            (2**31 - 1) / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION),
        ),
    }
    counts = {}
    with torch.no_grad():
        for name, (parameter, minimum, maximum) in limits.items():
            counts[name] = int(
                torch.count_nonzero(
                    (parameter < minimum) | (parameter > maximum)
                ).item()
            )
            parameter.clamp_(minimum, maximum)
        network.feature_transformer.weight[
            network.profile.padding_feature
        ].zero_()
    return counts


class ShardDataset(torch.utils.data.IterableDataset):
    def __init__(
        self,
        shard_paths: Sequence[Path],
        seed: int,
        profile: NnueProfile,
    ) -> None:
        super().__init__()
        self.shard_paths = tuple(shard_paths)
        self.seed = seed
        self.profile = profile

    def __iter__(self) -> Iterator[tuple[np.ndarray, np.ndarray, np.int16]]:
        worker = torch.utils.data.get_worker_info()
        worker_id = worker.id if worker is not None else 0
        worker_count = worker.num_workers if worker is not None else 1
        seed_parts = [self.seed & 0xFFFFFFFF, (self.seed >> 32) & 0xFFFFFFFF]
        shard_random = np.random.default_rng(np.random.SeedSequence(seed_parts))
        shard_order = shard_random.permutation(len(self.shard_paths))
        for shard_index in shard_order[worker_id::worker_count]:
            index = int(shard_index)
            side, opponent, score = load_shard(
                self.shard_paths[index], self.profile
            )
            row_random = np.random.default_rng(
                np.random.SeedSequence(seed_parts + [index])
            )
            for row in row_random.permutation(len(score)):
                row_index = int(row)
                yield side[row_index], opponent[row_index], score[row_index]


def transformed_loss(
    prediction: torch.Tensor,
    target: torch.Tensor,
    score_scale: float,
    reduction: str = "mean",
) -> torch.Tensor:
    return torch.nn.functional.smooth_l1_loss(
        torch.tanh(prediction / score_scale),
        torch.tanh(target / score_scale),
        reduction=reduction,
    )


def evaluate_shards(
    network: NnueNetwork,
    shard_paths: Sequence[Path],
    batch_size: int,
    score_scale: float,
    device: torch.device,
) -> dict[str, float] | None:
    loss_sum = 0.0
    absolute_error_sum = 0.0
    position_count = 0
    network.eval()
    with torch.no_grad():
        for shard_path in shard_paths:
            side, opponent, score = load_shard(
                shard_path, network.profile
            )
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
                loss_sum += float(
                    transformed_loss(
                        prediction, target, score_scale, reduction="sum"
                    )
                )
                absolute_error_sum += float(
                    torch.nn.functional.l1_loss(
                        prediction, target, reduction="sum"
                    )
                )
                position_count += len(target)
    if not position_count:
        return None
    return {
        "loss": loss_sum / position_count,
        "centipawn_mae": absolute_error_sum / position_count,
    }


def select_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested == "cuda" and not torch.cuda.is_available():
        raise ValueError("cuda requested but unavailable")
    return torch.device(requested)


def create_training_loader(
    shard_paths: Sequence[Path],
    batch_size: int,
    workers: int,
    seed: int,
    device: torch.device,
    profile: NnueProfile,
) -> torch.utils.data.DataLoader:
    arguments: dict[str, Any] = {
        "dataset": ShardDataset(shard_paths, seed, profile),
        "batch_size": batch_size,
        "num_workers": workers,
        "pin_memory": device.type == "cuda",
        "generator": torch.Generator().manual_seed(seed),
    }
    if workers:
        arguments["prefetch_factor"] = 1
    return torch.utils.data.DataLoader(**arguments)


def training_batches(
    shard_paths: Sequence[Path],
    batch_size: int,
    seed: int,
    profile: NnueProfile,
) -> Iterator[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    seed_parts = [seed & 0xFFFFFFFF, (seed >> 32) & 0xFFFFFFFF]
    shard_random = np.random.default_rng(np.random.SeedSequence(seed_parts))
    for shard_index in shard_random.permutation(len(shard_paths)):
        index = int(shard_index)
        side, opponent, score = load_shard(shard_paths[index], profile)
        row_random = np.random.default_rng(
            np.random.SeedSequence(seed_parts + [index])
        )
        order = row_random.permutation(len(score))
        for start in range(0, len(order), batch_size):
            rows = order[start : start + batch_size]
            yield side[rows], opponent[rows], score[rows]


def train_baseline(
    data_path: str | Path,
    output_path: str | Path,
    *,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    seed: int,
    score_scale: float,
    requested_device: str,
    workers: int,
    weight_decay: float,
    evaluate_test: bool = True,
) -> dict[str, Any]:
    if epochs <= 0 or batch_size <= 0 or learning_rate <= 0:
        raise ValueError("epochs batch size and learning rate must be positive")
    if score_scale <= 0 or workers < 0 or weight_decay < 0:
        raise ValueError("score scale workers and weight decay are invalid")

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    device = select_device(requested_device)
    manifest, dataset_directory = load_dataset_manifest(data_path)
    profile = dataset_profile(manifest)
    shard_paths = {
        split: split_shard_paths(manifest, dataset_directory, split)
        for split in ("train", "validation", "test")
    }
    split_counts = manifest["split_counts"]
    for split in ("train", "validation", "test"):
        if not shard_paths[split] or not split_counts.get(split, 0):
            raise ValueError(f"{split} split is empty")

    network = NnueNetwork(profile).to(device)
    optimizer = torch.optim.AdamW(
        network.parameters(), lr=learning_rate, weight_decay=weight_decay
    )
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    best_epoch = 0
    best_validation: dict[str, float] | None = None
    last_training_loss = 0.0
    constraint_events = {
        "feature_weights": 0,
        "feature_bias": 0,
        "output_weights": 0,
        "output_bias": 0,
    }

    for epoch in range(1, epochs + 1):
        epoch_seed = seed + epoch - 1
        loader: Any
        if workers:
            loader = create_training_loader(
                shard_paths["train"],
                batch_size,
                workers,
                epoch_seed,
                device,
                profile,
            )
        else:
            loader = training_batches(
                shard_paths["train"], batch_size, epoch_seed, profile
            )
        network.train()
        loss_sum = 0.0
        training_count = 0
        for side_values, opponent_values, score_values in loader:
            side = torch.as_tensor(
                side_values, device=device, dtype=torch.long
            )
            opponent = torch.as_tensor(
                opponent_values, device=device, dtype=torch.long
            )
            target = torch.as_tensor(
                score_values, device=device, dtype=torch.float32
            )
            prediction = network(side, opponent)
            loss = transformed_loss(prediction, target, score_scale)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.detach()) * len(target)
            training_count += len(target)
        if training_count != split_counts["train"]:
            raise RuntimeError("training loader count mismatch")
        last_training_loss = loss_sum / training_count
        epoch_constraints = constrain_quantized_parameters(network)
        for name, count in epoch_constraints.items():
            constraint_events[name] += count
        validation = evaluate_shards(
            network,
            shard_paths["validation"],
            batch_size,
            score_scale,
            device,
        )
        if validation is None:
            raise RuntimeError("validation split is empty")
        is_best = (
            best_validation is None
            or validation["loss"] < best_validation["loss"]
        )
        if is_best:
            best_epoch = epoch
            best_validation = validation
            torch.save(network.state_dict(), output_path)
        marker = " best" if is_best else ""
        print(
            f"epoch {epoch} train_loss {last_training_loss:.6f} "
            f"validation_loss {validation['loss']:.6f} "
            f"validation_mae {validation['centipawn_mae']:.2f} "
            f"constraint_hits {sum(epoch_constraints.values())}{marker}"
        )

    if best_validation is None or not best_epoch:
        raise RuntimeError("no validation checkpoint selected")
    network.load_state_dict(
        torch.load(output_path, map_location=device, weights_only=True)
    )
    test_metrics = None
    if evaluate_test:
        test_metrics = evaluate_shards(
            network,
            shard_paths["test"],
            batch_size,
            score_scale,
            device,
        )
        if test_metrics is None:
            raise RuntimeError("test split is empty")
        print(
            f"best_epoch {best_epoch} test_loss {test_metrics['loss']:.6f} "
            f"test_mae {test_metrics['centipawn_mae']:.2f}"
        )
    else:
        print(f"best_epoch {best_epoch} test_skipped")

    manifest_path = (
        Path(data_path) / "manifest.json"
        if Path(data_path).is_dir()
        else Path(data_path)
    )
    device_description = {
        "type": str(device),
        "name": (
            torch.cuda.get_device_name(device)
            if device.type == "cuda"
            else "cpu"
        ),
    }
    training_manifest = {
        "architecture": {
            "activation": "clipped_relu",
            "activation_clip": ACTIVATION_CLIP,
            "bucket_count": profile.bucket_count,
            "feature_count": profile.feature_count,
            "feature_mapping_version": FEATURE_MAPPING_VERSION,
            "feature_quantization": FEATURE_QUANTIZATION,
            "features_per_bucket": FEATURES_PER_BUCKET,
            "hidden_width": profile.hidden_width,
            "model_byte_size": profile.model_bytes,
            "model_format_version": MODEL_FORMAT_VERSION,
            "output_quantization": OUTPUT_QUANTIZATION,
            "perspective_order": ["side_to_move", "opponent"],
            "profile": profile.name,
            "training_parameter_count": profile.training_parameter_count,
        },
        "best_epoch": best_epoch,
        "checkpoint_selection": {
            "metric": "validation_loss",
            "rule": CHECKPOINT_SELECTION_RULE,
        },
        "dataset": {
            "description": "prepared sharded teacher centipawn dataset",
            "evaluation_import": manifest.get("evaluation_import"),
            "feature_mapping_version": manifest["feature_mapping_version"],
            "format_version": manifest["format_version"],
            "manifest_path": manifest_path.name,
            "profile": profile.name,
            "source": manifest["source"],
            "split_counts": split_counts,
            "teacher": {
                "engine": manifest["teacher_engine"],
                "node_budget": manifest["teacher_node_budget"],
            },
        },
        "determinism": (
            "parameter initialization and shard row order are seeded "
            "gpu kernels and different library versions may still vary"
        ),
        "device": device_description,
        "format_version": TRAINING_MANIFEST_VERSION,
        "last_training_loss": last_training_loss,
        "numpy_version": np.__version__,
        "pytorch_version": str(torch.__version__),
        "seed": seed,
        "test_evaluation": (
            "evaluated after validation selection"
            if evaluate_test
            else "skipped during architecture selection"
        ),
        "test_metrics": test_metrics,
        "training_parameters": {
            "batch_size": batch_size,
            "epochs": epochs,
            "learning_rate": learning_rate,
            "optimizer": "adamw",
            "score_scale": score_scale,
            "weight_decay": weight_decay,
            "workers": workers,
        },
        "quantization_range_constraints": {
            "application": "after each training epoch before validation",
            "events": constraint_events,
            "feature_bias": [
                ACCUMULATOR_BIAS_MIN / FEATURE_QUANTIZATION,
                ACCUMULATOR_BIAS_MAX / FEATURE_QUANTIZATION,
            ],
            "feature_weights": [
                -128 / FEATURE_QUANTIZATION,
                127 / FEATURE_QUANTIZATION,
            ],
            "output_bias": [
                -(2**31) / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION),
                (2**31 - 1)
                / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION),
            ],
            "output_weights": [
                -32768 / OUTPUT_QUANTIZATION,
                32767 / OUTPUT_QUANTIZATION,
            ],
        },
        "validation_metrics": best_validation,
    }
    Path(str(output_path) + ".json").write_text(
        json.dumps(training_manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return training_manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="train one configured baseline nnue profile"
    )
    parser.add_argument("data")
    parser.add_argument("out")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--score-scale", type=float, default=400.0)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--evaluate-test", action="store_true")
    args = parser.parse_args()
    try:
        train_baseline(
            args.data,
            args.out,
            epochs=args.epochs,
            batch_size=args.batch,
            learning_rate=args.lr,
            seed=args.seed,
            score_scale=args.score_scale,
            requested_device=args.device,
            workers=args.workers,
            weight_decay=args.weight_decay,
            evaluate_test=args.evaluate_test,
        )
    except ValueError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
