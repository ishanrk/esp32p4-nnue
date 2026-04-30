from __future__ import annotations

import argparse
from collections.abc import Callable, Iterator
import json
from pathlib import Path
from typing import Any

import chess.engine
import chess.pgn

from data import (
    SCORE_LIMIT,
    SCORE_PERSPECTIVE,
    SPLITS,
    assign_game_split,
    clip_score,
    validate_split_percentages,
)


def sampled_positions(
    game: chess.pgn.Game,
    stride: int,
    min_ply: int,
    max_ply: int | None,
) -> Iterator[tuple[int, chess.Board]]:
    board = game.board()
    if not board.is_valid():
        raise ValueError("invalid initial position")
    for ply, move in enumerate(game.mainline_moves(), 1):
        if not board.is_legal(move):
            raise ValueError(f"illegal move at ply {ply}")
        board.push(move)
        if not board.is_valid():
            raise ValueError(f"invalid position at ply {ply}")
        if max_ply is not None and ply > max_ply:
            break
        if ply < min_ply or ply % stride:
            continue
        if board.is_game_over(claim_draw=True):
            continue
        yield ply, board


def write_labeled_positions(
    pgn_path: str | Path,
    output_path: str | Path,
    analyse_score: Callable[[chess.Board], int],
    *,
    stride: int,
    limit: int,
    min_ply: int,
    max_ply: int | None,
    seed: int,
    validation_percent: int,
    test_percent: int,
) -> dict[str, Any]:
    if stride <= 0:
        raise ValueError("stride must be positive")
    if limit <= 0:
        raise ValueError("limit must be positive")
    if min_ply < 0:
        raise ValueError("min ply must be nonnegative")
    if max_ply is not None and max_ply < min_ply:
        raise ValueError("max ply must not precede min ply")
    validate_split_percentages(validation_percent, test_percent)
    position_count = 0
    game_count = 0
    split_counts = {split: 0 for split in SPLITS}
    game_split_counts = {split: 0 for split in SPLITS}
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Path(pgn_path).open(encoding="utf-8", errors="strict") as source, \
         output_path.open("w", encoding="utf-8") as destination:
        while position_count < limit:
            game = chess.pgn.read_game(source)
            if game is None:
                break
            if game.errors:
                raise ValueError(f"malformed pgn game {game_count}")
            if game.headers.get("Variant", "Standard") != "Standard":
                raise ValueError(f"unsupported variant in game {game_count}")
            split = assign_game_split(
                game_count, seed, validation_percent, test_percent
            )
            game_split_counts[split] += 1
            try:
                for ply, board in sampled_positions(
                    game, stride, min_ply, max_ply
                ):
                    record = {
                        "fen": board.fen(),
                        "game_id": game_count,
                        "ply": ply,
                        "score": clip_score(analyse_score(board)),
                        "split": split,
                    }
                    destination.write(
                        json.dumps(
                            record, sort_keys=True, separators=(",", ":")
                        )
                        + "\n"
                    )
                    position_count += 1
                    split_counts[split] += 1
                    if position_count >= limit:
                        break
            except ValueError as error:
                raise ValueError(f"game {game_count}: {error}") from error
            game_count += 1
    if not position_count:
        raise ValueError("no positions labeled")
    return {
        "game_count": game_count,
        "game_split_counts": game_split_counts,
        "position_count": position_count,
        "split_counts": split_counts,
    }


def analyse_with_teacher(
    engine: chess.engine.SimpleEngine, board: chess.Board, nodes: int
) -> int:
    info = engine.analyse(board, chess.engine.Limit(nodes=nodes))
    if "score" not in info:
        raise ValueError("teacher returned no score")
    score = info["score"].pov(board.turn).score(mate_score=SCORE_LIMIT)
    if score is None:
        raise ValueError("teacher returned an empty score")
    return clip_score(score)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="label sampled PGN positions with a fixed-node teacher"
    )
    parser.add_argument("pgn")
    parser.add_argument("engine")
    parser.add_argument("out")
    parser.add_argument("--nodes", type=int, default=20000)
    parser.add_argument("--stride", type=int, default=4)
    parser.add_argument("--limit", type=int, default=1000000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--min-ply", type=int, default=8)
    parser.add_argument("--max-ply", type=int)
    parser.add_argument("--validation-percent", type=int, default=5)
    parser.add_argument("--test-percent", type=int, default=5)
    parser.add_argument("--data-source")
    parser.add_argument("--data-license")
    parser.add_argument("--data-attribution")
    args = parser.parse_args()
    if args.nodes <= 0:
        parser.error("nodes must be positive")

    engine = chess.engine.SimpleEngine.popen_uci(args.engine)
    engine_identity = dict(engine.id)
    try:
        stats = write_labeled_positions(
            args.pgn,
            args.out,
            lambda board: analyse_with_teacher(engine, board, args.nodes),
            stride=args.stride,
            limit=args.limit,
            min_ply=args.min_ply,
            max_ply=args.max_ply,
            seed=args.seed,
            validation_percent=args.validation_percent,
            test_percent=args.test_percent,
        )
    finally:
        engine.quit()
    metadata = {
        "data_attribution": args.data_attribution,
        "data_license": args.data_license,
        "data_source": args.data_source,
        "engine": engine_identity,
        "game_count": stats["game_count"],
        "game_split_counts": stats["game_split_counts"],
        "label_format_version": 1,
        "max_ply": args.max_ply,
        "min_ply": args.min_ply,
        "node_budget": args.nodes,
        "position_count": stats["position_count"],
        "score_clip": {
            "maximum": SCORE_LIMIT,
            "minimum": -SCORE_LIMIT,
            "rule": "clamp",
        },
        "score_perspective": SCORE_PERSPECTIVE,
        "split_counts": stats["split_counts"],
        "split_percent": {
            "test": args.test_percent,
            "train": 100 - args.validation_percent - args.test_percent,
            "validation": args.validation_percent,
        },
        "split_seed": args.seed,
        "stride": args.stride,
    }
    metadata_path = Path(str(args.out) + ".meta.json")
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(stats["position_count"])


if __name__ == "__main__":
    main()
