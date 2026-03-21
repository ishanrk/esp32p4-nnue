from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import subprocess
from typing import Any

import chess


OPENINGS = (
    ("open game", ("e2e4", "e7e5")),
    ("sicilian", ("e2e4", "c7c5")),
    ("queens gambit", ("d2d4", "d7d5", "c2c4")),
    ("english", ("c2c4", "e7e5")),
)


class UciEngine:
    def __init__(self, executable: str | Path, model: str | Path) -> None:
        self.executable = str(Path(executable).resolve())
        self.model = str(Path(model).resolve())
        self.process = subprocess.Popen(
            [self.executable],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        try:
            self._send("uci")
            self._read_until("uciok")
            self._send("setoption name Hash value 1")
            self._send(f"setoption name EvalFile value {self.model}")
            self._send("isready")
            lines = self._read_until("readyok")
            if "info string nn loaded" not in lines:
                raise RuntimeError(f"model load failed for {self.model}")
        except Exception:
            self.close()
            raise

    def _send(self, command: str) -> None:
        if self.process.stdin is None:
            raise RuntimeError("engine input closed")
        self.process.stdin.write(command + "\n")
        self.process.stdin.flush()

    def _read_until(self, expected: str) -> list[str]:
        if self.process.stdout is None:
            raise RuntimeError("engine output closed")
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError("engine stopped unexpectedly")
            text = line.strip()
            lines.append(text)
            if text.startswith(expected):
                return lines

    def new_game(self) -> None:
        self._send("ucinewgame")
        self._send("isready")
        self._read_until("readyok")

    def best_move(self, board: chess.Board, depth: int) -> chess.Move:
        self._send(f"position fen {board.fen(en_passant='fen')}")
        self._send(f"go depth {depth}")
        lines = self._read_until("bestmove")
        fields = lines[-1].split()
        if len(fields) < 2 or fields[1] == "0000":
            raise RuntimeError("engine returned no move")
        move = chess.Move.from_uci(fields[1])
        if move not in board.legal_moves:
            raise RuntimeError(f"engine returned illegal move {move}")
        return move

    def close(self) -> None:
        if self.process.poll() is None:
            try:
                self._send("quit")
            except OSError:
                self.process.kill()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


def opening_board(moves: tuple[str, ...]) -> chess.Board:
    board = chess.Board()
    for text in moves:
        move = chess.Move.from_uci(text)
        if move not in board.legal_moves:
            raise ValueError(f"illegal opening move {text}")
        board.push(move)
    return board


def play_game(
    white: UciEngine,
    black: UciEngine,
    opening: tuple[str, ...],
    depth: int,
    max_plies: int,
) -> tuple[chess.Color | None, str, int]:
    board = opening_board(opening)
    white.new_game()
    black.new_game()
    played = 0
    while not board.is_game_over(claim_draw=True) and played < max_plies:
        engine = white if board.turn == chess.WHITE else black
        board.push(engine.best_move(board, depth))
        played += 1
    outcome = board.outcome(claim_draw=True)
    if outcome is None:
        return None, "max plies", played
    return outcome.winner, outcome.termination.name.lower(), played


def elo_summary(scores: list[float]) -> dict[str, float | None]:
    count = len(scores)
    score = sum(scores) / count
    if not 0.0 < score < 1.0:
        return {"estimate": None, "uncertainty_95": None}
    estimate = 400.0 * math.log10(score / (1.0 - score))
    variance = sum((value - score) ** 2 for value in scores) / (count - 1)
    standard_error = math.sqrt(variance / count)
    derivative = 400.0 / math.log(10.0) / (score * (1.0 - score))
    return {
        "estimate": estimate,
        "uncertainty_95": 1.96 * derivative * standard_error,
    }


def run_match(
    engine_a_path: str | Path,
    model_a_path: str | Path,
    engine_b_path: str | Path,
    model_b_path: str | Path,
    *,
    depth: int,
    max_plies: int,
    opening_count: int,
    estimate_elo: bool,
) -> dict[str, Any]:
    if depth <= 0 or max_plies <= 0:
        raise ValueError("depth and max plies must be positive")
    if not 1 <= opening_count <= len(OPENINGS):
        raise ValueError("bad opening count")
    if estimate_elo and opening_count * 2 < 20:
        raise ValueError("at least 20 games are required for elo estimation")
    scores = []
    games = []
    engine_a = UciEngine(engine_a_path, model_a_path)
    try:
        engine_b = UciEngine(engine_b_path, model_b_path)
        try:
            for opening_name, opening in OPENINGS[:opening_count]:
                for engine_a_white in (True, False):
                    white = engine_a if engine_a_white else engine_b
                    black = engine_b if engine_a_white else engine_a
                    winner, termination, plies = play_game(
                        white, black, opening, depth, max_plies
                    )
                    if winner is None:
                        score = 0.5
                    elif winner == engine_a_white:
                        score = 1.0
                    else:
                        score = 0.0
                    scores.append(score)
                    games.append(
                        {
                            "engine_a_color": (
                                "white" if engine_a_white else "black"
                            ),
                            "opening": opening_name,
                            "plies": plies,
                            "score": score,
                            "termination": termination,
                        }
                    )
        finally:
            engine_b.close()
    finally:
        engine_a.close()
    wins = scores.count(1.0)
    draws = scores.count(0.5)
    losses = scores.count(0.0)
    result: dict[str, Any] = {
        "configuration": {
            "color_reversal": True,
            "depth": depth,
            "engine_a": str(Path(engine_a_path).resolve()),
            "engine_b": str(Path(engine_b_path).resolve()),
            "max_plies": max_plies,
            "model_a": str(Path(model_a_path).resolve()),
            "model_b": str(Path(model_b_path).resolve()),
            "opening_count": opening_count,
        },
        "games": games,
        "result": {
            "draws": draws,
            "games": len(scores),
            "losses": losses,
            "score_percent": 100.0 * sum(scores) / len(scores),
            "wins": wins,
        },
    }
    result["elo"] = elo_summary(scores) if estimate_elo else None
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="run a fixed depth color reversed local nnue match"
    )
    parser.add_argument("engine_a")
    parser.add_argument("model_a")
    parser.add_argument("engine_b")
    parser.add_argument("model_b")
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--max-plies", type=int, default=120)
    parser.add_argument("--opening-count", type=int, default=len(OPENINGS))
    parser.add_argument("--estimate-elo", action="store_true")
    args = parser.parse_args()
    try:
        result = run_match(
            args.engine_a,
            args.model_a,
            args.engine_b,
            args.model_b,
            depth=args.depth,
            max_plies=args.max_plies,
            opening_count=args.opening_count,
            estimate_elo=args.estimate_elo,
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
