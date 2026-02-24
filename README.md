# Uberchess_NN

1) What this is
This repository is an end to end chess stack with a C engine runtime, a UCI interface, a local playable CLI mode, and a Python neural network training and export pipeline.

2) Repository map
`engine/` contains chess runtime and protocol code.
`train/` contains data, labels, training, and binary export.
`book/` contains the implementation book.

3) Build commands
```powershell
cmake -S engine -B build
cmake --build build
ctest --test-dir build
```

4) UCI usage quick start
```powershell
./build/engine
```
Then type:
```text
uci
isready
position startpos moves e2e4 e7e5 g1f3
go depth 5
quit
```

5) CLI play mode
```powershell
./build/engine --cli
```
Example session:
```text
uberchess cli
type moves like e2e4, type 'go' for engine move, type 'quit' to exit

8  r n b q k b n r
7  p p p p p p p p
6  . . . . . . . .
5  . . . . . . . .
4  . . . . . . . .
3  . . . . . . . .
2  P P P P P P P P
1  R N B Q K B N R

   a b c d e f g h

cli> e2e4
cli> go
engine plays e7e5
```

6) Train neural network
Install Python dependencies:
```powershell
python -m pip install -r train/requirements.txt
```
Train from random legal positions:
```powershell
python train/train.py --samples 50000 --epochs 8 --out train/nnue_weights.bin
```
Train from PGN:
```powershell
python train/train.py --pgn data/games.pgn --samples 200000 --epochs 10 --out train/nnue_weights.bin
```

7) Weight export format
The exported binary is read directly by `engine/src/nnue.c`.
```text
magic: "UBNNUE1\0"
input_dim: uint32
hidden_dim: uint32
w1: float[hidden_dim][input_dim]
b1: float[hidden_dim]
w2: float[hidden_dim]
b2: float[1]
```

8) Example workflow
```powershell
python train/train.py --samples 30000 --epochs 6 --out train/nnue_weights.bin
cmake -S engine -B build
cmake --build build
./build/engine --cli
```

9) Notes on strength
The current model pipeline is fully functional and trainable. strength and accuracy depend on data quality and label source. for serious Elo gains, use high quality PGN and a stronger teacher signal.

10) Documentation
```powershell
mdbook build book
```
Open `book/book/index.html` in a browser.
