from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from tqdm import trange

from dataset import build_dataset, random_legal_positions, sample_pgn
from export_weights import export_nnue_weights
from label import heuristic_cp
from model import FactorizedHalfKP


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="train a small nnue style model")
    p.add_argument("--pgn", type=str, default="", help="optional pgn path")
    p.add_argument("--samples", type=int, default=30000, help="number of sampled positions")
    p.add_argument("--epochs", type=int, default=6, help="train epochs")
    p.add_argument("--batch-size", type=int, default=256, help="batch size")
    p.add_argument("--lr", type=float, default=1e-3, help="adam learning rate")
    p.add_argument("--out", type=str, default="nnue_weights.bin", help="binary output path")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    np.random.seed(7)
    torch.manual_seed(7)

    if args.pgn:
        boards = sample_pgn(args.pgn, max_positions=args.samples)
    else:
        boards = random_legal_positions(count=args.samples)

    ds = build_dataset(boards, heuristic_cp)
    if ds.x.shape[0] == 0:
        raise SystemExit("no training data produced")

    x = torch.from_numpy(ds.x)
    y = torch.from_numpy(ds.y)
    model = FactorizedHalfKP(input_dim=768, hidden_dim=64, output_dim=1)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = torch.nn.MSELoss()

    n = x.shape[0]
    bs = args.batch_size
    for epoch in range(args.epochs):
        perm = torch.randperm(n)
        epoch_loss = 0.0
        for i in trange(0, n, bs, leave=False, desc=f"epoch {epoch+1}/{args.epochs}"):
            idx = perm[i : i + bs]
            xb = x[idx]
            yb = y[idx]
            pred = model(xb)
            loss = loss_fn(pred, yb)
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_loss += float(loss.detach().cpu())
        print(f"epoch {epoch+1} loss {epoch_loss:.4f}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    export_nnue_weights(model, str(out_path))
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
