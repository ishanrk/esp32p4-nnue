# Build

## Host release build

Configure from the repository root, compile the shared core, UCI executable,
and test binary, then run the registered test:

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

The resulting programs are build/p4nnue and build/p4test. The core is the static
library p4core. Compiler warnings are applied to all three targets.

When NumPy and python-chess are installed, CTest also registers the training
data transformation test. Continuous integration installs those two host
dependencies before configuring CMake. The feature-mapping test remains pure
Python and runs whenever a Python interpreter is available.

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
