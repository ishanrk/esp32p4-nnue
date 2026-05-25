from __future__ import annotations

import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest

import numpy as np

from export import (
    FEATURE_BIAS_OFFSET,
    HEADER_SIZE,
    MAGIC,
    OUTPUT_BIAS_OFFSET,
    build_model_blob,
    export_parameters,
    quantize_parameters,
)
from profiles import (
    ACTIVATION_CLIP,
    ACCUMULATOR_BIAS_MAX,
    DEFAULT_PROFILE,
    FEATURES_PER_BUCKET,
    FEATURE_QUANTIZATION,
    FEATURE_MAPPING_VERSION,
    MODEL_FORMAT_VERSION,
    NnueProfile,
    OUTPUT_QUANTIZATION,
    PERSPECTIVE_COUNT,
    get_profile,
)
from integer import evaluate_integer, load_exported_model


PROFILE = get_profile(
    os.environ.get("P4_NNUE_PROFILE", DEFAULT_PROFILE.name)
)


def fixture_parameters(
    profile: NnueProfile = PROFILE,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    feature_values = (
        (
            np.arange(
                profile.feature_count * profile.hidden_width,
                dtype=np.int64,
            )
            * 17
        )
        % 7
    ) - 3
    feature_weights = feature_values.reshape(
        profile.feature_count, profile.hidden_width
    ).astype(np.float32) / FEATURE_QUANTIZATION
    feature_bias = (
        np.arange(profile.hidden_width, dtype=np.float32)
        - profile.hidden_width // 2
    ) / FEATURE_QUANTIZATION
    output_weights = (
        (
            (np.arange(2 * profile.hidden_width, dtype=np.float32) % 11)
            - 5
        )
        * 100
    ) / OUTPUT_QUANTIZATION
    output_bias = 123 / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION)
    return feature_weights, feature_bias, output_weights, output_bias


def fixture_training_manifest(profile: NnueProfile = PROFILE) -> dict:
    return {
        "architecture": {
            "activation": "clipped_relu",
            "activation_clip": 127,
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
        "best_epoch": 2,
        "checkpoint_selection": {
            "metric": "validation_loss",
            "rule": "minimum validation transformed smooth l1",
        },
        "dataset": {
            "description": "deterministic integer fixture",
            "source": {
                "attribution": "esp32p4-nnue test fixture",
                "description": "deterministic integer fixture",
                "license": None,
            },
            "split_counts": {"train": 3, "validation": 2, "test": 2},
            "teacher": {
                "engine": {"author": "tests", "name": "fixture teacher"},
                "node_budget": 100,
            },
        },
        "device": {"name": "test", "type": "cpu"},
        "determinism": "deterministic fixture",
        "format_version": 1,
        "numpy_version": np.__version__,
        "pytorch_version": "test",
        "quantization_range_constraints": {
            "application": "test fixture",
            "events": {
                "feature_bias": 0,
                "feature_weights": 0,
                "output_bias": 0,
                "output_weights": 0,
            },
        },
        "seed": 7,
        "test_metrics": {"centipawn_mae": 3.0, "loss": 0.03},
        "training_parameters": {
            "batch_size": 2,
            "epochs": 2,
            "learning_rate": 0.001,
            "optimizer": "adamw",
            "score_scale": 400.0,
            "weight_decay": 0.01,
            "workers": 0,
        },
        "validation_metrics": {"centipawn_mae": 2.0, "loss": 0.02},
    }


class ExportTest(unittest.TestCase):
    def test_header_layout_and_little_endian_fields(self) -> None:
        quantized, _ = quantize_parameters(*fixture_parameters(), PROFILE)
        blob = build_model_blob(quantized, PROFILE)
        expected_header = b"".join(
            (
                MAGIC,
                struct.pack("<H", MODEL_FORMAT_VERSION),
                struct.pack("<H", PROFILE.bucket_count),
                struct.pack("<H", FEATURES_PER_BUCKET),
                struct.pack("<H", PROFILE.hidden_width),
                struct.pack("<H", ACTIVATION_CLIP),
                struct.pack("<H", FEATURE_QUANTIZATION),
                struct.pack("<H", OUTPUT_QUANTIZATION),
                struct.pack("<H", PERSPECTIVE_COUNT),
                struct.pack("<I", PROFILE.model_bytes),
            )
        )
        self.assertEqual(HEADER_SIZE, 28)
        self.assertEqual(OUTPUT_BIAS_OFFSET, 28)
        self.assertEqual(FEATURE_BIAS_OFFSET, 32)
        self.assertEqual(len(expected_header), HEADER_SIZE)
        self.assertEqual(blob[:HEADER_SIZE], expected_header)
        self.assertEqual(
            blob[OUTPUT_BIAS_OFFSET:FEATURE_BIAS_OFFSET],
            struct.pack("<i", quantized["output_bias"]),
        )
        negative_bias = dict(quantized)
        negative_bias["output_bias"] = -2
        negative_blob = build_model_blob(negative_bias, PROFILE)
        self.assertEqual(
            negative_blob[OUTPUT_BIAS_OFFSET:FEATURE_BIAS_OFFSET],
            b"\xfe\xff\xff\xff",
        )

    def test_export_manifest_and_python_c_agreement(self) -> None:
        c_eval_tool = os.environ.get("P4_EVAL_TOOL")
        if not c_eval_tool:
            self.skipTest("P4_EVAL_TOOL is not set")
        with tempfile.TemporaryDirectory() as temporary:
            model_path = Path(temporary) / "fixture.bin"
            manifest_path = Path(temporary) / "fixture.bin.json"
            manifest = export_parameters(
                model_path,
                manifest_path,
                fixture_training_manifest(),
                *fixture_parameters(),
            )
            self.assertEqual(model_path.stat().st_size, PROFILE.model_bytes)
            self.assertEqual(manifest["model_byte_size"], PROFILE.model_bytes)
            self.assertEqual(
                manifest["model_format_version"], MODEL_FORMAT_VERSION
            )
            self.assertEqual(manifest["feature_count"], PROFILE.feature_count)
            self.assertEqual(
                manifest["export_saturation_counts"],
                {
                    "feature_weights": 0,
                    "feature_bias": 0,
                    "output_weights": 0,
                    "output_bias": 0,
                },
            )
            self.assertNotIn("hash", json.dumps(manifest).lower())
            loaded = load_exported_model(model_path)
            fens = (
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
                "7k/8/8/8/8/8/P7/K7 w - - 0 1",
                "7k/8/8/8/8/8/P7/K7 b - - 0 1",
                "4k3/8/8/8/7q/8/Q7/4K3 w - - 0 1",
                "4k3/8/8/8/7q/8/Q7/4K3 b - - 0 1",
            )
            python_scores = [evaluate_integer(loaded, fen) for fen in fens]
            result = subprocess.run(
                [c_eval_tool, str(model_path)],
                input="\n".join(fens) + "\n",
                check=True,
                capture_output=True,
                text=True,
            )
            c_scores = [int(line) for line in result.stdout.splitlines()]
            self.assertEqual(c_scores, python_scores)
            self.assertGreater(len(set(python_scores)), 1)

    def test_saturation_and_nonfinite_parameters_fail(self) -> None:
        feature_weights, feature_bias, output_weights, output_bias = (
            fixture_parameters()
        )
        bad_feature_weights = feature_weights.copy()
        bad_feature_weights[0, 0] = 128 / FEATURE_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"feature_weights": 1'):
            quantize_parameters(
                bad_feature_weights,
                feature_bias,
                output_weights,
                output_bias,
                PROFILE,
            )

        bad_feature_bias = feature_bias.copy()
        bad_feature_bias[0] = (
            ACCUMULATOR_BIAS_MAX + 1
        ) / FEATURE_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"feature_bias": 1'):
            quantize_parameters(
                feature_weights,
                bad_feature_bias,
                output_weights,
                output_bias,
                PROFILE,
            )

        bad_output_weights = output_weights.copy()
        bad_output_weights[0] = 32768 / OUTPUT_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"output_weights": 1'):
            quantize_parameters(
                feature_weights,
                feature_bias,
                bad_output_weights,
                output_bias,
                PROFILE,
            )

        bad_output_bias = (2**31) / (
            FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION
        )
        with self.assertRaisesRegex(ValueError, '"output_bias": 1'):
            quantize_parameters(
                feature_weights,
                feature_bias,
                output_weights,
                bad_output_bias,
                PROFILE,
            )

        nonfinite = feature_weights.copy()
        nonfinite[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "nonfinite"):
            quantize_parameters(
                nonfinite,
                feature_bias,
                output_weights,
                output_bias,
                PROFILE,
            )


if __name__ == "__main__":
    unittest.main()
