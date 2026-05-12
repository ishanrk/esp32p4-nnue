from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from data import dataset_profile, load_dataset_manifest, split_shard_paths
from net import NnueNetwork
from train import evaluate_shards, select_device


def evaluate_test_split(
    data_path: str | Path,
    checkpoint_path: str | Path,
    *,
    requested_device: str,
) -> dict[str, float]:
    checkpoint_path = Path(checkpoint_path)
    training_manifest_path = Path(str(checkpoint_path) + ".json")
    training_manifest = json.loads(
        training_manifest_path.read_text(encoding="utf-8")
    )
    if training_manifest.get("test_metrics") is not None:
        raise ValueError("test split has already been evaluated")
    dataset_manifest, dataset_directory = load_dataset_manifest(data_path)
    profile = dataset_profile(dataset_manifest)
    architecture = training_manifest.get("architecture", {})
    if architecture.get("profile") != profile.name:
        raise ValueError("checkpoint and dataset profiles differ")
    parameters = training_manifest.get("training_parameters", {})
    batch_size = parameters.get("batch_size")
    score_scale = parameters.get("score_scale")
    if not isinstance(batch_size, int) or batch_size <= 0:
        raise ValueError("training manifest has no valid batch size")
    if not isinstance(score_scale, (int, float)) or score_scale <= 0:
        raise ValueError("training manifest has no valid score scale")
    device = select_device(requested_device)
    network = NnueNetwork(profile).to(device)
    network.load_state_dict(
        torch.load(checkpoint_path, map_location=device, weights_only=True)
    )
    metrics = evaluate_shards(
        network,
        split_shard_paths(dataset_manifest, dataset_directory, "test"),
        batch_size,
        float(score_scale),
        device,
    )
    if metrics is None:
        raise ValueError("test split is empty")
    training_manifest["test_evaluation"] = (
        "evaluated once after architecture and checkpoint selection"
    )
    training_manifest["test_metrics"] = metrics
    training_manifest_path.write_text(
        json.dumps(training_manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(
        description="evaluate one selected checkpoint on the untouched test split"
    )
    parser.add_argument("data")
    parser.add_argument("checkpoint")
    parser.add_argument(
        "--device", choices=("auto", "cpu", "cuda"), default="auto"
    )
    args = parser.parse_args()
    try:
        metrics = evaluate_test_split(
            args.data, args.checkpoint, requested_device=args.device
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(metrics, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
