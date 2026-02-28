from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

B = 8
F = 640
H = 64
PAD = B * F
MAX_PC = 30
PC = {c: i for i, c in enumerate("PNBRQKpnbrqk")}


def bucket(sq: int, view: int) -> int:
    if view:
        sq ^= 56
    f = sq & 7
    r = sq >> 3
    if f > 3:
        f = 7 - f
    return f + (4 if r >= 4 else 0)


def feat(pc: int, sq: int, view: int, b: int) -> int | None:
    t = pc % 6
    if t == 5:
        return None
    if view:
        sq ^= 56
    own = int((pc >= 6) == bool(view))
    cat = t if own else 5 + t
    return b * F + cat * 64 + sq


def enc(fen: str) -> tuple[np.ndarray, np.ndarray]:
    fields = fen.split()
    if len(fields) < 2:
        raise ValueError("bad fen")
    board = fields[0]
    side = 0 if fields[1] == "w" else 1
    pcs: list[tuple[int, int]] = []
    kings = [-1, -1]
    r = 7
    f = 0
    for c in board:
        if c == "/":
            r -= 1
            f = 0
        elif c.isdigit():
            f += int(c)
        else:
            pc = PC[c]
            sq = r * 8 + f
            pcs.append((pc, sq))
            if pc % 6 == 5:
                kings[int(pc >= 6)] = sq
            f += 1
    if min(kings) < 0:
        raise ValueError("missing king")

    out = []
    for view in (side, side ^ 1):
        b = bucket(kings[view], view)
        x = np.full(MAX_PC, PAD, dtype=np.int64)
        j = 0
        for pc, sq in pcs:
            v = feat(pc, sq, view, b)
            if v is None:
                continue
            x[j] = v
            j += 1
        out.append(x)
    return out[0], out[1]


def load_csv(path: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    a = []
    b = []
    y = []
    with Path(path).open(newline="", encoding="utf-8") as f:
        rd = csv.reader(f)
        for row in rd:
            if not row or row[0].lower() == "fen":
                continue
            x0, x1 = enc(row[0])
            a.append(x0)
            b.append(x1)
            y.append(float(row[1]))
    if not a:
        raise ValueError("empty data")
    return np.stack(a), np.stack(b), np.asarray(y, dtype=np.float32)
