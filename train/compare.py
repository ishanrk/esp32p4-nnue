from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

from integer import evaluate_integer, load_exported_model


def compare_integer_evaluations(
    model_path: str | Path,
    source_path: str | Path,
    eval_tool: str | Path,
    *,
    limit: int,
    split: str,
) -> dict[str, int]:
    if limit <= 0:
        raise ValueError("limit must be positive")
    fens = []
    with Path(source_path).open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"bad json at line {line_number}") from error
            if not isinstance(record, dict) or not isinstance(
                record.get("fen"), str
            ):
                raise ValueError(f"bad record at line {line_number}")
            if record.get("split") != split:
                continue
            fens.append(record["fen"])
            if len(fens) == limit:
                break
    if len(fens) != limit:
        raise ValueError(f"source contains only {len(fens)} matching positions")

    model = load_exported_model(model_path)
    python_scores = [evaluate_integer(model, fen) for fen in fens]
    process = subprocess.run(
        [str(eval_tool), str(model_path)],
        input="\n".join(fens) + "\n",
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        c_scores = [int(line) for line in process.stdout.splitlines()]
    except ValueError as error:
        raise ValueError("c evaluator returned a noninteger score") from error
    if len(c_scores) != len(python_scores):
        raise ValueError("c evaluator returned the wrong score count")
    for index, (python_score, c_score) in enumerate(
        zip(python_scores, c_scores, strict=True)
    ):
        if python_score != c_score:
            raise ValueError(
                f"integer mismatch at position {index} "
                f"python {python_score} c {c_score}"
            )
    return {"compared": len(fens), "mismatches": 0}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="compare exported python and c integer evaluation in one batch"
    )
    parser.add_argument("model")
    parser.add_argument("source")
    parser.add_argument("eval_tool")
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--split", default="test")
    args = parser.parse_args()
    try:
        result = compare_integer_evaluations(
            args.model,
            args.source,
            args.eval_tool,
            limit=args.limit,
            split=args.split,
        )
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
