from __future__ import annotations

import argparse

import numpy as np
import torch

from net import Net


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("data")
    p.add_argument("out")
    p.add_argument("--epochs", type=int, default=12)
    p.add_argument("--batch", type=int, default=4096)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--seed", type=int, default=7)
    a = p.parse_args()

    torch.manual_seed(a.seed)
    np.random.seed(a.seed)
    d = np.load(a.data)
    x0 = torch.from_numpy(d["a"]).long()
    x1 = torch.from_numpy(d["b"]).long()
    y = torch.from_numpy(d["y"]).float()
    n = len(y)
    cut = max(1, int(n * 0.95))
    perm = torch.randperm(n)
    tr = perm[:cut]
    va = perm[cut:]

    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    net = Net().to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr)

    for ep in range(a.epochs):
        net.train()
        order = tr[torch.randperm(len(tr))]
        total = 0.0
        for i in range(0, len(order), a.batch):
            ix = order[i : i + a.batch]
            pred = net(x0[ix].to(dev), x1[ix].to(dev))
            target = y[ix].to(dev)
            loss = torch.nn.functional.smooth_l1_loss(
                torch.tanh(pred / 400.0), torch.tanh(target / 400.0)
            )
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            total += float(loss.detach()) * len(ix)
        net.eval()
        v = 0.0
        if len(va):
            with torch.no_grad():
                pred = net(x0[va].to(dev), x1[va].to(dev))
                target = y[va].to(dev)
                v = float(torch.nn.functional.l1_loss(pred, target))
        print(f"epoch {ep + 1} loss {total / len(tr):.6f} val {v:.2f}")

    torch.save(net.state_dict(), a.out)


if __name__ == "__main__":
    main()
