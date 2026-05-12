# Train and Test a Model

This page is the shortest complete path from PGN games and a Stockfish teacher
to a model loaded by the C engine. The first example deliberately uses the
small committed PGN fixture so every stage finishes quickly. It verifies the
workflow but does not produce a useful chess model.

The selected public profile is `4x128`. Use that profile throughout labeling,
preparation, training, export, and the C build. A model compiled for another
profile is intentionally rejected.

## Prerequisites

Run the commands from the repository root. Install Python 3, CMake, a C11
compiler, and a UCI-compatible Stockfish executable. Install the Python
dependencies with:

    python3 -m pip install -r train/requirements.txt

Build the matching host tools:

    cmake -S . -B build-guide-engine -DCMAKE_BUILD_TYPE=Release \
        -DP4_NNUE_PROFILE=4x128
    cmake --build build-guide-engine --parallel

`P4_NNUE_PROFILE` fixes the bucket count and hidden width at compile time. The
release build is appropriate for inference and search measurements. Training
still runs through Python on the host.

## 1 label PGN positions

Replace `/path/to/stockfish` with the installed Stockfish executable:

    python3 train/label.py \
        test/training_games.pgn /path/to/stockfish \
        build-guide/labels.jsonl \
        --nodes 100 --stride 1 --limit 1000 --min-ply 1 \
        --seed 0 --validation-percent 30 --test-percent 30 \
        --data-source "repository synthetic PGN fixture" \
        --data-license "fixture only" \
        --data-attribution "esp32p4-nnue test fixture"

The small node budget, dense stride, early minimum ply, and unusually large
validation and test percentages make all three fixture splits nonempty. They
are smoke-test settings, not recommendations for a real run. The labeler asks
Stockfish for a fixed node count, converts its score to the side-to-move
perspective, and writes one JSON object per sampled position. It also writes
`build-guide/labels.jsonl.meta.json` with the teacher identity, node budget,
split policy, sampling policy, and supplied source metadata.

For a substantive run, increase the position limit and teacher budget, choose
a sampling stride appropriate for the source, and return to a split such as
90/5/5. Keep the complete games in one split to prevent adjacent-position
leakage.

## 2 prepare sparse shards

    python3 train/prep.py \
        build-guide/labels.jsonl build-guide/data \
        --shard-size 8 --profile 4x128

`--shard-size 8` keeps the fixture visibly split across several small NPZ
files. A real run normally uses much larger shards. Preparation encodes both
perspectives as bounded `uint16` feature IDs, retains `int16` centipawn labels,
and writes `build-guide/data/manifest.json`. The profile, split counts, source
license and attribution, teacher, and sampling settings travel into that
manifest.

## 3 train and select a checkpoint

    python3 train/train.py \
        build-guide/data build-guide/model.pt \
        --epochs 2 --batch 8 --lr 0.001 --seed 7 \
        --score-scale 400 --device cpu --workers 0 --weight-decay 0.01 \
        --evaluate-test

Two epochs and a batch of eight keep this fixture run short. The learning rate,
score scale, optimizer, seed, and weight decay otherwise match the baseline
training path. CPU execution makes this verification available without CUDA.
The trainer selects the minimum validation transformed loss, writes the chosen
weights to `build-guide/model.pt`, and records architecture, data provenance,
teacher, options, environment, validation metrics, and final test metrics in
`build-guide/model.pt.json`.

## 4 export the frozen integer format

    python3 train/export.py \
        build-guide/model.pt build-guide/model.nnue

Export reads the training manifest beside the checkpoint. It rejects wrong
dimensions, unsupported profile values, nonfinite parameters, unsafe feature
biases, and any quantization saturation. The result is the exact 328480-byte
format-version-3 model plus `build-guide/model.nnue.json`. The JSON sidecar is
human metadata; it is not embedded in the binary.

Confirm the byte count and inspect the manifest:

    python3 -c 'from pathlib import Path; print(Path("build-guide/model.nnue").stat().st_size)'
    python3 -m json.tool build-guide/model.nnue.json

The first command must print `328480` for `4x128`.

## 5 compare Python and C exactly

Use a quoted six-field FEN for both evaluators:

    python3 train/integer.py build-guide/model.nnue \
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    build-guide-engine/p4eval build-guide/model.nnue \
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

The integer scores must match exactly. `train/integer.py` is the readable
format and arithmetic reference implementation; `p4eval` exercises the same loader and evaluator
used by the engine core.

## 6 load through UCI and search

    printf '%s\n' \
        uci \
        'setoption name EvalFile value build-guide/model.nnue' \
        isready \
        'position startpos' \
        eval \
        'go depth 3' \
        quit | build-guide-engine/p4nnue

The output must contain `info string nn loaded`, one integer evaluation, search
information through depth three, and a legal `bestmove`. Timing and nodes per
second describe only the host that ran this command, not the ESP32 P4.

## Substantive Lichess workflow

The official [Lichess open database](https://database.lichess.org/) publishes a
CC0 Stockfish evaluation stream. The reference run used the live dump dated
2026-08-02. It chose depth 20 after a pilot, scanned nearly 48 million records,
and used a seeded one-in-four decision to accept ten million positions:

    python3 train/import_evals.py \
        https://database.lichess.org/lichess_db_eval.jsonl.zst \
        data/reference_labels.jsonl \
        --limit 10000000 --min-depth 20 \
        --selection-denominator 4 --seed 7 \
        --validation-percent 5 --test-percent 5 --workers 12

Encode that one normalized corpus separately for every profile so split
membership remains identical:

    python3 train/prep.py data/reference_labels.jsonl data/reference_4x128 \
        --shard-size 250000 --profile 4x128

Train a sweep without reading test labels:

    python3 train/train.py data/reference_4x128 model_4x128_seed7.pt \
        --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
        --score-scale 400 --device auto --workers 0 --weight-decay 0.01

Repeat preparation and training for every supported profile with the same
options. Choose architectures and checkpoints using validation, matches, and
resource measurements. Only after that selection evaluate the chosen test
split and export again so the manifest contains the one final result:

    python3 train/evaluate.py data/reference_4x128 model_4x128_seed7.pt
    python3 train/export.py model_4x128_seed7.pt reference.nnue

## Reference artifact status

The repository reference is the substantive `4x128` seed 7 checkpoint.
`models/reference.nnue` contains the exact version 3 integer network and
`models/reference.json` records the ten-million-position corpus, training
parameters, validation-only checkpoint selection, final untouched test result,
zero saturation counts, integer parity, matches, and host benchmarks. The model
was not retrained after the test result was observed.
