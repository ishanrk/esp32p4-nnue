from __future__ import annotations

import chess

PIECE_VALUE = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


def heuristic_cp(board: chess.Board) -> int:
    score = 0
    for piece_type, val in PIECE_VALUE.items():
        score += len(board.pieces(piece_type, chess.WHITE)) * val
        score -= len(board.pieces(piece_type, chess.BLACK)) * val
    if board.is_checkmate():
        score = 30000 if board.turn == chess.BLACK else -30000
    return score


def label_with_teacher(fen: str) -> tuple[int, int]:
    board = chess.Board(fen)
    cp = heuristic_cp(board)
    wdl = 1 if cp > 20 else (-1 if cp < -20 else 0)
    return (cp, wdl)
