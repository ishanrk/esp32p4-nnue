# esp32p4 nnue

A compact C11 chess engine and integer NNUE for the ESP32 P4. The desktop UCI
engine and thin ESP-IDF firmware compile the same core. Host training produced
the substantive `4x128` network in `models/reference.nnue`; physical ESP32 P4
performance is still pending.

## Host engine

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
./build/p4nnue
```

## Public guide

The static React and TypeScript guide covers training, architecture, results,
the reference download, and firmware status. It is configured for
[nnue.ishankumthekar.com](https://nnue.ishankumthekar.com).

```sh
cd web
npm ci
npm run check
npm run build
npm run dev
```

The build copies `models/reference.nnue`, `models/reference.json`, and the
compact `results` JSON into generated output. It does not keep a second model
copy in source control.
