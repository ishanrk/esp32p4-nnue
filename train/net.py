from __future__ import annotations

import torch

from features import (
    ACTIVATION_CLIP,
    FEATURE_COUNT,
    FEATURE_QUANTIZATION,
    HIDDEN_SIZE,
    OUTPUT_QUANTIZATION,
)

Q1 = FEATURE_QUANTIZATION
Q2 = OUTPUT_QUANTIZATION
CLIP = ACTIVATION_CLIP


class NnueNetwork(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.feature_transformer = torch.nn.Embedding(
            FEATURE_COUNT + 1, HIDDEN_SIZE, padding_idx=FEATURE_COUNT
        )
        self.feature_bias = torch.nn.Parameter(torch.zeros(HIDDEN_SIZE))
        self.output = torch.nn.Linear(2 * HIDDEN_SIZE, 1)
        torch.nn.init.normal_(self.feature_transformer.weight, std=0.02)
        with torch.no_grad():
            self.feature_transformer.weight[FEATURE_COUNT].zero_()

    def forward(
        self, side_features: torch.Tensor, opponent_features: torch.Tensor
    ) -> torch.Tensor:
        side = self.feature_transformer(side_features).sum(1) + self.feature_bias
        opponent = (
            self.feature_transformer(opponent_features).sum(1) + self.feature_bias
        )
        clip = CLIP / Q1
        side = torch.clamp(side, 0.0, clip)
        opponent = torch.clamp(opponent, 0.0, clip)
        return self.output(torch.cat((side, opponent), 1)).squeeze(1)
