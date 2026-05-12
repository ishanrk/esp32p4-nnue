# esp32p4 nnue

A compact C11 chess engine for the ESP32 P4 RISC-V microcontroller. Training
runs on a host; the desktop executable and ESP-IDF firmware compile the same
chess core.

The engine combines bitboards with a 64-square lookup array, incremental make
and undo, incremental Zobrist hashing, iterative-deepening principal variation
search, quiescence, and a compact king-conditioned NNUE.

The selected first public NNUE profile is `4x128`: two perspectives, four
mirrored king buckets, 2560 sparse features per perspective, hidden width 128,
signed int8 feature weights, signed int16 accumulators and output weights,
clipped ReLU, and 328480 serialized bytes. Model format 3 has an
explicit little-endian layout and is shared by the host and firmware runtime.

## Start here

- [Learn the architecture](book/src/nnue_inference.md)
- [Train and export your network](book/src/train_model.md)
- [Choose training parameters and estimate RAM](book/src/training_parameters.md)
- [Test your network and engine](book/src/testing.md)
- [Build the ESP32 P4 firmware](book/src/firmware.md)

The substantively trained reference model is in `models/reference.nnue`; its
manifest is `models/reference.json`. Compact real measurements live under
`results`. The model was trained from ten million accepted positions in the
official CC0 Lichess Stockfish evaluation database. Physical ESP32 P4 timing is
still pending.

## Host build

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

The build produces:

- `p4nnue` for UCI
- `p4eval` for one-model one-FEN integer checks
- `p4bench` for host profile and search measurements
- `p4test` for the C regression suite

Run the engine with:

    ./build/p4nnue

Example UCI input:

    uci
    setoption name EvalFile value model.nnue
    isready
    position startpos moves e2e4 e7e5 g1f3
    go depth 6
    quit

Host build trees, generated book HTML, datasets, caches, checkpoints, and
non-reference exported networks are ignored.

## ESP32 P4

The firmware is pinned to ESP-IDF 6.0.2. Install its ESP32-P4 tools, activate
the environment, then build from the firmware directory:

    . /home/ishan/esp-idf/export.sh
    cd esp
    idf.py set-target esp32p4
    idf.py build
    idf.py size
    idf.py merge-bin -o esp32p4_nnue_merged.bin

`esp/components/core/CMakeLists.txt` references the shared files in `src`
directly. The firmware build still binds a generated deterministic smoke
network for compile and flash-layout checks, allocates a fixed 256 KiB
transposition table, and starts the same UCI loop used by the desktop
executable. Integrating the trained reference binary into a physical-board run
is deliberately left for the firmware stage.

## Repository layout

- `.github` contains continuous integration
- `book` contains mdBook source and configuration
- `esp` contains the thin ESP-IDF wrapper
- `src` contains the shared chess core and desktop entry points
- `test` contains host fixtures and the C regression binary
- `train` contains labeling, preparation, training, export, and arena tools
