# Testing

The project intentionally has one focused C regression binary registered as
p4test. Running it directly prints ok on success; CTest supplies failure
reporting for normal builds and continuous integration.

The binary checks:

- the fixed 32-byte NNUE header
- six canonical perft positions at their recorded depths
- position validity after every perft depth
- incremental NNUE accumulators against full refresh after every legal root move
- NNUE make and undo restoration for normal, castling-rich, en passant, and promotion positions
- a depth-three search smoke test with a one-megabyte transposition table

The generated mock network has deterministic nonzero biases and weights, so
incremental tests compare meaningful accumulator changes without checking in a
binary model.

Release test:

    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --parallel
    ctest --test-dir build --output-on-failure

Sanitizer test:

    cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
    cmake --build build-san --parallel
    ctest --test-dir build-san --output-on-failure

Clang uses the same commands in a separate directory with
CMAKE_C_COMPILER=clang. The CI workflow runs the GCC release and sanitizer
configurations.
