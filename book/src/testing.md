# Testing

The project has one focused C regression binary named p4test and one pure-Python
feature-mapping test named p4features. CTest registers both when a Python
interpreter is available. Running p4test directly prints ok on success.

The binary checks:

- the fixed 32-byte NNUE header
- coordinate-generated pawn, knight, and king attacks for every source square
- bishop, rook, and composed queen attacks against an independent square-walking implementation
- sliding attacks with empty, full, edge, center, adjacent-blocker, distant-blocker, multiple-blocker, and fixed-seed occupancies
- supported FEN fields and a focused set of malformed board, side, piece, and en passant inputs
- defined position state after making and undoing a legal sequence containing en passant and castling
- packed move fields and UCI formatting for normal and promotion moves
- the tactical generation contract including quiet promotions and en passant
- all four castles plus check, transit attack, destination attack, missing-right, missing-rook, and irrelevant-square cases
- legal and discovered-check en passant cases
- quiet queen, rook, bishop, and knight promotions plus black and capture promotions
- pinned moves, king moves into attack, check evasions, and non-evasions
- malformed special move encodings without position corruption
- castling-right changes after rook moves and captures
- six canonical perft positions through practical release and sanitizer depths
- position validity after every perft depth
- incremental NNUE accumulators against full refresh after every legal root move
- version 2 loader magic, dimensions, quantization, size, alignment, and bias bounds
- borrowed binding and owned file-loading behavior
- shared C feature fixtures for both perspectives, king symmetry, buckets, classes, and edges
- quiet and double pawns, knight, bishop, rook, queen, capture, and en passant updates
- quiet promotion to every piece and capture promotion
- king moves within one view, across a bucket, and across horizontal symmetry
- king-side and queen-side castling for both colors
- NNUE make and undo restoration against full refresh for every focused case
- a deterministic 48-ply legal sequence with refresh checks after every make and undo
- clipped-zero, clipped-upper, positive, negative, and side-order evaluation cases
- host structure sizes for position, undo, transposition entries, and results
- checkmate, stalemate, a unique mate in one, and a short forced mate
- root fifty-move and repeated-position draw handling
- repeated fixed-depth searches on unique-move positions with stable score and move
- root position restoration after every search case
- no-table, empty-table, reused-table, and cleared-table score agreement
- mate-score consistency when cached positions are reached at different plies
- legal principal variation reconstruction from keyed table moves
- zero-sized table reset and power-of-two table allocation
- a time-limited search with legal fallback and last-completed-iteration retention

The generated mock network has deterministic nonzero biases and weights, so
incremental tests compare meaningful accumulator and evaluation changes without
checking in a binary model. A separate purpose-built model isolates activation
clipping and side-to-move ordering.

test/nnue_features.txt is the common mapping oracle. p4test evaluates it through
nnue_king_bucket and nnue_feature_index. train/test_features.py evaluates the
same rows through train/features.py and additionally checks vertical and
horizontal symmetric pairs. This prevents the runtime and training encoders
from agreeing only with themselves.

The sliding test implementation advances file and rank coordinates one square
at a time, includes the first occupied square, and then stops in that
direction. It does not call the production bishop or rook functions. Every
source square is checked against a bounded deterministic occupancy set, keeping
the coverage suitable for normal CI. Position restoration compares named
fields and arrays rather than padding bytes. Each special move test verifies
the incremental key after make and the defined position state after undo.
Search tests use unique mating or forced-evasion moves where best-move equality
matters. They do not freeze elapsed time or table-dependent node counts. The
timeout callback records the last completed iteration and verifies that a
partial iteration does not replace its depth, score, or move.

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
configurations. The Python mapping test can also be run directly:

    python3 train/test_features.py
