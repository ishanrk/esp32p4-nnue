from __future__ import annotations

import torch

from data import B, F, H, PAD

Q1 = 64
Q2 = 64
CLIP = 127


class Net(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.ft = torch.nn.Embedding(PAD + 1, H, padding_idx=PAD)
        self.bias = torch.nn.Parameter(torch.zeros(H))
        self.out = torch.nn.Linear(2 * H, 1)
        torch.nn.init.normal_(self.ft.weight, std=0.02)
        with torch.no_grad():
            self.ft.weight[PAD].zero_()

    def forward(self, a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        x = self.ft(a).sum(1) + self.bias
        y = self.ft(b).sum(1) + self.bias
        hi = CLIP / Q1
        x = torch.clamp(x, 0.0, hi)
        y = torch.clamp(y, 0.0, hi)
        return self.out(torch.cat((x, y), 1)).squeeze(1)
