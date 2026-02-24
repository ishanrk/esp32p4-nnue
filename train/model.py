import torch


class FactorizedHalfKP(torch.nn.Module):
    def __init__(self, input_dim: int = 768, hidden_dim: int = 64, output_dim: int = 1):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.fc1 = torch.nn.Linear(input_dim, hidden_dim)
        self.act = torch.nn.ReLU()
        self.fc2 = torch.nn.Linear(hidden_dim, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = self.act(self.fc1(x))
        return self.fc2(h)
