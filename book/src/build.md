# Build

## Host release build

Configure from the repository root, compile the shared core, UCI executable,
and test binary, then run the registered test:

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

The resulting programs are build/p4nnue, build/p4eval, and build/p4test. The
core is the static library p4core. Compiler warnings are applied to every C
target. p4eval loads one exported model and FEN for integer inference checks.

When NumPy and python-chess are installed, CTest also registers the training
data and model export tests. The model test invokes p4eval and requires exact
agreement with the Python integer implementation. When PyTorch is also
installed, CTest registers a short two-epoch fixture training test for best
checkpoint and manifest behavior. Continuous integration installs the light
data and model-test dependencies; it does not install the large training
framework. The feature-mapping test remains pure Python and runs whenever a
Python interpreter is available.

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

The ESP-IDF component in esp/components/core/CMakeLists.txt lists the same core
source files as the root build and adds src/uci.c. The firmware entry point only
configures unbuffered serial I/O before calling initialize_chess and
run_uci_loop.

    cd esp
    idf.py set-target esp32p4
    idf.py build

## Book build

book/book.toml sends generated HTML to the ignored book/book directory:

    mdbook build book

Only book.toml and book/src are source controlled.
