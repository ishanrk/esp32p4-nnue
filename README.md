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

The integer NNUE uses two vertically normalized perspectives, horizontal king
symmetry, eight king buckets, ten nonking piece classes, 640 piece-square
features per bucket, and 64 hidden values. Feature weights are signed int8,
accumulators and output weights use signed int16, and the version 2 exported
network is 328096 bytes. Make and undo maintain accumulators without snapshots.
The portable scalar C path is the correctness reference for later ESP32 P4 PIE
work.

## Host build and test

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

Run the UCI engine with:

    ./build/p4nnue

Example input:

    uci
    isready
    position startpos moves e2e4 e7e5 g1f3
    go depth 6
    quit

The test suite checks six standard perft positions, make and undo restoration,
incremental NNUE against full refresh, search terminal and draw semantics,
shared C and Python NNUE feature fixtures, transposition-table reuse,
deterministic results, and timeout restoration.

For AddressSanitizer and UndefinedBehaviorSanitizer:

    cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
    cmake --build build-san --parallel
    ctest --test-dir build-san --output-on-failure

## Training

Install the host dependencies:

    python -m pip install -r train/requirements.txt

Generate fixed-node Stockfish teacher labels, prepare sparse features, train,
and export:

    python train/label.py games.pgn stockfish labels.csv --nodes 20000
    python train/prep.py labels.csv data.npz
    python train/train.py data.npz model.pt
    python train/export.py model.pt nn.bin

Load the exported file through UCI:

    setoption name EvalFile value nn.bin

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
