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

## ESP32 P4 firmware

The single-core firmware embeds `models/reference.nnue` directly in mapped
read-only flash and binds it without copying the 328,480-byte model into heap
RAM. The search allocates a fixed 256 KiB transposition table from normal heap.

The supported toolchain is ESP-IDF 6.0.2 with RISC-V GCC 15.2.0, esptool 5.3.1,
and Python 3.10.12. Build the target and merged emulator image with:

```sh
. /home/ishan/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py fullclean
idf.py build
idf.py size
idf.py merge-bin -o esp32p4_nnue_merged.bin
```

The reference-model build produces a 488,320-byte application image and a
553,856-byte merged image, leaving 53% of the one-MiB application partition
free. The linker places the complete model in `.flash.rodata`; the size report
attributes 79,256 bytes to flash text, 356,276 bytes to flash read-only data,
7,980 bytes to internal data, and 16,776 bytes to internal BSS.

This verifies compilation and image layout for ESP32 P4. Physical boot, UART,
speed, memory headroom, power, and thermal behavior have not been tested yet.
