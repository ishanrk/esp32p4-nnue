# Train and Test a Model

This page is the shortest complete path from PGN games and a Stockfish teacher
to a model loaded by the C engine. The first example deliberately uses the
small committed PGN fixture so every stage finishes quickly. It verifies the
workflow but does not produce a useful chess model.

The selected public profile is `8x64`. Use that profile throughout labeling,
preparation, training, export, and the C build. A model compiled for another
profile is intentionally rejected.

## Prerequisites

Run the commands from the repository root. Install Python 3, CMake, a C11
compiler, and a UCI-compatible Stockfish executable. Install the Python
dependencies with:

    python3 -m pip install -r train/requirements.txt

Build the matching host tools:

    cmake -S . -B build-guide-engine -DCMAKE_BUILD_TYPE=Release \
        -DP4_NNUE_PROFILE=8x64
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
        --shard-size 8 --profile 8x64

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
        --score-scale 400 --device cpu --workers 0 --weight-decay 0.01

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
biases, and any quantization saturation. The result is the exact 328096-byte
format-version-3 model plus `build-guide/model.nnue.json`. The JSON sidecar is
human metadata; it is not embedded in the binary.

Confirm the byte count and inspect the manifest:

    python3 -c 'from pathlib import Path; print(Path("build-guide/model.nnue").stat().st_size)'
    python3 -m json.tool build-guide/model.nnue.json

The first command must print `328096` for `8x64`.

## 5 compare Python and C exactly

Use a quoted six-field FEN for both evaluators:

    python3 train/integer.py build-guide/model.nnue \
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    build-guide-engine/p4eval build-guide/model.nnue \
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

The integer scores must match exactly. `train/integer.py` is the readable
format and arithmetic oracle; `p4eval` exercises the same loader and evaluator
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

## Using the Lichess open database

The official [Lichess open database](https://database.lichess.org/) provides
monthly standard-rated game exports as compressed PGN. Those standard game
exports are released under CC0. Download a manageable month, decompress it with
a Zstandard tool, and feed the resulting PGN to the same label command. This is
a larger-scale template and is not part of the quick fixture validation:

    zstd -d lichess_db_standard_rated_YYYY-MM.pgn.zst -o games.pgn
    python3 train/label.py games.pgn /path/to/stockfish labels.jsonl \
        --nodes 20000 --stride 4 --limit 1000000 --min-ply 8 \
        --seed 7 --validation-percent 5 --test-percent 5 \
        --data-source "lichess standard rated games YYYY-MM" \
        --data-license "CC0-1.0" \
        --data-attribution "lichess open database"

Replace `YYYY-MM` with the downloaded filename and preserve the source page and
license in the metadata. Lichess broadcast exports use different licensing, so
do not describe them as standard-rated CC0 data. The repository does not ingest
the separate Lichess evaluation dump directly because its scores are not the
fixed-budget side-to-move teacher contract used here.

## Reference artifact status

There is no distributable reference model yet. The repository contains only
smoke fixtures, and their metrics do not establish chess strength. Consequently
there is no `models/reference.nnue` or `models/reference.json`. A later training
run may add those two files only after a substantive dataset, validation and
test metrics, match evidence, source license and attribution, teacher identity,
training configuration, and zero-saturation export are all recorded.
