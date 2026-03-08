from __future__ import annotations

import argparse

import numpy as np

from data import load_csv


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("out")
    args = parser.parse_args()
    side_features, opponent_features, labels = load_csv(args.src)
    np.savez_compressed(
        args.out, a=side_features, b=opponent_features, y=labels
    )
    print(len(labels))


if __name__ == "__main__":
    main()
