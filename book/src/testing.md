# Testing

The project intentionally has one focused C regression binary registered as
p4test. Running it directly prints ok on success; CTest supplies failure
reporting for normal builds and continuous integration.

The binary checks:

- the fixed 32-byte NNUE header
- coordinate-generated pawn, knight, and king attacks for every source square
- bishop, rook, and composed queen attacks against an independent square-walking implementation
- sliding attacks with empty, full, edge, center, adjacent-blocker, distant-blocker, multiple-blocker, and fixed-seed occupancies
- supported FEN fields and a focused set of malformed board, side, piece, and en passant inputs
- defined position state after making and undoing a legal sequence containing en passant and castling
- six canonical perft positions at their recorded depths
- position validity after every perft depth
- incremental NNUE accumulators against full refresh after every legal root move
- NNUE make and undo restoration for normal, castling-rich, en passant, and promotion positions
- a depth-three search smoke test with a one-megabyte transposition table

The generated mock network has deterministic nonzero biases and weights, so
incremental tests compare meaningful accumulator changes without checking in a
binary model.

The sliding test implementation advances file and rank coordinates one square
at a time, includes the first occupied square, and then stops in that
direction. It does not call the production bishop or rook functions. Every
source square is checked against a bounded deterministic occupancy set, keeping
the coverage suitable for normal CI. Position restoration compares named
fields and arrays rather than padding bytes.

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
