from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

from evidence import engine_metadata, file_hash, model_metadata, source_metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="capture a small host benchmark with provenance")
    parser.add_argument("executable")
    parser.add_argument("model")
    parser.add_argument("--iterations", type=int, default=10000)
    parser.add_argument("--depth", type=int, default=2)
    args = parser.parse_args()
    command = [str(Path(args.executable).resolve()), str(Path(args.model).resolve()),
               str(args.iterations), str(args.depth), "3"]
    process = subprocess.run(command, text=True, capture_output=True, timeout=60, check=True)
    result = {"execution": "host", "command": command, "source": source_metadata(),
              "engine": engine_metadata(args.executable), "model": model_metadata(args.model),
              "fixture_source_sha256": file_hash(Path(__file__).parents[1] / "src/profile_bench.c"),
              "tt_bytes": 1048576, "warmups": 1, "repetitions": 3,
              "valid": process.returncode == 0, "raw": process.stdout.splitlines(),
              "update_work": {
                  "incremental": "make and undo plus raw evaluation at child and parent",
                  "full_refresh": "refresh prebuilt child and parent plus the same raw evaluations",
                  "excluded": "move parsing preparation and parity checks outside timing; full refresh excludes board mutation; neither path measures search or board throughput",
              }}
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
