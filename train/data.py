from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from features import (
    FEATURE_COUNT,
    FEATURES_PER_BUCKET,
    FORMAT_VERSION,
    HIDDEN_SIZE,
    KING_BUCKET_COUNT,
    MAX_ACTIVE_FEATURES,
    PADDING_FEATURE,
)

DATASET_FORMAT_VERSION = 1
SCORE_LIMIT = 30000
SCORE_PERSPECTIVE = "side_to_move"
SPLITS = ("train", "validation", "test")
FEATURE_DTYPE = np.dtype(np.uint16)
LABEL_DTYPE = np.dtype(np.int16)
_MASK_64 = (1 << 64) - 1


def clip_score(score: int) -> int:
    if isinstance(score, bool) or not isinstance(score, int):
        raise ValueError("score must be an integer")
    return max(-SCORE_LIMIT, min(SCORE_LIMIT, score))


def _mix_split_value(value: int) -> int:
    value = (value + 0x9E3779B97F4A7C15) & _MASK_64
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & _MASK_64
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & _MASK_64
    return value ^ (value >> 31)


def validate_split_percentages(
    validation_percent: int, test_percent: int
) -> None:
    if validation_percent < 0 or test_percent < 0:
        raise ValueError("split percentages must be nonnegative")
    if validation_percent + test_percent >= 100:
        raise ValueError("training split must be nonempty")


def assign_game_split(
    game_id: int,
    seed: int,
    validation_percent: int = 5,
    test_percent: int = 5,
) -> str:
    if game_id < 0:
        raise ValueError("game id must be nonnegative")
    validate_split_percentages(validation_percent, test_percent)
    bucket = _mix_split_value((seed + game_id) & _MASK_64) % 100
    train_percent = 100 - validation_percent - test_percent
    if bucket < train_percent:
        return "train"
    if bucket < train_percent + validation_percent:
        return "validation"
    return "test"


def load_dataset_manifest(
    path: str | Path,
) -> tuple[dict[str, Any], Path]:
    dataset_path = Path(path)
    manifest_path = (
        dataset_path / "manifest.json" if dataset_path.is_dir()
        else dataset_path
    )
    with manifest_path.open(encoding="utf-8") as source:
        manifest = json.load(source)
    expected = {
        "format_version": DATASET_FORMAT_VERSION,
        "feature_mapping_version": FORMAT_VERSION,
        "king_buckets": KING_BUCKET_COUNT,
        "features_per_bucket": FEATURES_PER_BUCKET,
        "feature_count": FEATURE_COUNT,
        "hidden_width": HIDDEN_SIZE,
        "padding_feature": PADDING_FEATURE,
        "feature_dtype": FEATURE_DTYPE.name,
        "label_dtype": LABEL_DTYPE.name,
        "score_perspective": SCORE_PERSPECTIVE,
        "score_clip": {
            "minimum": -SCORE_LIMIT,
            "maximum": SCORE_LIMIT,
            "rule": "clamp",
        },
    }
    for field, value in expected.items():
        if manifest.get(field) != value:
            raise ValueError(f"incompatible manifest field {field}")
    if set(manifest.get("shards", {})) != set(SPLITS):
        raise ValueError("manifest must list every split")
    return manifest, manifest_path.parent


def split_shard_paths(
    manifest: dict[str, Any], dataset_directory: Path, split: str
) -> list[Path]:
    if split not in SPLITS:
        raise ValueError("bad split")
    return [dataset_directory / name for name in manifest["shards"][split]]


def load_shard(path: str | Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    with np.load(path, allow_pickle=False) as shard:
        if set(shard.files) != {"side", "opponent", "score"}:
            raise ValueError(f"bad shard arrays in {path}")
        side = shard["side"]
        opponent = shard["opponent"]
        score = shard["score"]
    if side.dtype != FEATURE_DTYPE or opponent.dtype != FEATURE_DTYPE:
        raise ValueError(f"bad feature dtype in {path}")
    if score.dtype != LABEL_DTYPE:
        raise ValueError(f"bad label dtype in {path}")
    if side.ndim != 2 or side.shape[1] != MAX_ACTIVE_FEATURES:
        raise ValueError(f"bad side feature shape in {path}")
    if opponent.shape != side.shape or score.shape != (len(side),):
        raise ValueError(f"bad shard shape in {path}")
    if np.any(side > FEATURE_COUNT) or np.any(opponent > FEATURE_COUNT):
        raise ValueError(f"feature out of range in {path}")
    if np.any(score < -SCORE_LIMIT) or np.any(score > SCORE_LIMIT):
        raise ValueError(f"label out of range in {path}")
    return side, opponent, score
