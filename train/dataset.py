from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Tuple

import chess
import chess.pgn
import numpy as np


def encode_board_12x64(board: chess.Board) -> np.ndarray:
    x = np.zeros((12, 64), dtype=np.float32)
    for sq, piece in board.piece_map().items():
        offset = 0 if piece.color == chess.WHITE else 6
        idx = offset + (piece.piece_type - 1)
        x[idx, sq] = 1.0
    return x.reshape(-1)


def sample_pgn(path: str, max_positions: int = 200_000) -> Iterator[chess.Board]:
    p = Path(path)
    if not p.exists():
        return
    with p.open("r", encoding="utf-8", errors="ignore") as fh:
        produced = 0
        while produced < max_positions:
            game = chess.pgn.read_game(fh)
            if game is None:
                break
            board = game.board()
            for move in game.mainline_moves():
                board.push(move)
                yield board.copy(stack=False)
                produced += 1
                if produced >= max_positions:
                    break


def random_legal_positions(count: int = 100_000, plies: int = 20, seed: int = 7) -> Iterator[chess.Board]:
    rng = np.random.default_rng(seed)
    for _ in range(count):
        board = chess.Board()
        for _ply in range(plies):
            legal = list(board.legal_moves)
            if not legal or board.is_game_over():
                break
            mv = legal[int(rng.integers(0, len(legal)))]
            board.push(mv)
        yield board


@dataclass
class DatasetSplit:
    x: np.ndarray
    y: np.ndarray


def build_dataset(boards: Iterator[chess.Board], label_fn) -> DatasetSplit:
    xs: List[np.ndarray] = []
    ys: List[float] = []
    for b in boards:
        xs.append(encode_board_12x64(b))
        ys.append(float(label_fn(b)))
    if not xs:
        return DatasetSplit(np.zeros((0, 768), dtype=np.float32), np.zeros((0, 1), dtype=np.float32))
    x = np.stack(xs).astype(np.float32)
    y = np.array(ys, dtype=np.float32).reshape(-1, 1)
    return DatasetSplit(x=x, y=y)
