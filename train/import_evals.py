from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
import io
import itertools
import json
import multiprocessing
from pathlib import Path
import random
import sys
from typing import Any, Iterator, TextIO
import urllib.request

import chess

from data import SCORE_LIMIT, SCORE_PERSPECTIVE, SPLITS, clip_score


EVALUATION_SOURCE = "https://database.lichess.org/lichess_db_eval.jsonl.zst"
EVALUATION_SOURCE_DATE = "2026-08-02"
EVALUATION_SOURCE_POSITION_COUNT = 394669566
IMPORT_FORMAT_VERSION = 1


@dataclass(frozen=True)
class ImportedEvaluation:
    fen: str
    score: int
    depth: int
    knodes: int | None
    score_kind: str
    side_to_move: str
    piece_count: int


def _integer(value: Any, name: str, *, positive: bool = False) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if positive and value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _selected_evaluation(record: dict[str, Any]) -> tuple[int, int | None, str, int]:
    evaluations = record.get("evals")
    if not isinstance(evaluations, list):
        raise ValueError("evals must be a list")
    selected: tuple[int, int | None, str, int] | None = None
    for evaluation in evaluations:
        if not isinstance(evaluation, dict):
            continue
        try:
            depth = _integer(evaluation.get("depth"), "depth", positive=True)
        except ValueError:
            continue
        principal_variations = evaluation.get("pvs")
        if not isinstance(principal_variations, list) or not principal_variations:
            continue
        first = principal_variations[0]
        if not isinstance(first, dict):
            continue
        if "cp" in first:
            try:
                value = _integer(first["cp"], "cp")
            except ValueError:
                continue
            kind = "cp"
        elif "mate" in first:
            try:
                mate = _integer(first["mate"], "mate")
            except ValueError:
                continue
            if not mate:
                continue
            value = SCORE_LIMIT if mate > 0 else -SCORE_LIMIT
            kind = "mate"
        else:
            continue
        knodes_value = evaluation.get("knodes")
        knodes = (
            knodes_value
            if isinstance(knodes_value, int)
            and not isinstance(knodes_value, bool)
            and knodes_value >= 0
            else None
        )
        candidate = (depth, knodes, kind, value)
        if selected is None or depth > selected[0]:
            selected = candidate
    if selected is None:
        raise ValueError("no usable evaluation")
    return selected


def parse_evaluation_record(record: dict[str, Any]) -> ImportedEvaluation:
    fen = record.get("fen")
    if not isinstance(fen, str):
        raise ValueError("fen must be text")
    try:
        board = chess.Board(fen)
    except ValueError as error:
        raise ValueError("invalid fen") from error
    if not board.is_valid():
        raise ValueError("illegal position")
    depth, knodes, score_kind, white_score = _selected_evaluation(record)
    score = white_score if board.turn == chess.WHITE else -white_score
    return ImportedEvaluation(
        fen=board.fen(en_passant="fen"),
        score=clip_score(score),
        depth=depth,
        knodes=knodes,
        score_kind=score_kind,
        side_to_move="white" if board.turn == chess.WHITE else "black",
        piece_count=len(board.piece_map()),
    )


def _parse_source_line(
    item: tuple[int, str],
) -> tuple[int, ImportedEvaluation | None, str | None]:
    source_index, line = item
    try:
        raw = json.loads(line)
        if not isinstance(raw, dict):
            raise ValueError("record must be an object")
        return source_index, parse_evaluation_record(raw), None
    except (json.JSONDecodeError, ValueError) as error:
        return source_index, None, str(error)


@contextmanager
def open_evaluation_source(source: str) -> Iterator[TextIO]:
    binary: Any
    if source == "-":
        yield sys.stdin
        return
    if source.startswith(("http://", "https://")):
        binary = urllib.request.urlopen(source, timeout=120)
    else:
        binary = Path(source).open("rb")
    try:
        if source.endswith(".zst"):
            import zstandard

            reader = zstandard.ZstdDecompressor().stream_reader(binary)
            text = io.TextIOWrapper(reader, encoding="utf-8")
        else:
            text = io.TextIOWrapper(binary, encoding="utf-8")
        try:
            yield text
        finally:
            text.close()
    finally:
        if not binary.closed:
            binary.close()


def _distribution(
    values: Counter[int], boundaries: tuple[int, ...]
) -> dict[str, int]:
    result: dict[str, int] = {}
    previous: int | None = None
    for boundary in boundaries:
        label = (
            f"under_{boundary}"
            if previous is None
            else f"{previous}_to_{boundary - 1}"
        )
        result[label] = sum(
            count for value, count in values.items()
            if (previous is None or value >= previous) and value < boundary
        )
        previous = boundary
    result[f"{boundaries[-1]}_or_more"] = sum(
        count for value, count in values.items() if value >= boundaries[-1]
    )
    return result


def import_evaluations(
    source: str,
    output_path: str | Path,
    *,
    limit: int,
    min_depth: int,
    selection_denominator: int,
    seed: int,
    validation_percent: int,
    test_percent: int,
    scan_limit: int | None = None,
    workers: int = 0,
    source_date: str = EVALUATION_SOURCE_DATE,
    source_advertised_positions: int = EVALUATION_SOURCE_POSITION_COUNT,
) -> dict[str, Any]:
    if limit <= 0 or min_depth <= 0 or selection_denominator <= 0:
        raise ValueError("limit depth and selection denominator must be positive")
    if validation_percent < 0 or test_percent < 0:
        raise ValueError("split percentages must be nonnegative")
    train_percent = 100 - validation_percent - test_percent
    if train_percent <= 0:
        raise ValueError("training split must be nonempty")
    if scan_limit is not None and scan_limit <= 0:
        raise ValueError("scan limit must be positive")
    if workers < 0:
        raise ValueError("workers must be nonnegative")
    if not source_date or source_advertised_positions <= 0:
        raise ValueError("source metadata is invalid")

    selection_random = random.Random(seed)
    split_random = random.Random(seed ^ 0x5EED5EED)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rejection_counts: Counter[str] = Counter()
    depth_counts: Counter[int] = Counter()
    knode_counts: Counter[int] = Counter()
    centipawn_counts: Counter[int] = Counter()
    piece_counts: Counter[int] = Counter()
    side_counts: Counter[str] = Counter()
    score_kind_counts: Counter[str] = Counter()
    split_counts: Counter[str] = Counter()
    records_scanned = 0
    usable_records = 0
    eligible_records = 0
    accepted_records = 0

    pool: multiprocessing.pool.Pool | None = None
    try:
        with open_evaluation_source(source) as input_file, output_path.open(
            "w", encoding="utf-8"
        ) as output_file:
            source_lines: Iterator[tuple[int, str]] = enumerate(input_file)
            if scan_limit is not None:
                source_lines = itertools.islice(source_lines, scan_limit)
            if workers:
                pool = multiprocessing.Pool(workers)
                parsed_lines = pool.imap(
                    _parse_source_line, source_lines, chunksize=2048
                )
            else:
                parsed_lines = map(_parse_source_line, source_lines)
            for source_index, evaluation, error in parsed_lines:
                records_scanned += 1
                if records_scanned % 1000000 == 0:
                    print(
                        f"scanned {records_scanned} accepted {accepted_records}",
                        file=sys.stderr,
                        flush=True,
                    )
                if evaluation is None:
                    rejection_counts[error or "invalid record"] += 1
                    continue
                usable_records += 1
                depth_counts[evaluation.depth] += 1
                if evaluation.knodes is not None:
                    knode_counts[evaluation.knodes] += 1
                if evaluation.score_kind == "cp":
                    centipawn_counts[evaluation.score] += 1
                score_kind_counts[evaluation.score_kind] += 1
                piece_counts[evaluation.piece_count] += 1
                side_counts[evaluation.side_to_move] += 1
                if evaluation.depth < min_depth:
                    rejection_counts["below minimum depth"] += 1
                    continue
                eligible_records += 1
                if selection_random.randrange(selection_denominator):
                    continue
                split_bucket = split_random.randrange(100)
                if split_bucket < train_percent:
                    split = "train"
                elif split_bucket < train_percent + validation_percent:
                    split = "validation"
                else:
                    split = "test"
                output_file.write(
                    json.dumps(
                        {
                            "depth": evaluation.depth,
                            "fen": evaluation.fen,
                            "game_id": source_index,
                            "knodes": evaluation.knodes,
                            "score": evaluation.score,
                            "score_kind": evaluation.score_kind,
                            "split": split,
                        },
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                accepted_records += 1
                split_counts[split] += 1
                if accepted_records >= limit:
                    break
    finally:
        if pool is not None:
            pool.terminate()
            pool.join()

    if not accepted_records:
        raise ValueError("no evaluations accepted")
    absolute_centipawn_counts: Counter[int] = Counter()
    for score, count in centipawn_counts.items():
        absolute_centipawn_counts[abs(score)] += count
    metadata = {
        "accepted_records": accepted_records,
        "data_attribution": "lichess.org open database",
        "data_license": "CC0",
        "data_source": EVALUATION_SOURCE,
        "depth_distribution": _distribution(
            depth_counts, (10, 15, 20, 25, 30, 35, 40)
        ),
        "eligible_records": eligible_records,
        "evaluation_selection_rule": "greatest depth and first principal variation",
        "import_format_version": IMPORT_FORMAT_VERSION,
        "knode_distribution": _distribution(
            knode_counts, (10, 100, 1000, 10000, 100000)
        ),
        "mate_fraction": score_kind_counts["mate"] / usable_records,
        "minimum_depth": min_depth,
        "piece_count_distribution": {
            str(key): value for key, value in sorted(piece_counts.items())
        },
        "records_scanned": records_scanned,
        "rejection_counts": dict(sorted(rejection_counts.items())),
        "score_clip": {
            "maximum": SCORE_LIMIT,
            "minimum": -SCORE_LIMIT,
            "rule": "clamp",
        },
        "score_distribution": _distribution(
            absolute_centipawn_counts,
            (50, 100, 200, 400, 800, 1600, 3200, 10000),
        ),
        "score_perspective": SCORE_PERSPECTIVE,
        "score_perspective_conversion": (
            "lichess white point of view negated when black moves"
        ),
        "selection_denominator": selection_denominator,
        "selection_rule": (
            f"seeded one in {selection_denominator} acceptance "
            "after depth filtering"
        ),
        "selection_seed": seed,
        "side_to_move_counts": dict(side_counts),
        "source_advertised_positions": source_advertised_positions,
        "source_date": source_date,
        "split_counts": {split: split_counts[split] for split in SPLITS},
        "split_percent": {
            "test": test_percent,
            "train": train_percent,
            "validation": validation_percent,
        },
        "split_seed": seed,
        "engine": {
            "name": "lichess stockfish evaluation database",
            "version": "various client stockfish versions",
        },
        "node_budget": None,
        "usable_records": usable_records,
        "workers": workers,
    }
    Path(str(output_path) + ".meta.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(
        description="stream official lichess evaluations into labeled positions"
    )
    parser.add_argument("source")
    parser.add_argument("out")
    parser.add_argument("--limit", type=int, required=True)
    parser.add_argument("--min-depth", type=int, default=20)
    parser.add_argument("--selection-denominator", type=int, default=4)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--validation-percent", type=int, default=5)
    parser.add_argument("--test-percent", type=int, default=5)
    parser.add_argument("--scan-limit", type=int)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--source-date", default=EVALUATION_SOURCE_DATE)
    parser.add_argument(
        "--source-advertised-positions",
        type=int,
        default=EVALUATION_SOURCE_POSITION_COUNT,
    )
    args = parser.parse_args()
    try:
        metadata = import_evaluations(
            args.source,
            args.out,
            limit=args.limit,
            min_depth=args.min_depth,
            selection_denominator=args.selection_denominator,
            seed=args.seed,
            validation_percent=args.validation_percent,
            test_percent=args.test_percent,
            scan_limit=args.scan_limit,
            workers=args.workers,
            source_date=args.source_date,
            source_advertised_positions=args.source_advertised_positions,
        )
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(metadata, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
