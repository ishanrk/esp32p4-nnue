# Training Pipeline

## 1) data sources
training accepts pgn input or random legal position sampling.

```python
boards = sample_pgn(args.pgn, max_positions=args.samples)
boards = random_legal_positions(count=args.samples)
```

## 2) labels
the default labeler uses heuristic centipawn values. you can replace this with
stockfish or your own teacher output later.

```python
def heuristic_cp(board: chess.Board) -> int:
    return material_white_minus_black(board)
```

## 3) train and export
model training and binary export are one command.

```powershell
python train/train.py --samples 50000 --epochs 8 --out train/nnue_weights.bin
```

## references
<https://pytorch.org/docs/stable/index.html>
<https://python-chess.readthedocs.io/en/latest/>
