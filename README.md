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

## Public site

The static React and TypeScript site at
[nnue.ishankumthekar.com](https://nnue.ishankumthekar.com) contains the direct
hardware chess interface and a 15-step implementation guide. The site uses the
same Block Blueprint heading font and black-and-lime visual language as Noir
Poker. The guide cites Chess Programming Wiki, Code Monkey King, Stockfish,
Lichess, Espressif, and the exact project source beside the relevant steps.
Downloaded diagrams retain visible author and license credits.

Chrome or Edge connects to the board through Web Serial on the PWR USB TO UART
connector and speaks the existing binary protocol without a backend. Detach the
serial device from WSL before giving it to the browser. The Guide tab covers the
shared engine, NNUE design, data, training, export, firmware, board validation,
browser protocol, and adaptation to another constrained target.

The hardware connection works from localhost or an HTTPS deployment. In both
cases the board stays connected to the visitor's computer and serial traffic
moves directly between the browser tab and USB rather than through the web host.

```sh
cd web
npm ci
npm run check
npm test
npm run build
npm run dev
```

## ESP32 P4 firmware

The single-core firmware embeds `models/reference.nnue` as its fallback network
and exposes protocol version 1 over the UART console. It can activate either the
embedded network in mapped read-only flash or a validated user network mapped
directly from the `nnue` partition. Neither path copies the 328,480-byte model
into heap RAM. Search allocates a fixed 256 KiB transposition table from normal
heap.

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

The UART-driver build produces a 514,384-byte application image, 22,768 bytes
larger than the polling-stdio build under the same hardware configuration. The
one-MiB application partition remains 51% free. The linker places the embedded
model in `.flash.rodata`; the size report attributes 95,344 bytes to flash text,
360,652 bytes to flash read-only data, 8,560 bytes to internal data, and 16,824
bytes to internal BSS.

Physical boot through `app_main` has been observed on an ESP32 P4 revision 1.3.
That first board test exposed a single-core watchdog failure in the polling
stdio receive loop. Firmware now uses the interrupt-driven ESP-IDF UART driver
with blocking receive and binary-transparent direct reads and writes. Physical
validation of this transport fix remains pending until the image is manually
reflashed. Search speed, memory headroom, power, and thermal behavior also
remain unmeasured on hardware.

## Board protocol version 1

Every request and response is one little-endian binary frame. The parser has a
fixed 1,034-byte buffer and performs no allocation.

| offset | bytes | field |
| --- | ---: | --- |
| 0 | 2 | ASCII magic `P4` |
| 2 | 1 | protocol version `1` |
| 3 | 1 | command |
| 4 | 2 | payload byte count from 0 through 1,024 |
| 6 | N | payload |
| 6 + N | 4 | IEEE CRC32 of bytes 2 through 5 and the payload |

A successful response uses the request command with bit 7 set. Empty success
payloads are acknowledgements. Command `0xff` is an error response containing
the rejected command byte followed by one error byte.

| id | request payload | success payload |
| ---: | --- | --- |
| `0x01` hello | empty | protocol version `u8` |
| `0x02` device info | empty | device record described below |
| `0x03` firmware info | empty | `u8` ASCII length then version bytes |
| `0x04` model info | empty | state `u8`, active bytes `u32`, CRC32 `u32`, maximum bytes `u32`, format/buckets/width `u16` each |
| `0x10` model begin | model bytes `u32`, model CRC32 `u32` | empty |
| `0x11` model chunk | sequential offset `u32`, then 1 through 1,020 data bytes | empty |
| `0x12` model commit | empty | empty |
| `0x20` position | 1 through 127 ASCII FEN bytes | empty |
| `0x21` go | budget type `u8`, budget `u32` | 29-byte search result |
| `0x22` bench | empty | 29-byte search result |

The device record is protocol `u8`, target `u8`, model state `u8`, NNUE
format/bucket count/hidden width as three `u16` values, maximum model bytes,
active model bytes, active model CRC32, and transposition-table bytes as four
`u32` values, then a `u8` firmware-version length and its ASCII bytes. Target 1
means ESP32 P4. Model states 1 and 2 mean embedded and uploaded. These are
ordinary self-reported values: version 1 has no authentication or cryptographic
identity field.

Go budget type 1 is fixed depth from 1 through 64. Type 2 is device-measured
milliseconds from 1 through 3,600,000. The fixed 29-byte result contains move
length at offset 0, up to five UCI bytes at 1, signed centipawn score `i32` at 6,
completed depth `u16` at 10, nodes `u64` at 12, elapsed milliseconds `u32` at
20, model state `u8` at 24, and model CRC32 `u32` at 25.

Error values are 1 version, 2 length, 3 checksum, 4 unknown command, 5 invalid
payload, 6 model too large, 7 model sequence, 8 model incomplete, 9 model
invalid, 10 storage, 11 invalid FEN, and 12 position required.

`board_protocol_encode_frame` receives a version, command, bounded payload, and
caller-owned output buffer and returns the encoded byte count or zero.
`board_protocol_feed` receives any fragment of serial bytes, retains only the
current bounded frame, verifies length/version/CRC, and dispatches a complete
request through `board_protocol_backend_t`. `board_model_upload_begin`,
`board_model_upload_accept`, and `board_model_upload_finish` own the sequential
offset, expected size, and streaming CRC state used by both firmware and host C
tests. They return a protocol error and never allocate.

### Model activation and storage

`esp/partitions.csv` reserves `0x52000` bytes at flash offset `0x110000`: one
4-KiB metadata sector plus the exact 328,480-byte supported model and 3,296
bytes of sector-rounding headroom. Upload begins by switching to the embedded
fallback and erasing this partition. Chunks must arrive once in increasing
offset order and are written directly to flash while CRC32 is accumulated.

Commit is accepted only after the exact byte count and transfer CRC match and
`validate_nnue` accepts format 3 with 4 buckets and width 128. The 20-byte
metadata body stores version, length, and CRC; its eight-byte `P4MODEL1`
validity marker is written last. At boot, firmware activates an uploaded model
only when the marker, metadata, full CRC, and NNUE validation all pass. Otherwise
it binds the embedded fallback. A committed upload is memory-mapped read-only
for inference.

`model_storage_init` discovers the partition, validates committed metadata, and
binds either the mapped upload or fallback. `model_storage_begin` switches to
fallback before erasing; `model_storage_chunk` advances the validated state and
writes only that chunk; `model_storage_commit` maps, validates, marks, and binds
the finished image. `app_main` connects those operations plus FEN and search
callbacks to the protocol parser. The normal desktop engine does not link any
of these ESP-facing files.

### Host client

The standard-library Python client uses a POSIX serial device and requires no
GUI or protocol package:

```sh
python3 esp/board_client.py --port /dev/ttyACM0 info
python3 esp/board_client.py --port /dev/ttyACM0 upload models/reference.nnue
python3 esp/board_client.py --port /dev/ttyACM0 position \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
python3 esp/board_client.py --port /dev/ttyACM0 search \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' --depth 5
python3 esp/board_client.py --port /dev/ttyACM0 search \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' --time-ms 1000
python3 esp/board_client.py --port /dev/ttyACM0 bench
```
