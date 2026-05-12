from __future__ import annotations

from pathlib import Path
import unittest

from features import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    MAX_ACTIVE_FEATURES,
    active_feature_indices,
    encode_feature_indices,
    feature_index,
    king_bucket,
    king_mirror,
)
from profiles import MODEL_SIZE_LIMIT, PROFILES, get_profile


FIXTURES = Path(__file__).parents[1] / "test" / "nnue_features.txt"


class FeatureMappingTest(unittest.TestCase):
    def test_shared_fixtures(self) -> None:
        fixture_profile = get_profile("8x64")
        fixture_count = 0
        for raw_line in FIXTURES.read_text(encoding="utf-8").splitlines():
            if not raw_line or raw_line.startswith("#"):
                continue
            name, fen, perspective_text, bucket_text, features_text = (
                raw_line.split("|")
            )
            perspective = int(perspective_text)
            expected = sorted(int(value) for value in features_text.split(","))
            bucket, actual = active_feature_indices(
                fen, perspective, fixture_profile
            )
            self.assertEqual(bucket, int(bucket_text), name)
            self.assertEqual(sorted(actual), expected, name)
            self.assertTrue(
                all(
                    0 <= index < fixture_profile.feature_count
                    for index in actual
                )
            )
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

    def test_profile_bucket_regions(self) -> None:
        for profile in PROFILES:
            rank_bands = profile.bucket_count // 4
            buckets = set()
            for square in range(64):
                file = square & 7
                rank = square >> 3
                normalized_file = file if file < 4 else 7 - file
                expected = (
                    normalized_file + 4 * (rank * rank_bands // 8)
                )
                actual = king_bucket(square, 0, profile)
                self.assertEqual(actual, expected, (profile.name, square))
                self.assertEqual(
                    actual,
                    king_bucket(square ^ 56, 1, profile),
                    (profile.name, square),
                )
                buckets.add(actual)
            self.assertEqual(buckets, set(range(profile.bucket_count)))

    def test_profile_sizes(self) -> None:
        expected = {
            "4x128": (328480, 328193, 512),
            "8x64": (328096, 327937, 256),
            "8x96": (492128, 491905, 384),
            "16x48": (491840, 491713, 192),
        }
        for profile in PROFILES:
            self.assertEqual(
                (
                    profile.model_bytes,
                    profile.training_parameter_count,
                    profile.accumulator_bytes,
                ),
                expected[profile.name],
            )
            self.assertLessEqual(profile.model_bytes, MODEL_SIZE_LIMIT)


if __name__ == "__main__":
    unittest.main()
