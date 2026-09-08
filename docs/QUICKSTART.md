# Reference board first move

Use the Waveshare ESP32 P4 Module DEV KIT with 16 MB flash and the chip revision
settings in `esp/sdkconfig.defaults`. The existing photograph
`web/public/images/esp32-p4-module-dev-kit.jpg` shows the correct connector:
`PWR USB TO UART`, bottom left. The adjacent USB connector is not the serial
protocol port for this firmware.

You need a USB data cable, desktop Chrome or Edge, and firmware built using
ESP IDF 6.0.2. No training run or model upload is needed. The reference model
is included in the firmware. Other board revisions need their own checked
settings and are not universally supported by these flash arguments.

## Build

From the repository root after installing the specified IDF toolchain:

```sh
. "$HOME/esp-idf/export.sh"
idf.py -C esp set-target esp32p4
idf.py -C esp build
```

The target command regenerates local ESP configuration. Preserve any custom
settings before running it. This change compiled successfully on Linux with
IDF 6.0.2. A compiled image has not been physically validated in this task.

## Flash later

Prepare a local firmware archive and its source and binary hashes after building:

```sh
node web/scripts/build-client.mjs
npm pack ./sdk --pack-destination ./build
python3 tools/prepare_release.py
```

Inspect `build/release-candidate/manifest.json`. The firmware archive preserves
the relative paths required by the generated flash arguments. It is a local
candidate, not a public download or physically validated release. The manifest
records source digest, target, flash settings and SHA256 for each binary.

Connect the data cable to the photographed connector. Replace PORT with the
actual serial device, not a guessed path. These commands write the board and
were not run automatically.

```sh
idf.py -C esp -p PORT flash
```

Use the generated `esp/build/flash_args`. The current build places the
bootloader at `0x2000`, partitions at `0x8000`, application at `0x10000`.
Flash mode is dio, size 16 MB, frequency 80 MHz. Prefer generated arguments
over copying stale addresses. Uploaded model storage begins at `0x110000`
with size `0x52000`. It is not a separate model file to flash manually.

If the flasher cannot connect, close serial programs, check the data cable
and follow the board manufacturer's download mode instructions. Do not apply
these settings to another chip.

## Play

1. Close the flasher and serial monitor. Exit IDF monitor with `Ctrl+]`.
2. Reset the board. Open Play using HTTPS or localhost.
3. Choose Connect board, then its port. Startup takes about six seconds.
4. Check engine identity, firmware version and active model checksum.
5. Choose White and move e2 to e4. The chip searches and replies. Choosing
   Black starts a new game with the chip moving first.

A cancelled chooser is harmless. If a port is occupied, close the program
using it. An illegal reply is rejected without changing the browser position.
After timeout or an abandoned search, reset before reconnecting. Closing the
port does not stop the chip computation.

## Physical checks still required

Flash the final image, confirm displayed identity, play both colors, remove
and reconnect the cable while thinking, exercise promotion and terminal
positions, and perform the interruption procedure in [measurements](MEASUREMENTS.md).
Record board revision, operating system, browser version and image hash.
No physical pass is claimed by a host test or firmware compilation.
