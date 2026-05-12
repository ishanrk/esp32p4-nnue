from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import chess.pgn
import zstandard


def extract_openings(
    source: str | Path,
    *,
    count: int,
    ply: int,
) -> tuple[list[dict[str, str | int]], dict[str, int]]:
    if count <= 0 or not 8 <= ply <= 16:
        raise ValueError("count must be positive and ply must be from 8 through 16")
    openings: list[dict[str, str | int]] = []
    positions: set[str] = set()
    games_read = 0
    games_rejected = 0
    with Path(source).open("rb") as compressed:
        with zstandard.ZstdDecompressor().stream_reader(compressed) as stream:
            with io.TextIOWrapper(stream, encoding="utf-8") as text:
                while len(openings) < count:
                    game = chess.pgn.read_game(text)
                    if game is None:
                        break
                    games_read += 1
                    if (
                        game.errors
                        or game.headers.get("Variant", "Standard") != "Standard"
                        or "FEN" in game.headers
                    ):
                        games_rejected += 1
                        continue
                    board = game.board()
                    moves = list(game.mainline_moves())
                    if len(moves) <= ply:
                        games_rejected += 1
                        continue
                    try:
                        for move in moves[:ply]:
                            if move not in board.legal_moves:
                                raise ValueError("illegal move")
                            board.push(move)
                    except ValueError:
                        games_rejected += 1
                        continue
                    if board.is_game_over(claim_draw=True):
                        games_rejected += 1
                        continue
                    fen = board.fen(en_passant="fen")
                    key = " ".join(fen.split()[:4])
                    if key in positions:
                        continue
                    positions.add(key)
                    openings.append(
                        {
                            "fen": fen,
                            "name": f"opening {len(openings) + 1:03d}",
                            "ply": ply,
                        }
                    )
    if len(openings) != count:
        raise RuntimeError(f"found {len(openings)} of {count} requested openings")
    return openings, {
        "games_read": games_read,
        "games_rejected": games_rejected,
        "positions": len(openings),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="extract deterministic opening positions from a lichess pgn dump"
    )
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--count", type=int, default=128)
    parser.add_argument("--ply", type=int, default=12)
    args = parser.parse_args()
    try:
        openings, report = extract_openings(
            args.source, count=args.count, ply=args.ply
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    Path(args.output).write_text(
        json.dumps(openings, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
