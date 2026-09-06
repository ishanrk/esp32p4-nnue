# ESP32 P4 NNUE (Essentially A NN hosted on a Microcontroller)

C11 chess engine with an integer NNUE targeting the board Waveshare ESP32 P4.

The desktop UCI engine and ESP-IDF firmware compile the same chess core. The reference network is a `4x128` NNUE using 4 king regions, 128 hidden values, `int8` feature weights, `int16` accumulators, and a 328,480-byte model.

For the full implementation walkthrough, including bitboards on RV32, search, NNUE architecture choices, training, model comparison, firmware, and browser communication:

**[nnue.ishankumthekar.com/#guide](https://nnue.ishankumthekar.com/#guide)**

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

Model paths are explicit and relative to the launching shell unless absolute. A requested model that cannot be loaded exits with an error. `--classical` (also the no-argument UCI-compatible mode) starts the handcrafted evaluator and reports that identity. UCI `setoption name EvalFile value PATH` activates a model; `<empty>` selects classical evaluation. Evaluator changes refresh the current position and clear cached search scores. Raw integer inference remains available through `p4eval`; search clamps predictions to ±29000 centipawns to reserve mate scores.

## ESP32 P4

```bash
. ~/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py build
```

The firmware embeds `models/reference.nnue` as its default network and can also load a compatible network from flash.

Firmware 1.2 uses ESP-IDF 6.0.2 and retains protocol version 1. Search requests accept depth 1–12 or time 1–5000 ms. Depth requests and BENCH also have a 5000 ms cap; the returned depth is the last completed iteration. Search yields every 64 visited nodes and has a 16-ply recursion limit. The browser requests 2000 ms and waits up to 10 seconds for the reply. A timeout or disconnect does not cancel computation on the chip; commands remain serialized until search returns. Time limits are cooperative, with polling and scheduler overshoot. These are firmware policies, not measured board latency or stack guarantees.

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

The network was selected after comparing multiple NNUE profiles under the model-size constraint. Training, export, integer parity checks, and arena comparisons are documented in the guide and under `models/` and `results/`.
