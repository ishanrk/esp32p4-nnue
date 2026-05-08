# ESP32 P4 Firmware

## Toolchain

Firmware is pinned to ESP-IDF 6.0.2. The matching installation used for the
current build is `/home/ishan/esp-idf`, with RISC-V GCC 15.2.0 from Espressif
crosstool-NG `esp-15.2.0_20251204`, esptool 5.3.1, and Python 3.10.12. A fresh
installation can select only the ESP32-P4 tools:

    git clone --recursive --branch v6.0.2 --depth 1 \
        https://github.com/espressif/esp-idf.git /home/ishan/esp-idf
    cd /home/ishan/esp-idf
    ./install.sh esp32p4
    . ./export.sh

The installation is outside this repository. Tool archives, the ESP-IDF Python
environment, generated `sdkconfig`, firmware objects, binaries, and linker maps
are not source-controlled.

## Shared core and startup

`esp/components/core/CMakeLists.txt` compiles `bitboard.c`, `position.c`,
`movegen.c`, `search.c`, `evaluate.c`, `nnue.c`, `system.c`, and `uci.c` directly
from `src`. There is no firmware copy of the engine. The component adds only the
ESP timer dependency needed by current_time_ms and applies the same strict C
warnings used by the host.

app_main configures unbuffered standard input and output, calls
initialize_chess, binds the embedded network, allocates the transposition table,
prints one metadata banner, and enters run_uci_loop. The loop receives the
caller-owned table, builds its own current position, and supports engine
identity, readiness, position loading, fixed-depth search, perft, evaluation,
and quit. Firmware does not expose host file-model or hash-resize options. No
WiFi, Bluetooth, display, web server, or filesystem initialization is present.

## Model embedding

The repository has no substantive reference network yet. For firmware build
and binding checks, `esp/generate_smoke_model.py` reads the selected profile
constants from `train/profiles.py` and writes a deterministic format-version-3
8x64 image with the required header and an all-zero parameter payload. It is
328096 bytes because the runtime format has fixed dense dimensions. This smoke
network has no chess strength and is not the public reference model.

`esp/CMakeLists.txt` generates the file in the ignored build directory and uses
ESP-IDF `target_add_binary_data` to link it into flash read-only data. app_main
binds the linker start and end symbols directly. The inspected image placed the
model at aligned address `0x40020120` in `.flash.rodata`; its end was
`0x400702c0`. No full-model allocation or copy exists. The active network state
in BSS is a 24-byte descriptor holding read-only parameter pointers, the output
bias, and ownership flags.

## Core and memory policy

`CONFIG_FREERTOS_UNICORE=y` starts only CPU0 and derives
`CONFIG_ESP_SYSTEM_SINGLE_CORE_MODE=y`. Search remains single threaded. The main
task stack is 32768 bytes for the command buffers and recursive search working
set. These settings do not add SMP search.

The transposition table has an explicit 262144-byte budget. It contains 16384
16-byte entries and is allocated from the normal heap after boot. PSRAM support
is disabled, so this build uses internal memory and does not assume a particular
board's external RAM. The table is not part of static data or BSS. Its policy
can be revisited only after physical memory and speed measurements.

The inspected ESP-IDF size report was:

| memory | bytes | detail |
| --- | ---: | --- |
| flash | 435598 | 355884 rodata and 79242 text plus small metadata sections |
| DIRAM | 68388 | 43632 text 16776 bss and 7980 data |
| HP core RAM | 582 | 514 text and 68 data |
| LP RAM | 24 | reserved data |
| total image sections | 487592 | before binary padding |

The application binary is 487920 bytes or `0x771f0`. It leaves 560656 bytes,
53 percent, free in the one MiB factory partition. The bootloader is 23872
bytes. The merged raw image is 553456 bytes and starts at flash offset zero.

## Build artifacts

Activate the pinned environment and select the target once:

    . /home/ishan/esp-idf/export.sh
    cd esp
    idf.py set-target esp32p4

Run a clean production build and inspect it:

    idf.py fullclean
    idf.py build
    idf.py size
    idf.py merge-bin -o esp32p4_nnue_merged.bin

`CONFIG_COMPILER_OPTIMIZATION_PERF=y` selects ESP-IDF's performance build. The
project uses the minimal component build so unrelated networking stacks are not
linked. The generated outputs are:

- `esp/build/esp32p4_nnue.elf`
- `esp/build/esp32p4_nnue.bin`
- `esp/build/bootloader/bootloader.bin`
- `esp/build/partition_table/partition-table.bin`
- `esp/build/esp32p4_nnue_merged.bin`

This stage has compiled and linked the firmware for ESP32 P4 and inspected its
ELF map and image metadata. It has not booted on a physical ESP32 P4, exercised
UART commands on a board, measured speed or stack use, or validated the 256 KiB
heap allocation on hardware. No flash, monitor, eFuse, secure-boot, or
flash-encryption operation has been run.
