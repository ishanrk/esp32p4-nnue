from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from data import (
    DATASET_FORMAT_VERSION,
    FEATURE_DTYPE,
    LABEL_DTYPE,
    SCORE_LIMIT,
    SCORE_PERSPECTIVE,
    SPLITS,
    clip_score,
)
from features import (
    FEATURES_PER_BUCKET,
    FORMAT_VERSION,
    MAX_ACTIVE_FEATURES,
    encode_position,
)
from profiles import DEFAULT_PROFILE, PROFILE_BY_NAME, NnueProfile, get_profile


def _write_shard(
    output_directory: Path,
    split: str,
    shard_index: int,
    buffer: dict[str, Any],
) -> str:
    name = f"{split}_{shard_index:05d}.npz"
    count = buffer["count"]
    np.savez_compressed(
        output_directory / name,
        side=buffer["side"][:count],
        opponent=buffer["opponent"][:count],
        score=buffer["score"][:count],
    )
    buffer["count"] = 0
    return name


def _new_buffer(shard_size: int) -> dict[str, Any]:
    return {
        "side": np.empty(
            (shard_size, MAX_ACTIVE_FEATURES), dtype=FEATURE_DTYPE
        ),
        "opponent": np.empty(
            (shard_size, MAX_ACTIVE_FEATURES), dtype=FEATURE_DTYPE
        ),
        "score": np.empty(shard_size, dtype=LABEL_DTYPE),
        "count": 0,
    }


def _load_source_metadata(
    source_path: Path, metadata_path: str | Path | None
) -> dict[str, Any]:
    path = (
        Path(metadata_path)
        if metadata_path is not None
        else Path(str(source_path) + ".meta.json")
    )
    if not path.exists() and metadata_path is not None:
        raise ValueError("metadata file does not exist")
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as source:
        metadata = json.load(source)
    if metadata.get("score_perspective") != SCORE_PERSPECTIVE:
        raise ValueError("source scores must use side to move perspective")
    return metadata


def prepare_dataset(
    source_path: str | Path,
    output_directory: str | Path,
    *,
    shard_size: int = 100000,
    metadata_path: str | Path | None = None,
    profile: NnueProfile = DEFAULT_PROFILE,
    limit: int | None = None,
) -> dict[str, Any]:
    if shard_size <= 0:
        raise ValueError("shard size must be positive")
    if limit is not None and limit <= 0:
        raise ValueError("limit must be positive")
    source_path = Path(source_path)
    output_directory = Path(output_directory)
    if output_directory.exists() and any(output_directory.iterdir()):
        raise ValueError("output directory must be empty")
    output_directory.mkdir(parents=True, exist_ok=True)
    metadata = _load_source_metadata(source_path, metadata_path)
    buffers = {split: _new_buffer(shard_size) for split in SPLITS}
    split_counts = {split: 0 for split in SPLITS}
    shards = {split: [] for split in SPLITS}
    current_game_id = -1
    current_game_split = None
    position_count = 0

    with source_path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
                if not isinstance(record, dict):
                    raise ValueError("record must be an object")
                game_id = record["game_id"]
                split = record["split"]
                fen = record["fen"]
                if isinstance(game_id, bool) or not isinstance(game_id, int):
                    raise ValueError("game id must be an integer")
                if game_id < 0:
                    raise ValueError("game id must be nonnegative")
                if split not in SPLITS:
                    raise ValueError("bad split")
                if not isinstance(fen, str):
                    raise ValueError("fen must be text")
                if game_id < current_game_id:
                    raise ValueError("games must be grouped in source order")
                if game_id == current_game_id and current_game_split != split:
                    raise ValueError("game crosses dataset splits")
                if game_id > current_game_id:
                    current_game_id = game_id
                    current_game_split = split
                side, opponent = encode_position(fen, profile)
                score = clip_score(record["score"])
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{source_path}:{line_number}: {error}"
                ) from error

            buffer = buffers[split]
            index = buffer["count"]
            buffer["side"][index] = side
            buffer["opponent"][index] = opponent
            buffer["score"][index] = score
            buffer["count"] += 1
            split_counts[split] += 1
            position_count += 1
            if buffer["count"] == shard_size:
                shards[split].append(
                    _write_shard(
                        output_directory,
                        split,
                        len(shards[split]),
                        buffer,
                    )
                )
            if limit is not None and position_count >= limit:
                break

    if not position_count:
        raise ValueError("empty labeled data")
    for split in SPLITS:
        if buffers[split]["count"]:
            shards[split].append(
                _write_shard(
                    output_directory,
                    split,
                    len(shards[split]),
                    buffers[split],
                )
            )

    manifest = {
        "feature_dtype": FEATURE_DTYPE.name,
        "feature_count": profile.feature_count,
        "feature_mapping_version": FORMAT_VERSION,
        "features_per_bucket": FEATURES_PER_BUCKET,
        "format_version": DATASET_FORMAT_VERSION,
        "hidden_width": profile.hidden_width,
        "king_buckets": profile.bucket_count,
        "label_dtype": LABEL_DTYPE.name,
        "max_ply": metadata.get("max_ply"),
        "min_ply": metadata.get("min_ply"),
        "padding_feature": profile.padding_feature,
        "position_count": position_count,
        "position_limit": limit,
        "profile": profile.name,
        "sampling_stride": metadata.get("stride"),
        "score_clip": {
            "maximum": SCORE_LIMIT,
            "minimum": -SCORE_LIMIT,
            "rule": "clamp",
        },
        "score_perspective": SCORE_PERSPECTIVE,
        "shard_counts": {
            split: len(shards[split]) for split in SPLITS
        },
        "shard_size": shard_size,
        "shards": shards,
        "split_counts": split_counts,
        "split_percent": metadata.get("split_percent"),
        "split_seed": metadata.get("split_seed"),
        "source": {
            "attribution": metadata.get("data_attribution"),
            "description": metadata.get("data_source"),
            "license": metadata.get("data_license"),
        },
        "teacher_engine": metadata.get("engine"),
        "teacher_node_budget": metadata.get("node_budget"),
    }
    if metadata.get("import_format_version") is not None:
        manifest["evaluation_import"] = {
            field: metadata.get(field)
            for field in (
                "accepted_records",
                "depth_distribution",
                "eligible_records",
                "evaluation_selection_rule",
                "import_format_version",
                "knode_distribution",
                "mate_fraction",
                "minimum_depth",
                "piece_count_distribution",
                "records_scanned",
                "rejection_counts",
                "score_distribution",
                "score_perspective_conversion",
                "selection_denominator",
                "selection_rule",
                "selection_seed",
                "side_to_move_counts",
                "source_advertised_positions",
                "source_date",
                "usable_records",
            )
        }
    (output_directory / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="encode labeled positions into bounded sparse shards"
    )
    parser.add_argument("src")
    parser.add_argument("out")
    parser.add_argument("--shard-size", type=int, default=100000)
    parser.add_argument("--metadata")
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--profile", choices=tuple(PROFILE_BY_NAME), default=DEFAULT_PROFILE.name
    )
    args = parser.parse_args()
    manifest = prepare_dataset(
        args.src,
        args.out,
        shard_size=args.shard_size,
        metadata_path=args.metadata,
        profile=get_profile(args.profile),
        limit=args.limit,
    )
    print(sum(manifest["split_counts"].values()))


if __name__ == "__main__":
    main()
