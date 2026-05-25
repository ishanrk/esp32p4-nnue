from __future__ import annotations

import torch

from profiles import (
    ACTIVATION_CLIP,
    DEFAULT_PROFILE,
    FEATURE_QUANTIZATION,
    NnueProfile,
)


class NnueNetwork(torch.nn.Module):
    def __init__(self, profile: NnueProfile = DEFAULT_PROFILE) -> None:
        super().__init__()
        self.profile = profile
        self.feature_transformer = torch.nn.Embedding(
            profile.feature_count + 1,
            profile.hidden_width,
            padding_idx=profile.padding_feature,
        )
        self.feature_bias = torch.nn.Parameter(
            torch.zeros(profile.hidden_width)
        )
        self.output = torch.nn.Linear(2 * profile.hidden_width, 1)
        torch.nn.init.normal_(self.feature_transformer.weight, std=0.02)
        with torch.no_grad():
            self.feature_transformer.weight[profile.padding_feature].zero_()

    def forward(
        self, side_features: torch.Tensor, opponent_features: torch.Tensor
    ) -> torch.Tensor:
        side = self.feature_transformer(side_features).sum(1) + self.feature_bias
        opponent = (
            self.feature_transformer(opponent_features).sum(1) + self.feature_bias
        )
        clip = ACTIVATION_CLIP / FEATURE_QUANTIZATION
        side = torch.clamp(side, 0.0, clip)
        opponent = torch.clamp(opponent, 0.0, clip)
        return self.output(torch.cat((side, opponent), 1)).squeeze(1)
