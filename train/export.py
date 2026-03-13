from __future__ import annotations

import argparse
import struct

import numpy as np
import torch

from features import (
    ACCUMULATOR_BIAS_MAX,
    ACCUMULATOR_BIAS_MIN,
    FEATURE_COUNT,
    FEATURES_PER_BUCKET,
    FORMAT_VERSION,
    HIDDEN_SIZE,
    KING_BUCKET_COUNT,
)
from net import CLIP, Q1, Q2, NnueNetwork

MAGIC = b"P4NNUE1\0"
FILE_SIZE = (
    32
    + HIDDEN_SIZE * 2
    + 2 * HIDDEN_SIZE * 2
    + FEATURE_COUNT * HIDDEN_SIZE
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("out")
    args = parser.parse_args()

    network = NnueNetwork()
    network.load_state_dict(
        torch.load(args.model, map_location="cpu", weights_only=True)
    )
    network.eval()
    with torch.no_grad():
        feature_weights = torch.round(
            network.feature_transformer.weight[:FEATURE_COUNT] * Q1
        ).clamp(-128, 127).to(torch.int8).numpy()
        feature_bias = torch.round(network.feature_bias * Q1).clamp(
            ACCUMULATOR_BIAS_MIN, ACCUMULATOR_BIAS_MAX
        ).to(torch.int16).numpy()
        output_weights = torch.round(network.output.weight[0] * Q2).clamp(
            -32768, 32767
        ).to(torch.int16).numpy()
        output_bias = int(
            torch.round(network.output.bias[0] * Q1 * Q2).clamp(
                -(2**31), 2**31 - 1
            )
        )

    header = struct.pack(
        "<8s8HIi", MAGIC, FORMAT_VERSION,
        KING_BUCKET_COUNT, FEATURES_PER_BUCKET,
        HIDDEN_SIZE, CLIP, Q1, Q2, 0, FILE_SIZE, output_bias
    )
    blob = (
        header
        + feature_bias.astype("<i2").tobytes()
        + output_weights.astype("<i2").tobytes()
        + feature_weights.tobytes()
    )
    if len(blob) != FILE_SIZE:
        raise RuntimeError("bad size")
    with open(args.out, "wb") as output:
        output.write(blob)
    print(len(blob))


if __name__ == "__main__":
    main()
