from __future__ import annotations

import argparse

import numpy as np

from data import load_csv


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("out")
    a = p.parse_args()
    x0, x1, y = load_csv(a.src)
    np.savez_compressed(a.out, a=x0, b=x1, y=y)
    print(len(y))


if __name__ == "__main__":
    main()
