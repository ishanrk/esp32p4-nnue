from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import numpy as np

from export import FILE_SIZE, export_parameters, quantize_parameters
from features import (
    ACCUMULATOR_BIAS_MAX,
    FEATURE_COUNT,
    FEATURE_QUANTIZATION,
    FORMAT_VERSION,
    HIDDEN_SIZE,
    KING_BUCKET_COUNT,
    OUTPUT_QUANTIZATION,
)
from integer import evaluate_integer, load_exported_model


def fixture_parameters() -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    feature_values = (
        (np.arange(FEATURE_COUNT * HIDDEN_SIZE, dtype=np.int64) * 17) % 7
    ) - 3
    feature_weights = feature_values.reshape(
        FEATURE_COUNT, HIDDEN_SIZE
    ).astype(np.float32) / FEATURE_QUANTIZATION
    feature_bias = (
        np.arange(HIDDEN_SIZE, dtype=np.float32) - 31
    ) / FEATURE_QUANTIZATION
    output_weights = (
        ((np.arange(2 * HIDDEN_SIZE, dtype=np.float32) % 11) - 5) * 100
    ) / OUTPUT_QUANTIZATION
    output_bias = 123 / (FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION)
    return feature_weights, feature_bias, output_weights, output_bias


def fixture_training_manifest() -> dict:
    return {
        "architecture": {
            "activation": "clipped_relu",
            "activation_clip": 127,
            "bucket_count": KING_BUCKET_COUNT,
            "feature_count": FEATURE_COUNT,
            "feature_mapping_version": FORMAT_VERSION,
            "feature_quantization": FEATURE_QUANTIZATION,
            "features_per_bucket": 640,
            "hidden_width": HIDDEN_SIZE,
            "output_quantization": OUTPUT_QUANTIZATION,
            "perspective_order": ["side_to_move", "opponent"],
        },
        "best_epoch": 2,
        "checkpoint_selection": {
            "metric": "validation_loss",
            "rule": "minimum validation transformed smooth l1",
        },
        "dataset": {
            "description": "deterministic integer fixture",
            "split_counts": {"train": 3, "validation": 2, "test": 2},
        },
        "device": {"name": "test", "type": "cpu"},
        "determinism": "deterministic fixture",
        "format_version": 1,
        "numpy_version": np.__version__,
        "pytorch_version": "test",
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
            self.assertEqual(model_path.stat().st_size, FILE_SIZE)
            self.assertEqual(manifest["model_byte_size"], FILE_SIZE)
            self.assertEqual(manifest["feature_count"], FEATURE_COUNT)
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
            python_scores = []
            for fen in fens:
                python_score = evaluate_integer(loaded, fen)
                python_scores.append(python_score)
                result = subprocess.run(
                    [c_eval_tool, str(model_path), fen],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(int(result.stdout), python_score, fen)
            self.assertLess(min(python_scores), 0)
            self.assertGreater(len(set(python_scores)), 1)

    def test_saturation_and_nonfinite_parameters_fail(self) -> None:
        feature_weights, feature_bias, output_weights, output_bias = (
            fixture_parameters()
        )
        bad_feature_weights = feature_weights.copy()
        bad_feature_weights[0, 0] = 128 / FEATURE_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"feature_weights": 1'):
            quantize_parameters(
                bad_feature_weights, feature_bias, output_weights, output_bias
            )

        bad_feature_bias = feature_bias.copy()
        bad_feature_bias[0] = (
            ACCUMULATOR_BIAS_MAX + 1
        ) / FEATURE_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"feature_bias": 1'):
            quantize_parameters(
                feature_weights, bad_feature_bias, output_weights, output_bias
            )

        bad_output_weights = output_weights.copy()
        bad_output_weights[0] = 32768 / OUTPUT_QUANTIZATION
        with self.assertRaisesRegex(ValueError, '"output_weights": 1'):
            quantize_parameters(
                feature_weights, feature_bias, bad_output_weights, output_bias
            )

        bad_output_bias = (2**31) / (
            FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION
        )
        with self.assertRaisesRegex(ValueError, '"output_bias": 1'):
            quantize_parameters(
                feature_weights, feature_bias, output_weights, bad_output_bias
            )

        nonfinite = feature_weights.copy()
        nonfinite[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "nonfinite"):
            quantize_parameters(
                nonfinite, feature_bias, output_weights, output_bias
            )


if __name__ == "__main__":
    unittest.main()
