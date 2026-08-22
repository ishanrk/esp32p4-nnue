from __future__ import annotations

import argparse
import struct

import numpy as np
import torch

from data import B, F, H, PAD
from net import CLIP, Q1, Q2, Net

MAGIC = b"P4NNUE1\0"
SIZE = 32 + H * 2 + 2 * H * 2 + B * F * H


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("model")
    p.add_argument("out")
    a = p.parse_args()

    net = Net()
    net.load_state_dict(torch.load(a.model, map_location="cpu", weights_only=True))
    net.eval()
    with torch.no_grad():
        w = torch.round(net.ft.weight[:PAD] * Q1).clamp(-128, 127).to(torch.int8).numpy()
        b = torch.round(net.bias * Q1).clamp(-32768, 32767).to(torch.int16).numpy()
        o = torch.round(net.out.weight[0] * Q2).clamp(-32768, 32767).to(torch.int16).numpy()
        ob = int(torch.round(net.out.bias[0] * Q1 * Q2).clamp(-(2**31), 2**31 - 1))

    hdr = struct.pack("<8s8HIi", MAGIC, 1, B, F, H, CLIP, Q1, Q2, 0, SIZE, ob)
    blob = hdr + b.astype("<i2").tobytes() + o.astype("<i2").tobytes() + w.tobytes()
    if len(blob) != SIZE:
        raise RuntimeError("bad size")
    with open(a.out, "wb") as f:
        f.write(blob)
    print(len(blob))


if __name__ == "__main__":
    main()
