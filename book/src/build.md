# Build

## Host release build

Configure from the repository root, compile the shared core, UCI executable,
and test binary, then run the registered test:

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

The resulting programs are build/p4nnue, build/p4eval, build/p4bench, and
build/p4test. The core is the static library p4core. Compiler warnings are
applied to every C target. p4eval loads one exported model and FEN for integer
inference checks. p4bench reports profile sizes, integer evaluation throughput,
and repeatable fixed-depth search measurements.

When NumPy and python-chess are installed, CTest also registers the training
data and model export tests. The model test invokes p4eval and requires exact
agreement with the Python integer implementation. When PyTorch is also
installed, CTest registers a short two-epoch fixture training test for best
checkpoint and manifest behavior. Continuous integration installs the light
data and model-test dependencies; it does not install the large training
framework. The feature-mapping test remains pure Python and runs whenever a
Python interpreter is available.

## Compile-time NNUE profile

`P4_NNUE_PROFILE` is the host build selection point for experimental NNUE
dimensions. The default is the chosen `4x128` profile. The supported comparison
values are `4x128`, `8x64`, `8x96`, and `16x48`:

    cmake -S . -B build-16x48 -DCMAKE_BUILD_TYPE=Release \
        -DP4_NNUE_PROFILE=16x48
    cmake --build build-16x48 --parallel

CMake passes the selected bucket count and hidden width as public compile-time
definitions to the core and its host executables. `src/nnue_config.h` supplies
the fixed 4x128 selection used by firmware. There is no runtime profile branch
in inference or incremental updates. A binary rejects a model whose header does
not match its compiled profile.

## Sanitizer and compiler checks

AddressSanitizer and UndefinedBehaviorSanitizer are enabled by P4_SAN:

    cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
    cmake --build build-san --parallel
    ctest --test-dir build-san --output-on-failure

To check Clang explicitly, set CMAKE_C_COMPILER in a separate build directory:

    cmake -S . -B build-clang -DCMAKE_C_COMPILER=clang -DCMAKE_BUILD_TYPE=Release
    cmake --build build-clang --parallel
    ctest --test-dir build-clang --output-on-failure

## Firmware build

The firmware uses ESP-IDF 6.0.2 and the `esp32p4` target. The full toolchain,
configuration, embedding, artifacts, and current size report are described in
[ESP32 P4 Firmware](firmware.md).

## Book build

book/book.toml sends generated HTML to the ignored book/book directory:

    mdbook build book

Only book.toml and book/src are source controlled.
