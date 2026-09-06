from __future__ import annotations

import hashlib
import json
from pathlib import Path
import platform
import shlex
import subprocess


def file_hash(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_metadata() -> dict:
    root = Path(__file__).parents[1]
    def git(*args: str) -> str:
        return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()
    cpu = platform.processor()
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.exists():
        cpu = next((line.split(":", 1)[1].strip() for line in cpuinfo.read_text().splitlines()
                    if line.startswith("model name")), cpu)
    return {"commit": git("rev-parse", "HEAD"), "dirty": bool(git("status", "--porcelain")),
            "platform": platform.platform(), "machine": platform.machine(), "cpu": cpu,
            "scope": "checkout at capture time with binary identity recorded separately"}


def engine_metadata(path: str | Path) -> dict:
    executable = Path(path).resolve()
    commands = executable.parent / "compile_commands.json"
    result = {"path": str(executable), "sha256": file_hash(executable), "compile_commands": None}
    if commands.is_file():
        result["compile_commands"] = [entry for entry in json.loads(commands.read_text())
                                      if "/src/" in entry["file"]]
        if result["compile_commands"]:
            compiler = shlex.split(result["compile_commands"][0]["command"])[0]
            result["compiler_version"] = subprocess.check_output([compiler, "--version"], text=True, timeout=5).splitlines()[0]
    return result


def model_metadata(path: str | Path | None) -> dict:
    if path is None:
        return {"evaluator": "classical"}
    data = Path(path).read_bytes()
    return {"evaluator": "nnue", "path": str(Path(path).resolve()), "sha256": file_hash(path),
            "bytes": len(data), "buckets": int.from_bytes(data[10:12], "little"),
            "width": int.from_bytes(data[14:16], "little")}
