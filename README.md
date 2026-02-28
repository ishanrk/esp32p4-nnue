# esp32p4 nnue

A compact chess engine for the ESP32 P4 RISC V microcontroller

The engine uses C11 bitboards a square board incremental make and undo alpha beta search and a quantized king bucket NNUE. Desktop and firmware builds share the same core code.

## current core

The board keeps piece bitboards color occupancy and direct square lookup. Sliding attacks use precomputed rays with nearest blocker lookup. Move generation covers castling promotion and en passant. Every generated move passes through the same make and undo path used by search.

Search uses iterative deepening principal variation search quiescence transposition tables killer moves history ordering and late move reduction.

The NNUE uses eight king buckets ten nonking piece classes and sixty four hidden values. Feature weights use int8. Accumulators use int16. The exported network occupies 328096 bytes. Move updates change only the affected feature vectors. King bucket changes rebuild one perspective.

The current inference path uses portable scalar C. The scalar path remains the correctness reference when the ESP32 P4 PIE kernel lands.

## build

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
ctest --test-dir build --output-on-failure
```

Run the UCI engine with

```sh
./build/p4nnue
```

Example input

```text
uci
isready
position startpos moves e2e4 e7e5 g1f3
go depth 6
quit
```

The test binary checks standard perft positions make and undo state incremental NNUE refresh equivalence and a search smoke test. A sanitizer build can be run with

```sh
cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
cmake --build build-san
ctest --test-dir build-san --output-on-failure
```

## training

Install the training tools with

```sh
python -m pip install -r train/requirements.txt
```

Create teacher labels from PGN games with a local Stockfish binary

```sh
python train/label.py games.pgn stockfish labels.csv --nodes 20000
```

Prepare the sparse feature data train the network and export the integer file

```sh
python train/prep.py labels.csv data.npz
python train/train.py data.npz model.pt
python train/export.py model.pt nn.bin
```

Load the file through UCI

```text
setoption name EvalFile value nn.bin
```

Training runs on the host. The exported weights run in the C engine.

## esp32 p4

Install ESP IDF then build from the firmware directory

```sh
cd esp
idf.py set-target esp32p4
idf.py build
idf.py -p PORT flash monitor
```

The firmware starts the same UCI loop over the configured serial console. Real cycle counts memory use and PIE results will come from the physical board.

## layout

`src` contains the engine and NNUE runtime

`test` contains host correctness tests

`train` contains teacher labeling training and export

`esp` contains the ESP IDF firmware wrapper
