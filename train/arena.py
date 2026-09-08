from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import selectors
import subprocess
import time
from typing import Any

import chess
import chess.pgn

from evidence import engine_metadata, model_metadata, source_metadata


OPENINGS = (
    ("open game", ("e2e4", "e7e5")),
    ("sicilian", ("e2e4", "c7c5")),
    ("queens gambit", ("d2d4", "d7d5", "c2c4")),
    ("english", ("c2c4", "e7e5")),
)


def load_openings(path: str | Path) -> list[dict[str, str]]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise ValueError("opening suite must be a nonempty list")
    openings = []
    positions = set()
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"opening {index + 1} must be an object")
        name = item.get("name")
        fen = item.get("fen")
        if not isinstance(name, str) or not isinstance(fen, str):
            raise ValueError(f"opening {index + 1} needs a name and fen")
        board = chess.Board(fen)
        if not board.is_valid() or board.is_game_over(claim_draw=True):
            raise ValueError(f"opening {name} is not a playable legal position")
        key = " ".join(board.fen(en_passant="fen").split()[:4])
        if key in positions:
            raise ValueError(f"duplicate opening {name}")
        positions.add(key)
        openings.append({"name": name, "fen": board.fen(en_passant="fen")})
    return openings


class UciEngine:
    def __init__(
        self, executable: str | Path, model: str | Path | None, *, timeout: float = 15.0
    ) -> None:
        self.executable = str(Path(executable).resolve())
        self.model = str(Path(model).resolve()) if model is not None else None
        self.timeout = timeout
        self.output = b""
        self.diagnostics = b""
        self.searches: list[dict[str, Any]] = []
        self.process = subprocess.Popen(
            [self.executable, "--classical"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        try:
            self._send("uci")
            self._read_until("uciok")
            self._send("setoption name Hash value 1")
            if self.model is not None:
                self._send(f"setoption name EvalFile value {self.model}")
            self._send("isready")
            lines = self._read_until("readyok")
            if self.model is not None and "info string nn loaded" not in lines:
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
        deadline = time.monotonic() + self.timeout
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            selector.register(self.process.stderr, selectors.EVENT_READ)
            while True:
                while b"\n" in self.output:
                    line, self.output = self.output.split(b"\n", 1)
                    text = line.decode("utf-8", errors="replace").strip()
                    lines.append(text)
                    if len(lines) > 4096:
                        raise RuntimeError("engine output limit exceeded")
                    if text == expected or text.startswith(expected + " "):
                        return lines
                remaining = deadline - time.monotonic()
                events = selector.select(max(0, remaining))
                if remaining <= 0 or not events:
                    raise RuntimeError(f"engine timeout waiting for {expected}: {self.executable}; stderr {self.diagnostics.decode(errors='replace')}; last output {lines[-8:]}")
                for key, _ in events:
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        if key.fileobj is self.process.stdout:
                            raise RuntimeError(f"engine stopped while waiting for {expected}: {self.executable}; return code {self.process.poll()}; stderr {self.diagnostics.decode(errors='replace')}")
                        selector.unregister(key.fileobj)
                    elif key.fileobj is self.process.stderr:
                        self.diagnostics = (self.diagnostics + chunk)[-8192:]
                    else:
                        self.output += chunk
                        if len(self.output) > 65536:
                            raise RuntimeError("engine line limit exceeded")

    def new_game(self) -> None:
        self._send("ucinewgame")
        self._send("isready")
        self._read_until("readyok")

    def best_move(self, board: chess.Board, depth: int, time_ms: int | None = None) -> chess.Move:
        root = board.root().fen(en_passant="fen")
        moves = " ".join(move.uci() for move in board.move_stack)
        self._send(f"position fen {root}" + (f" moves {moves}" if moves else ""))
        start = time.monotonic()
        self._send(f"go movetime {time_ms}" if time_ms is not None else f"go depth {depth}")
        lines = self._read_until("bestmove")
        fields = lines[-1].split()
        if len(fields) < 2 or fields[1] == "0000":
            raise RuntimeError("engine returned no move")
        move = chess.Move.from_uci(fields[1])
        if move not in board.legal_moves:
            raise RuntimeError(f"engine returned illegal move {move}")
        self.searches.append({"elapsed_ms": (time.monotonic() - start) * 1000,
                              "fen": board.fen(en_passant="fen"), "move": move.uci(), "valid": True,
                              "output": lines})
        return move

    def close(self) -> None:
        if self.process.poll() is None:
            try:
                self._send("quit")
            except OSError:
                self.process.kill()
            try:
                self.process.wait(timeout=min(self.timeout, 1.0))
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is not None:
                stream.close()


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
    opening: tuple[str, ...] | str,
    depth: int,
    max_plies: int,
    record: dict[str, Any] | None = None,
    time_ms: int | None = None,
) -> tuple[chess.Color | None, str, int]:
    board = (
        chess.Board(opening)
        if isinstance(opening, str)
        else opening_board(opening)
    )
    white.new_game()
    black.new_game()
    played = 0
    while not board.is_game_over(claim_draw=True) and played < max_plies:
        engine = white if board.turn == chess.WHITE else black
        board.push(engine.best_move(board, depth, time_ms))
        played += 1
    outcome = board.outcome(claim_draw=True)
    if record is not None:
        game = chess.pgn.Game.from_board(board)
        game.headers["Result"] = board.result(claim_draw=True) if outcome else "1/2-1/2"
        game.headers["Termination"] = outcome.termination.name.lower() if outcome else "max plies adjudication"
        record.update({"initial_fen": board.root().fen(en_passant="fen"),
                       "moves": [move.uci() for move in board.move_stack],
                       "pgn": str(game), "final_fen": board.fen(en_passant="fen")})
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
    model_a_path: str | Path | None,
    engine_b_path: str | Path,
    model_b_path: str | Path | None,
    *,
    depth: int,
    max_plies: int,
    opening_count: int,
    estimate_elo: bool,
    openings: list[dict[str, str]] | None = None,
    time_ms: int | None = None,
) -> dict[str, Any]:
    if depth <= 0 or max_plies <= 0:
        raise ValueError("depth and max plies must be positive")
    if time_ms is not None and not 1 <= time_ms <= 5000:
        raise ValueError("time budget must be from 1 through 5000 milliseconds")
    opening_suite = (
        openings
        if openings is not None
        else [
            {
                "name": name,
                "fen": opening_board(moves).fen(en_passant="fen"),
            }
            for name, moves in OPENINGS
        ]
    )
    if not 1 <= opening_count <= len(opening_suite):
        raise ValueError("bad opening count")
    if estimate_elo and opening_count * 2 < 20:
        raise ValueError("at least 20 games are required for elo estimation")
    scores = []
    games = []
    engine_a = UciEngine(engine_a_path, model_a_path)
    try:
        engine_b = UciEngine(engine_b_path, model_b_path)
        try:
            for item in opening_suite[:opening_count]:
                opening_name = item["name"]
                opening = item["fen"]
                for engine_a_white in (True, False):
                    white = engine_a if engine_a_white else engine_b
                    black = engine_b if engine_a_white else engine_a
                    record: dict[str, Any] = {}
                    winner, termination, plies = play_game(
                        white, black, opening, depth, max_plies, record, time_ms
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
                            **record,
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
        "evidence": {"execution": "host", "source": source_metadata(),
                     "engine_a": engine_metadata(engine_a_path), "engine_b": engine_metadata(engine_b_path),
                     "model_a": model_metadata(model_a_path), "model_b": model_metadata(model_b_path),
                     "tt_bytes": 1048576, "rating_scope": "equal requested wall time comparison" if time_ms is not None else "fixed depth engine comparison only",
                     "searches_a": engine_a.searches, "searches_b": engine_b.searches},
        "configuration": {
            "color_reversal": True,
            "depth": depth if time_ms is None else None,
            "time_ms": time_ms,
            "engine_a": str(Path(engine_a_path).resolve()),
            "engine_b": str(Path(engine_b_path).resolve()),
            "max_plies": max_plies,
            "model_a": (
                str(Path(model_a_path).resolve()) if model_a_path else None
            ),
            "model_b": (
                str(Path(model_b_path).resolve()) if model_b_path else None
            ),
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
        description="run a color reversed local match with depth or time limits"
    )
    parser.add_argument("engine_a")
    parser.add_argument("model_a")
    parser.add_argument("engine_b")
    parser.add_argument("model_b")
    budget = parser.add_mutually_exclusive_group()
    budget.add_argument("--depth", type=int, default=2)
    budget.add_argument("--time-ms", type=int)
    parser.add_argument("--max-plies", type=int, default=120)
    parser.add_argument("--openings")
    parser.add_argument("--opening-count", type=int)
    parser.add_argument("--estimate-elo", action="store_true")
    args = parser.parse_args()
    try:
        openings = load_openings(args.openings) if args.openings else None
        opening_count = (
            args.opening_count
            if args.opening_count is not None
            else len(openings) if openings is not None else len(OPENINGS)
        )
        result = run_match(
            args.engine_a,
            None if args.model_a in ("-", "classic") else args.model_a,
            args.engine_b,
            None if args.model_b in ("-", "classic") else args.model_b,
            depth=args.depth,
            max_plies=args.max_plies,
            opening_count=opening_count,
            estimate_elo=args.estimate_elo,
            openings=openings,
            time_ms=args.time_ms,
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
