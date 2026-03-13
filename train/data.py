from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

from features import FEATURE_COUNT, MAX_ACTIVE_FEATURES, encode_feature_indices


def encode_position(fen: str) -> tuple[np.ndarray, np.ndarray]:
    encoded = []
    for active in encode_feature_indices(fen):
        features = np.full(MAX_ACTIVE_FEATURES, FEATURE_COUNT, dtype=np.int64)
        features[:len(active)] = active
        encoded.append(features)
    return encoded[0], encoded[1]


def load_csv(path: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    side_features = []
    opponent_features = []
    labels = []
    with Path(path).open(newline="", encoding="utf-8") as source:
        reader = csv.reader(source)
        for row in reader:
            if not row or row[0].lower() == "fen":
                continue
            side, opponent = encode_position(row[0])
            side_features.append(side)
            opponent_features.append(opponent)
            labels.append(float(row[1]))
    if not side_features:
        raise ValueError("empty data")
    return (
        np.stack(side_features),
        np.stack(opponent_features),
        np.asarray(labels, dtype=np.float32),
    )
