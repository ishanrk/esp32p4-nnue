from __future__ import annotations

import argparse
from pathlib import Path
import struct
from typing import Any

import numpy as np

from export import FILE_SIZE, HEADER_SIZE, MAGIC
from features import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    ACTIVATION_CLIP,
    FEATURE_COUNT,
    FEATURES_PER_BUCKET,
    FEATURE_QUANTIZATION,
    FORMAT_VERSION,
    HIDDEN_SIZE,
    KING_BUCKET_COUNT,
    OUTPUT_QUANTIZATION,
    encode_feature_indices,
)


def load_exported_model(path: str | Path) -> dict[str, Any]:
    blob = Path(path).read_bytes()
    if len(blob) != FILE_SIZE:
        raise ValueError("bad model size")
    header = struct.unpack("<8s8HIi", blob[:HEADER_SIZE])
    expected = (
        MAGIC,
        FORMAT_VERSION,
        KING_BUCKET_COUNT,
        FEATURES_PER_BUCKET,
        HIDDEN_SIZE,
        ACTIVATION_CLIP,
        FEATURE_QUANTIZATION,
        OUTPUT_QUANTIZATION,
        0,
        FILE_SIZE,
    )
    if header[:-1] != expected:
        raise ValueError("bad model header")
    offset = HEADER_SIZE
    feature_bias = np.frombuffer(
        blob, dtype="<i2", count=HIDDEN_SIZE, offset=offset
    ).astype(np.int16, copy=True)
    offset += HIDDEN_SIZE * 2
    output_weights = np.frombuffer(
        blob, dtype="<i2", count=2 * HIDDEN_SIZE, offset=offset
    ).astype(np.int16, copy=True)
    offset += 2 * HIDDEN_SIZE * 2
    feature_weights = np.frombuffer(
        blob,
        dtype=np.int8,
        count=FEATURE_COUNT * HIDDEN_SIZE,
        offset=offset,
    ).reshape(FEATURE_COUNT, HIDDEN_SIZE).copy()
    if np.any(feature_bias < ACCUMULATOR_BIAS_MIN) or np.any(
        feature_bias > ACCUMULATOR_BIAS_MAX
    ):
        raise ValueError("unsafe feature bias")
    return {
        "feature_bias": feature_bias,
        "feature_weights": feature_weights,
        "output_bias": header[-1],
        "output_weights": output_weights,
    }


def _accumulate(
    model: dict[str, Any], active_features: list[int]
) -> np.ndarray:
    accumulator = model["feature_bias"].astype(np.int32)
    if active_features:
        accumulator += model["feature_weights"][active_features].sum(
            axis=0, dtype=np.int32
        )
    if np.any(accumulator < -32768) or np.any(accumulator > 32767):
        raise ValueError("accumulator overflow")
    return accumulator


def _truncate_division(value: int, divisor: int) -> int:
    return value // divisor if value >= 0 else -((-value) // divisor)


def evaluate_integer(model: dict[str, Any], fen: str) -> int:
    side_features, opponent_features = encode_feature_indices(fen)
    side = np.clip(
        _accumulate(model, side_features), 0, ACTIVATION_CLIP
    ).astype(np.int64)
    opponent = np.clip(
        _accumulate(model, opponent_features), 0, ACTIVATION_CLIP
    ).astype(np.int64)
    output_weights = model["output_weights"].astype(np.int64)
    score = int(model["output_bias"])
    score += int(side @ output_weights[:HIDDEN_SIZE])
    score += int(opponent @ output_weights[HIDDEN_SIZE:])
    return _truncate_division(
        score, FEATURE_QUANTIZATION * OUTPUT_QUANTIZATION
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="evaluate an exported model with runtime integer math"
    )
    parser.add_argument("model")
    parser.add_argument("fen")
    args = parser.parse_args()
    try:
        model = load_exported_model(args.model)
        score = evaluate_integer(model, args.fen)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(score)


if __name__ == "__main__":
    main()
