from typing import Any

import struct

import numpy as np


def export_nnue_weights(model: Any, out_path: str) -> None:
    w1 = model.fc1.weight.detach().cpu().numpy().astype(np.float32)
    b1 = model.fc1.bias.detach().cpu().numpy().astype(np.float32)
    w2 = model.fc2.weight.detach().cpu().numpy().astype(np.float32).reshape(-1)
    b2 = model.fc2.bias.detach().cpu().numpy().astype(np.float32).reshape(-1)
    assert w2.shape[0] == w1.shape[0]
    with open(out_path, "wb") as f:
        f.write(b"UBNNUE1\x00")
        f.write(struct.pack("<I", w1.shape[1]))
        f.write(struct.pack("<I", w1.shape[0]))
        f.write(w1.tobytes(order="C"))
        f.write(b1.tobytes(order="C"))
        f.write(w2.tobytes(order="C"))
        f.write(b2[:1].tobytes(order="C"))
