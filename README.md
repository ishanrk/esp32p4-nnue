# ESP32 P4 NNUE

This is a C11 chess engine for the Waveshare ESP32 P4 board. It uses an integer
NNUE, a small neural network that scores chess positions without floating point
math.

To play a first game with the reference board, start with
[the quickstart](docs/QUICKSTART.md). To connect a different engine, read
[the integration guide](docs/INTEGRATION.md) and
[the exact protocol reference](docs/PROTOCOL.md). The website talks to the
board over USB. It does not use a cloud chess engine.

[The browser client guide](docs/BROWSER_CLIENT.md) shows the small local API.

For what the host benchmarks prove and how to collect physical board evidence,
see [measurements and recovery](docs/MEASUREMENTS.md).

The desktop UCI engine and ESP IDF firmware compile the same chess core. The reference network is a `4x128` NNUE using 4 king regions, 128 hidden values, `int8` feature weights, `int16` accumulators, and a model of 328480 bytes.

For the full implementation walkthrough, including bitboards on RV32, search, NNUE architecture choices, training, model comparison, firmware, and browser communication:

[How it works](https://nnue.ishankumthekar.com/#how-it-works)

## Layout

```text
src/        chess engine, search, NNUE inference
train/      dataset preparation and NNUE training
models/     exported reference network and metadata
esp/        ESP32 P4 firmware and serial client
test/       engine and protocol tests
web/        browser interface and implementation guide
results/    model comparison results
```

## Desktop build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
./build/p4nnue --model models/reference.nnue
```

Model paths are explicit and relative to the launching shell unless absolute. A requested model that cannot be loaded exits with an error. `--classical` (also the default UCI mode without arguments) starts the handcrafted evaluator and reports that identity. UCI `setoption name EvalFile value PATH` activates a model; `<empty>` selects classical evaluation. Evaluator changes refresh the current position and clear cached search scores. Raw integer inference remains available through `p4eval`; search clamps predictions to ±29000 centipawns to reserve mate scores.

The host build supports GCC or Clang on POSIX systems. `go infinite` stays active until `stop`; `isready` remains responsive during search. Position, model, and Hash changes join the search worker before mutation. Missing optional Python dependencies are reported as skipped suites.

```bash
cmake -S . -B build-debug -DCMAKE_BUILD_TYPE=Debug -DP4_SAN=ON
cmake --build build-debug --parallel
ctest --test-dir build-debug --output-on-failure
python3 train/benchmark.py build/p4bench models/reference.nnue
python3 train/arena.py build/p4nnue models/reference.nnue build/p4nnue classic \
  --depth 1 --max-plies 4 --opening-count 1
```

The benchmark captures host and compiler identity, source state, binary and model hashes, raw timings, and comparisons of incremental inference with a full refresh. The two tiny arena games save move sequences and PGN. Draws caused by the move limit are labeled and imply no strength rating. The guide explains the operations included in each timing. Historical files under `results/` are preserved; their earlier experiments are not reproduced by these commands.

## ESP32 P4

```bash
. ~/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py build
```

The firmware embeds `models/reference.nnue` as its default network and can also load a compatible network from flash.

Firmware 1.2 uses ESP IDF 6.0.2 and retains protocol version 1. Search requests accept depth 1 through 12 or time 1 through 5000 milliseconds. Depth requests and BENCH also have a 5000 millisecond cap. The returned depth is the last completed iteration. Search yields every 64 visited nodes and has a recursion limit of 12 plies. The browser requests 2000 milliseconds and waits up to 10 seconds for the reply. A timeout or disconnect does not cancel computation on the chip. Commands remain serialized until search returns. Time limits are cooperative, with polling and scheduler overshoot. These are firmware policies, not measured board latency or stack guarantees.

```bash
python3 esp/board_client.py --port /dev/ttyACM0 info

python3 esp/board_client.py --port /dev/ttyACM0 search \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --depth 5
```

## Reference network

```text
profile             4x128
feature count       2560
parameters          328193
model size          328480 bytes
feature weights     int8
accumulators        int16
output weights      int16
activation          clipped ReLU
```

The network was selected after comparing multiple NNUE profiles under a model size constraint. Training, export, integer parity checks, and arena comparisons are documented in the guide and under `models/` and `results/`.

## Local release candidates

```bash
node web/scripts/build-client.mjs
npm pack ./sdk --pack-destination ./build
```

The package is not published. Read [licensing status](docs/LICENSE_STATUS.md)
before redistribution. The owner must choose a first party license and review
contribution provenance. Existing asset and font notices remain in place.
