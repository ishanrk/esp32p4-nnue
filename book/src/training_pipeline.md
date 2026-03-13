# Training Pipeline

Training runs on a host and produces the integer network consumed by nnue.c.
The scripts are separate stages so datasets, labels, checkpoints, and exports
have clear ownership.

## Teacher labels

train/label.py receives a PGN path, a Stockfish-compatible executable, and an
output CSV path. It samples every configured stride, skips terminal positions,
asks the teacher for a fixed node budget, converts mate scores to a 30000-point
bound, and writes FEN plus a score from the side-to-move perspective.

## Sparse preparation

train/features.py is the pure-Python definition of the version 2 feature map.
It vertically flips the Black perspective, mirrors every square when the
normalized king is on files e through h, assigns the eight king buckets and ten
piece classes, and returns full zero-through-5119 feature indices.
test/nnue_features.txt supplies shared expected buckets and indices to the C and
Python tests.

train/data.py calls that mapping and pads each perspective to 30 active features
with sentinel index 5120. encode_position returns side-to-move features first
and opponent features second. load_csv stacks those arrays with floating-point
teacher scores.

train/prep.py reads the label CSV through load_csv and writes a compressed NPZ
with side features, opponent features, and labels.

## Training and export

NnueNetwork in train/net.py uses a 5121-row embedding, where the last row is a
zero padding feature, a shared 64-value feature bias, clipped ReLU, and a linear
output over the concatenated perspectives.

train/train.py shuffles deterministically from its seed, keeps five percent for
validation when available, trains with AdamW and a smooth L1 loss over
tanh-scaled centipawn values, and saves the model state.

train/export.py loads that state, quantizes feature weights and bias by Q1,
quantizes output weights by Q2, scales output bias by both, writes the fixed
version 2 header and arrays, and rejects any result that is not exactly 328096
bytes. Feature bias is clamped to -28928 through 28957 so any exported model is
safe for 30 signed int8 feature contributions in an int16 accumulator. This
pipeline defines the runtime format but does not provide the final trained
reference model.

    python train/label.py games.pgn stockfish labels.csv --nodes 20000
    python train/prep.py labels.csv data.npz
    python train/train.py data.npz model.pt
    python train/export.py model.pt nn.bin
