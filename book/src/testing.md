# Testing

The project has one focused C regression binary named p4test and five Python
tests named p4features, p4data, p4model, p4arena, and p4training. CTest registers
p4features when a Python interpreter is available. NumPy and python-chess add
p4data and p4model; p4model receives the built p4eval path and compares Python
and C integer scores exactly. PyTorch additionally enables the short
p4training fixture run. Continuous integration installs the light data, model,
and arena-test dependencies but leaves PyTorch training to host environments that
install `train/requirements.txt`. Running p4test directly prints ok on success.

The binary checks:

- every fixed NNUE header offset field width and little-endian byte sequence
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
- version 3 loader magic, dimensions, quantization, size, alignment, and bias bounds
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

test/training_games.pgn contains eight short legal games with different lengths,
a Black-to-move setup, castling, captures, and promotions. train/test_data.py
uses a deterministic fake score callback, never an engine process, to check that
repeated labeling produces identical JSONL and that every game has one split.
test/training_labels.jsonl is a separate prewritten preparation fixture. Its
seven positions cover all three splits, both score clip boundaries, sparse
padding, and shard boundaries. The data test checks `uint16` feature and
`int16` label arrays, manifest and file counts, empty input, malformed FEN, and
cross-split rejection.

The Python feature test also checks the regular 4-, 8-, and 16-bucket regions,
exact candidate model sizes, parameter counts, accumulator bytes, and the
512-KiB ceiling. The data test prepares and validates profile-specific shards
for all four supported bucket and width combinations.

train/test_training.py prepares that same fixture in a temporary directory,
runs two CPU epochs, checks that a best validation checkpoint exists, and
verifies the reproducibility manifest, split counts, selection rule, validation
metrics, and final test metric. Its checkpoint and manifests are deleted with
the temporary directory. The test is deliberately tiny and says nothing about
network strength.

train/test_model.py exports deterministic floating fixture parameters into a
temporary exact-size model for the selected test profile. It checks the
28-byte header and output-bias bytes field by field, requires zero saturation
and no hash fields,
then compares Python and C integer evaluation for the initial board, a sparse
pawn board, and a queen board with both sides to move. Separate cases prove that
one out-of-range feature weight, accumulator-unsafe feature bias, output weight,
or output bias fails export, as does a nonfinite parameter. No binary fixture
model is committed.

train/test_arena.py validates the fixed opening positions, balanced Elo
calculation, and the rule that fewer than 20 games cannot request an Elo
estimate. The actual smoke arena invocation remains outside normal CTest so CI
does not start repeated engine searches.

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
configurations. The Python tests can also be run directly after installing the
host training dependencies and building p4eval:

    python3 train/test_features.py
    python3 train/test_data.py
    P4_EVAL_TOOL=build/p4eval python3 train/test_model.py
    python3 train/test_arena.py
    python3 train/test_training.py

The pre-hardware ESP32-P4 check uses the pinned ESP-IDF environment:

    . /home/ishan/esp-idf/export.sh
    cd esp
    idf.py fullclean
    idf.py set-target esp32p4
    idf.py build
    idf.py size
    idf.py merge-bin -o esp32p4_nnue_merged.bin

This compiles and links the shared core for ESP32 P4, validates image and
partition sizes, and creates a merged image for later emulator or board work.
It does not execute firmware boot, serial commands, search, or inference on an
ESP32 P4. No physical flash or monitor operation is part of this check.
