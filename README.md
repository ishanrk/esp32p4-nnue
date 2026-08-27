# ESP32 P4 NNUE

C11 chess engine with an integer NNUE targeting the Waveshare ESP32 P4.

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
./build/p4nnue
```

## ESP32 P4

```bash
. ~/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py build
```

The firmware embeds `models/reference.nnue` as its default network and can also load a compatible network from flash.

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
