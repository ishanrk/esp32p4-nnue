from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct
from typing import Any

import numpy as np

from profiles import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    ACTIVATION_CLIP,
    DEFAULT_PROFILE,
    FEATURES_PER_BUCKET,
    FEATURE_QUANTIZATION,
    FEATURE_MAPPING_VERSION,
    MODEL_FORMAT_VERSION,
    MODEL_HEADER_SIZE,
    MODEL_OUTPUT_BIAS_SIZE,
    NnueProfile,
    OUTPUT_QUANTIZATION,
    PERSPECTIVE_COUNT,
    profile_from_dimensions,
)

MAGIC = b"P4NNUE1\0"
HEADER_SIZE = MODEL_HEADER_SIZE
OUTPUT_BIAS_OFFSET = HEADER_SIZE
FEATURE_BIAS_OFFSET = OUTPUT_BIAS_OFFSET + MODEL_OUTPUT_BIAS_SIZE
FILE_SIZE = DEFAULT_PROFILE.model_bytes
MODEL_MANIFEST_VERSION = 1
TRAINING_MANIFEST_VERSION = 1


def _quantize_array(
    values: np.ndarray,
    scale: int,
    minimum: int,
    maximum: int,
) -> tuple[np.ndarray, int]:
    if not np.all(np.isfinite(values)):
        raise ValueError("model contains nonfinite parameters")
    rounded = np.rint(values * scale)
    saturation_count = int(
        np.count_nonzero((rounded < minimum) | (rounded > maximum))
    )
    return rounded, saturation_count


def quantize_parameters(
    feature_weights: np.ndarray,
    feature_bias: np.ndarray,
    output_weights: np.ndarray,
    output_bias: float,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> tuple[dict[str, Any], dict[str, int]]:
    feature_weights = np.asarray(feature_weights)
    feature_bias = np.asarray(feature_bias)
    output_weights = np.asarray(output_weights)
    if feature_weights.shape != (
        profile.feature_count,
        profile.hidden_width,
    ):
        raise ValueError("bad feature weight shape")
    if feature_bias.shape != (profile.hidden_width,):
        raise ValueError("bad feature bias shape")
    if output_weights.shape != (2 * profile.hidden_width,):
        raise ValueError("bad output weight shape")
    if not np.isfinite(output_bias):
        raise ValueError("model contains nonfinite parameters")

    rounded_feature_weights, feature_weight_saturation = _quantize_array(
        feature_weights, FEATURE_QUANTIZATION, -128, 127
    )
    rounded_feature_bias, feature_bias_saturation = _quantize_array(
        feature_bias,
        FEATURE_QUANTIZATION,
        ACCUMULATOR_BIAS_MIN,
        ACCUMULATOR_BIAS_MAX,
    )
    rounded_output_weights, output_weight_saturation = _quantize_array(
        output_weights, OUTPUT_QUANTIZATION, -32768, 32767
    )
    rounded_output_bias = int(
        np.rint(output_bias * FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION)
    )
    output_bias_saturation = int(
        rounded_output_bias < -(2**31) or rounded_output_bias > 2**31 - 1
    )
    saturation_counts = {
        "feature_weights": feature_weight_saturation,
        "feature_bias": feature_bias_saturation,
        "output_weights": output_weight_saturation,
        "output_bias": output_bias_saturation,
    }
    if any(saturation_counts.values()):
        raise ValueError(
            "quantization saturation "
            + json.dumps(saturation_counts, sort_keys=True)
        )

    quantized = {
        "feature_weights": rounded_feature_weights.astype(np.int8),
        "feature_bias": rounded_feature_bias.astype(np.int16),
        "output_weights": rounded_output_weights.astype(np.int16),
        "output_bias": rounded_output_bias,
    }
    return quantized, saturation_counts


def build_model_blob(
    quantized: dict[str, Any],
    profile: NnueProfile = DEFAULT_PROFILE,
) -> bytes:
    header = struct.pack(
        "<8s8HI",
        MAGIC,
        MODEL_FORMAT_VERSION,
        profile.bucket_count,
        FEATURES_PER_BUCKET,
        profile.hidden_width,
        ACTIVATION_CLIP,
        FEATURE_QUANTIZATION,
        OUTPUT_QUANTIZATION,
        PERSPECTIVE_COUNT,
        profile.model_bytes,
    )
    if len(header) != HEADER_SIZE:
        raise RuntimeError("bad model header size")
    blob = (
        header
        + struct.pack("<i", quantized["output_bias"])
        + quantized["feature_bias"].astype("<i2", copy=False).tobytes()
        + quantized["output_weights"].astype("<i2", copy=False).tobytes()
        + quantized["feature_weights"].tobytes()
    )
    if len(blob) != profile.model_bytes:
        raise RuntimeError("bad model size")
    return blob


def load_checkpoint_parameters(
    checkpoint_path: str | Path,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    import torch

    from net import NnueNetwork

    network = NnueNetwork(profile)
    network.load_state_dict(
        torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    )
    network.eval()
    with torch.no_grad():
        feature_weights = (
            network.feature_transformer.weight[: profile.feature_count]
            .detach()
            .cpu()
            .numpy()
        )
        feature_bias = network.feature_bias.detach().cpu().numpy()
        output_weights = network.output.weight[0].detach().cpu().numpy()
        output_bias = float(network.output.bias[0].detach().cpu())
    return feature_weights, feature_bias, output_weights, output_bias


def validate_training_manifest(manifest: dict[str, Any]) -> NnueProfile:
    if manifest.get("format_version") != TRAINING_MANIFEST_VERSION:
        raise ValueError("incompatible training manifest version")
    architecture = manifest.get("architecture", {})
    try:
        profile = profile_from_dimensions(
            architecture["bucket_count"], architecture["hidden_width"]
        )
    except (KeyError, TypeError) as error:
        raise ValueError("training manifest has no valid profile") from error
    expected = {
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
    }
    for field, value in expected.items():
        if architecture.get(field) != value:
            raise ValueError(f"incompatible training architecture {field}")
    for field in (
        "seed",
        "training_parameters",
        "best_epoch",
        "validation_metrics",
        "test_metrics",
        "dataset",
        "checkpoint_selection",
        "determinism",
        "device",
        "numpy_version",
        "pytorch_version",
        "quantization_range_constraints",
    ):
        if field not in manifest:
            raise ValueError(f"training manifest missing {field}")
    dataset = manifest["dataset"]
    if not isinstance(dataset, dict):
        raise ValueError("training manifest has no valid dataset")
    source = dataset.get("source")
    teacher = dataset.get("teacher")
    if not isinstance(source, dict) or set(source) != {
        "attribution",
        "description",
        "license",
    }:
        raise ValueError("training manifest has no valid data source")
    if not isinstance(teacher, dict) or set(teacher) != {
        "engine",
        "node_budget",
    }:
        raise ValueError("training manifest has no valid teacher")
    return profile


def build_model_manifest(
    training_manifest: dict[str, Any], saturation_counts: dict[str, int]
) -> dict[str, Any]:
    profile = validate_training_manifest(training_manifest)
    return {
        "activation": {
            "clip": ACTIVATION_CLIP,
            "name": "clipped_relu",
        },
        "best_epoch": training_manifest["best_epoch"],
        "bucket_count": profile.bucket_count,
        "checkpoint_selection": training_manifest["checkpoint_selection"],
        "dataset": training_manifest["dataset"],
        "export_saturation_counts": saturation_counts,
        "feature_count": profile.feature_count,
        "feature_mapping_version": FEATURE_MAPPING_VERSION,
        "feature_quantization": FEATURE_QUANTIZATION,
        "features_per_bucket": FEATURES_PER_BUCKET,
        "hidden_width": profile.hidden_width,
        "manifest_version": MODEL_MANIFEST_VERSION,
        "model_byte_size": profile.model_bytes,
        "model_format_version": MODEL_FORMAT_VERSION,
        "output_quantization": OUTPUT_QUANTIZATION,
        "perspective_order": ["side_to_move", "opponent"],
        "profile": profile.name,
        "test_metrics": training_manifest["test_metrics"],
        "training_environment": {
            "device": training_manifest.get("device"),
            "numpy_version": training_manifest.get("numpy_version"),
            "pytorch_version": training_manifest.get("pytorch_version"),
        },
        "training_parameters": training_manifest["training_parameters"],
        "quantization_range_constraints": training_manifest[
            "quantization_range_constraints"
        ],
        "training_seed": training_manifest["seed"],
        "training_parameter_count": profile.training_parameter_count,
        "validation_metrics": training_manifest["validation_metrics"],
    }


def export_parameters(
    output_path: str | Path,
    manifest_path: str | Path,
    training_manifest: dict[str, Any],
    feature_weights: np.ndarray,
    feature_bias: np.ndarray,
    output_weights: np.ndarray,
    output_bias: float,
) -> dict[str, Any]:
    profile = validate_training_manifest(training_manifest)
    quantized, saturation_counts = quantize_parameters(
        feature_weights,
        feature_bias,
        output_weights,
        output_bias,
        profile,
    )
    blob = build_model_blob(quantized, profile)
    model_manifest = build_model_manifest(
        training_manifest, saturation_counts
    )
    Path(output_path).write_bytes(blob)
    Path(manifest_path).write_text(
        json.dumps(model_manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return model_manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="quantize and export the baseline runtime model"
    )
    parser.add_argument("model")
    parser.add_argument("out")
    parser.add_argument("--training-manifest")
    parser.add_argument("--manifest")
    args = parser.parse_args()
    training_manifest_path = Path(
        args.training_manifest or str(args.model) + ".json"
    )
    output_manifest_path = Path(args.manifest or str(args.out) + ".json")
    try:
        training_manifest = json.loads(
            training_manifest_path.read_text(encoding="utf-8")
        )
        profile = validate_training_manifest(training_manifest)
        parameters = load_checkpoint_parameters(args.model, profile)
        model_manifest = export_parameters(
            args.out,
            output_manifest_path,
            training_manifest,
            *parameters,
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(
        json.dumps(
            {
                "model_byte_size": model_manifest["model_byte_size"],
                "saturation_counts": model_manifest[
                    "export_saturation_counts"
                ],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
