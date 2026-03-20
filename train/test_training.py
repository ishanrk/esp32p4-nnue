from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from prep import prepare_dataset
from train import CHECKPOINT_SELECTION_RULE, train_baseline


class TrainingTest(unittest.TestCase):
    def test_fixture_training_selects_and_records_checkpoint(self) -> None:
        fixture = Path(__file__).parents[1] / "test" / "training_labels.jsonl"
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            data_path = directory / "data"
            checkpoint_path = directory / "smoke.pt"
            prepare_dataset(fixture, data_path, shard_size=2)
            manifest = train_baseline(
                data_path,
                checkpoint_path,
                epochs=2,
                batch_size=2,
                learning_rate=0.001,
                seed=7,
                score_scale=400.0,
                requested_device="cpu",
                workers=0,
                weight_decay=0.01,
            )

            self.assertTrue(checkpoint_path.is_file())
            self.assertIn(manifest["best_epoch"], (1, 2))
            self.assertEqual(
                manifest["checkpoint_selection"]["rule"],
                CHECKPOINT_SELECTION_RULE,
            )
            self.assertEqual(
                manifest["dataset"]["split_counts"],
                {"train": 3, "validation": 2, "test": 2},
            )
            self.assertIn("loss", manifest["validation_metrics"])
            self.assertIn("centipawn_mae", manifest["validation_metrics"])
            self.assertIn("centipawn_mae", manifest["test_metrics"])
            saved = json.loads(
                Path(str(checkpoint_path) + ".json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(saved, manifest)
            self.assertNotIn("hash", json.dumps(saved).lower())


if __name__ == "__main__":
    unittest.main()
