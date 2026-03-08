from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

KING_BUCKET_COUNT = 8
FEATURES_PER_BUCKET = 640
HIDDEN_SIZE = 64
FEATURE_COUNT = KING_BUCKET_COUNT * FEATURES_PER_BUCKET
MAX_ACTIVE_FEATURES = 30
PIECE_INDEX = {symbol: index for index, symbol in enumerate("PNBRQKpnbrqk")}


def king_bucket(square: int, perspective: int) -> int:
    if perspective:
        square ^= 56
    file = square & 7
    rank = square >> 3
    if file > 3:
        file = 7 - file
    return file + (4 if rank >= 4 else 0)


def feature_index(
    piece: int, square: int, perspective: int, bucket: int
) -> int | None:
    piece_type = piece % 6
    if piece_type == 5:
        return None
    if perspective:
        square ^= 56
    own_piece = (piece >= 6) == bool(perspective)
    piece_class = piece_type if own_piece else 5 + piece_type
    return bucket * FEATURES_PER_BUCKET + piece_class * 64 + square


def encode_position(fen: str) -> tuple[np.ndarray, np.ndarray]:
    fields = fen.split()
    if len(fields) < 2:
        raise ValueError("bad fen")
    board = fields[0]
    side = 0 if fields[1] == "w" else 1
    pieces: list[tuple[int, int]] = []
    kings = [-1, -1]
    rank = 7
    file = 0
    for symbol in board:
        if symbol == "/":
            rank -= 1
            file = 0
        elif symbol.isdigit():
            file += int(symbol)
        else:
            piece = PIECE_INDEX[symbol]
            square = rank * 8 + file
            pieces.append((piece, square))
            if piece % 6 == 5:
                kings[int(piece >= 6)] = square
            file += 1
    if min(kings) < 0:
        raise ValueError("missing king")

    encoded = []
    for perspective in (side, side ^ 1):
        bucket = king_bucket(kings[perspective], perspective)
        features = np.full(MAX_ACTIVE_FEATURES, FEATURE_COUNT, dtype=np.int64)
        index = 0
        for piece, square in pieces:
            feature = feature_index(piece, square, perspective, bucket)
            if feature is None:
                continue
            features[index] = feature
            index += 1
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
