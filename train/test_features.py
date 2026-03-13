from __future__ import annotations

from pathlib import Path
import unittest

from features import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    FEATURE_COUNT,
    MAX_ACTIVE_FEATURES,
    active_feature_indices,
    encode_feature_indices,
    feature_index,
    king_bucket,
    king_mirror,
)


FIXTURES = Path(__file__).parents[1] / "test" / "nnue_features.txt"


class FeatureMappingTest(unittest.TestCase):
    def test_shared_fixtures(self) -> None:
        fixture_count = 0
        for raw_line in FIXTURES.read_text(encoding="utf-8").splitlines():
            if not raw_line or raw_line.startswith("#"):
                continue
            name, fen, perspective_text, bucket_text, features_text = (
                raw_line.split("|")
            )
            perspective = int(perspective_text)
            expected = sorted(int(value) for value in features_text.split(","))
            bucket, actual = active_feature_indices(fen, perspective)
            self.assertEqual(bucket, int(bucket_text), name)
            self.assertEqual(sorted(actual), expected, name)
            self.assertTrue(all(0 <= index < FEATURE_COUNT for index in actual))
            fixture_count += 1
        self.assertEqual(fixture_count, 10)

    def test_side_to_move_order(self) -> None:
        white_fen = "4k3/8/8/8/7q/8/Q7/4K3 w - - 0 1"
        black_fen = "4k3/8/8/8/7q/8/Q7/4K3 b - - 0 1"
        white_side, white_opponent = encode_feature_indices(white_fen)
        black_side, black_opponent = encode_feature_indices(black_fen)
        self.assertEqual(sorted(white_side), sorted(black_opponent))
        self.assertEqual(sorted(white_opponent), sorted(black_side))

    def test_horizontal_king_symmetry(self) -> None:
        self.assertFalse(king_mirror(3, 0))
        self.assertTrue(king_mirror(4, 0))
        self.assertEqual(king_bucket(3, 0), king_bucket(4, 0))
        left = feature_index(3, 0, 8, 0)
        right = feature_index(4, 0, 15, 0)
        self.assertEqual(left, right)

    def test_vertical_perspective_normalization(self) -> None:
        self.assertEqual(king_bucket(4, 0), king_bucket(60, 1))
        white = feature_index(4, 0, 8, 0)
        black = feature_index(60, 6, 48, 1)
        self.assertEqual(white, black)

    def test_accumulator_range(self) -> None:
        self.assertGreaterEqual(
            ACCUMULATOR_BIAS_MIN + MAX_ACTIVE_FEATURES * -128, -32768
        )
        self.assertLessEqual(
            ACCUMULATOR_BIAS_MAX + MAX_ACTIVE_FEATURES * 127, 32767
        )


if __name__ == "__main__":
    unittest.main()
