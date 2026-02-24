# Training pipeline

## 1) install deps
```powershell
python -m pip install -r train/requirements.txt
```

## 2) train from random legal positions
```powershell
python train/train.py --samples 50000 --epochs 8 --out train/nnue_weights.bin
```

## 3) train from pgn
```powershell
python train/train.py --pgn data/games.pgn --samples 200000 --epochs 10 --out train/nnue_weights.bin
```

## 4) label behavior
default labels are heuristic centipawn estimates.

```python
from label import heuristic_cp
cp = heuristic_cp(board)
```

## 5) export behavior
weights are exported in a flat binary that the c runtime loads directly.

```python
from export_weights import export_nnue_weights
export_nnue_weights(model, "train/nnue_weights.bin")
```

## references
<https://pytorch.org/docs/stable/index.html>
<https://python-chess.readthedocs.io/en/latest/>
