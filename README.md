# esp32p4-nnue

A small chess engine and NNUE project targeting the ESP32-P4 RISC-V microcontroller.

The repository currently contains a C chess engine with UCI and local CLI support plus a Python training and weight export pipeline. The current neural evaluator is still a desktop prototype. The next version will use quantized weights and incremental accumulators so evaluation can run efficiently on the ESP32-P4.

## target

The hardware target is the ESP32-P4. The engine will run directly on the microcontroller without Linux. Training stays on a desktop machine. The trained weights are exported and compiled or flashed with the engine firmware.

The main measurements will be model size, RAM use, evaluation latency, nodes per second and chess strength. A portable scalar implementation will be kept as the reference implementation. ESP32-P4 specific optimization will be measured against it.

## engine

`engine/` contains the chess engine, move generation, search, evaluation, UCI support and tests.

Build the desktop version with CMake:

```sh
cmake -S engine -B build
cmake --build build
ctest --test-dir build
```

Run the UCI engine:

```sh
./build/engine
```

Example commands:

```text
uci
isready
position startpos moves e2e4 e7e5 g1f3
go depth 5
quit
```

The local CLI is available with:

```sh
./build/engine --cli
```

## training

`train/` contains the current dataset, model, training and weight export code.

Install the Python dependencies with:

```sh
python -m pip install -r train/requirements.txt
```

The existing prototype can be trained with:

```sh
python train/train.py --samples 50000 --epochs 8 --out train/nnue_weights.bin
```

PGN input is also supported:

```sh
python train/train.py --pgn data/games.pgn --samples 200000 --epochs 10 --out train/nnue_weights.bin
```

This training path is temporary. It currently uses a simple 768 input network and a basic evaluation target. It will be replaced by the embedded NNUE training pipeline before hardware results are reported.

## embedded plan

The first embedded implementation will use integer inference and incremental accumulator updates during `make_move` and `unmake_move`. A full accumulator refresh will remain available for testing. Both paths must produce the same result.

After the scalar implementation is correct, the hot NNUE kernels will be optimized for the ESP32-P4. Hardware measurements will use the real board rather than simulator timing.

The project will compare several small network sizes under the same search and time controls. Engine strength will be measured with repeated games rather than prediction loss alone.

## repository

`engine/` contains the runtime and tests.

`train/` contains training and weight export code.

`book/` contains longer implementation notes.
