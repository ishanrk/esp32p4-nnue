from __future__ import annotations

from profiles import (
    DEFAULT_PROFILE,
    FEATURES_PER_BUCKET,
    MAX_ACTIVE_FEATURES,
    NnueProfile,
)

PIECE_INDEX = {symbol: index for index, symbol in enumerate("PNBRQKpnbrqk")}


def _perspective_square(square: int, perspective: int, mirror: bool) -> int:
    if perspective == 1:
        square ^= 56
    if mirror:
        square ^= 7
    return square


def _king_view(
    king_square: int,
    perspective: int,
    profile: NnueProfile,
) -> tuple[int, bool]:
    if not 0 <= king_square < 64 or perspective not in (0, 1):
        raise ValueError("bad king view")
    square = _perspective_square(king_square, perspective, False)
    mirror = (square & 7) >= 4
    if mirror:
        square ^= 7
    rank_bands = profile.bucket_count // 4
    bucket = (square & 7) + 4 * ((square >> 3) * rank_bands // 8)
    return bucket, mirror


def king_mirror(
    king_square: int,
    perspective: int,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> bool:
    return _king_view(king_square, perspective, profile)[1]


def king_bucket(
    king_square: int,
    perspective: int,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> int:
    return _king_view(king_square, perspective, profile)[0]


def _feature_index_from_view(
    bucket: int,
    mirror: bool,
    piece: int,
    square: int,
    perspective: int,
) -> int | None:
    piece_type = piece % 6
    if piece_type == 5:
        return None
    normalized_square = _perspective_square(square, perspective, mirror)
    own_piece = (piece >= 6) == bool(perspective)
    piece_class = piece_type if own_piece else 5 + piece_type
    return (
        bucket * FEATURES_PER_BUCKET
        + piece_class * 64
        + normalized_square
    )


def feature_index(
    king_square: int,
    piece: int,
    square: int,
    perspective: int,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> int | None:
    if not 0 <= piece < 12 or not 0 <= square < 64:
        raise ValueError("bad piece square")
    bucket, mirror = _king_view(king_square, perspective, profile)
    return _feature_index_from_view(bucket, mirror, piece, square, perspective)


def parse_fen(fen: str) -> tuple[int, list[tuple[int, int]], list[int]]:
    fields = fen.split()
    if len(fields) < 2 or fields[1] not in ("w", "b"):
        raise ValueError("bad fen")
    ranks = fields[0].split("/")
    if len(ranks) != 8:
        raise ValueError("bad fen board")
    pieces: list[tuple[int, int]] = []
    kings = [-1, -1]
    for rank_index, text in enumerate(ranks):
        rank = 7 - rank_index
        file = 0
        for symbol in text:
            if symbol in "12345678":
                file += int(symbol)
                if file > 8:
                    raise ValueError("bad fen rank")
                continue
            if symbol not in PIECE_INDEX or file >= 8:
                raise ValueError("bad fen piece")
            piece = PIECE_INDEX[symbol]
            square = rank * 8 + file
            pieces.append((piece, square))
            if piece % 6 == 5:
                kings[int(piece >= 6)] = square
            file += 1
        if file != 8:
            raise ValueError("bad fen rank")
    if sum(piece == 5 for piece, _ in pieces) != 1 or sum(
        piece == 11 for piece, _ in pieces
    ) != 1:
        raise ValueError("missing king")
    if sum(piece % 6 != 5 for piece, _ in pieces) > MAX_ACTIVE_FEATURES:
        raise ValueError("too many nonking pieces")
    side = 0 if fields[1] == "w" else 1
    return side, pieces, kings


def _active_feature_indices(
    pieces: list[tuple[int, int]],
    kings: list[int],
    perspective: int,
    profile: NnueProfile,
) -> tuple[int, list[int]]:
    bucket, mirror = _king_view(kings[perspective], perspective, profile)
    features = []
    for piece, square in pieces:
        index = _feature_index_from_view(
            bucket, mirror, piece, square, perspective
        )
        if index is not None:
            features.append(index)
    return bucket, features


def active_feature_indices(
    fen: str,
    perspective: int,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> tuple[int, list[int]]:
    _, pieces, kings = parse_fen(fen)
    return _active_feature_indices(pieces, kings, perspective, profile)


def encode_feature_indices(
    fen: str,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> tuple[list[int], list[int]]:
    side, pieces, kings = parse_fen(fen)
    _, side_features = _active_feature_indices(
        pieces, kings, side, profile
    )
    _, opponent_features = _active_feature_indices(
        pieces, kings, side ^ 1, profile
    )
    return side_features, opponent_features


def encode_position(
    fen: str,
    profile: NnueProfile = DEFAULT_PROFILE,
) -> tuple[list[int], list[int]]:
    encoded = []
    for active in encode_feature_indices(fen, profile):
        features = active + [profile.padding_feature] * (
            MAX_ACTIVE_FEATURES - len(active)
        )
        encoded.append(features)
    return encoded[0], encoded[1]
