# esp32p4 nnue

A compact C11 chess engine for the ESP32 P4 RISC-V microcontroller. Training
runs on a host; the desktop executable and ESP-IDF firmware compile the same
chess core.

## Current core

position_t combines twelve piece bitboards, color and total occupancy, and a
64-square lookup array. make_move and undo_move update this state, clocks,
castling, en passant, Zobrist history, and NNUE accumulators incrementally.
generate_moves covers castling, promotion, and en passant, with make_move as the
shared legality gate.

The single-threaded search uses iterative deepening principal variation search,
quiescence, a fixed-size transposition table, killer moves, history ordering,
check extension, and late move reduction.

The default integer NNUE uses two vertically normalized perspectives,
horizontal king symmetry, eight king buckets, ten nonking piece classes, 640
piece-square features per bucket, and 64 hidden values. Feature weights are
signed int8, accumulators and output weights use signed int16, and its version 2
exported network is 328096 bytes. Four constrained profiles remain reproducible
through one compile-time CMake setting; 8x64 stays the selected default. Make
and undo maintain accumulators without snapshots. The portable scalar C path is
the correctness reference for later ESP32 P4 PIE work.

## Host build and test

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

Run the UCI engine with:

    ./build/p4nnue

`build/p4bench` measures an exported model's integer evaluation and fixed-depth
search throughput. An experimental profile build uses, for example:

    cmake -S . -B build-16x48 -DCMAKE_BUILD_TYPE=Release \
        -DP4_NNUE_PROFILE=16x48
    cmake --build build-16x48 --parallel

Example input:

    uci
    isready
    position startpos moves e2e4 e7e5 g1f3
    go depth 6
    quit

The test suite checks six standard perft positions, make and undo restoration,
incremental NNUE against full refresh, search terminal and draw semantics,
shared C and Python NNUE feature fixtures, deterministic whole-game dataset
splits, compact data shards, baseline checkpoint selection, safe model export,
exact Python and C integer evaluation, transposition-table reuse, deterministic
results, and timeout restoration.

For AddressSanitizer and UndefinedBehaviorSanitizer:

    cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
    cmake --build build-san --parallel
    ctest --test-dir build-san --output-on-failure

## Training

Install the host dependencies:

    python -m pip install -r train/requirements.txt

Generate fixed-node Stockfish teacher labels, prepare compact sparse shards,
select the best validation checkpoint without loading the whole dataset, and
export the exact runtime format:

    python train/label.py games.pgn stockfish labels.jsonl --nodes 20000
    python train/prep.py labels.jsonl data --profile 8x64
    python train/train.py data model.pt --epochs 12 --batch 4096 --lr 0.001 \
        --seed 7 --score-scale 400 --device auto --workers 0
    python train/export.py model.pt nn.bin

Labeling samples every fourth ply from ply eight by default. A deterministic
seed assigns each complete source game to an approximately 90/5/5
training/validation/test split. Preparation writes `uint16` feature IDs and
clipped `int16` side-to-move centipawn labels to bounded NPZ shards, with the
exact mapping and teacher settings in `data/manifest.json`. Training writes the
selected checkpoint to `model.pt` and its reproducibility record to
`model.pt.json`. Export writes the 328096-byte `nn.bin` and model manifest
`nn.bin.json`; export fails instead of silently saturating parameters. The
implementation book describes the complete workflow and parameter tradeoffs.
The NNUE profile comparison page records exact size, RAM, host throughput, smoke
training, and arena-harness results without treating fixture metrics as strength.

Load the exported file through UCI:

    setoption name EvalFile value nn.bin

Evaluate one quoted FEN with the C runtime or its exact Python integer oracle:

    ./build/p4eval nn.bin "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    python train/integer.py nn.bin "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

## ESP32 P4

Install ESP-IDF, then build from the firmware directory:

    cd esp
    idf.py set-target esp32p4
    idf.py build
    idf.py -p PORT flash monitor

esp/components/core/CMakeLists.txt references the shared files in src directly.
esp/main/app.c only configures serial I/O and starts the UCI loop.

## Repository layout

- .github contains continuous integration
- book contains mdBook source and configuration
- esp contains the thin ESP-IDF wrapper
- src contains the shared core and desktop UCI entry point
- test contains the host regression binary
- train contains teacher labeling, data preparation, training, and export

Generated book output, build trees, datasets, checkpoints, caches, and exported
networks are ignored.
