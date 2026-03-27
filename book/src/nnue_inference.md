# NNUE Inference

## Network layout

nnue_header_t is a fixed 32-byte header containing magic, version, bucket and
feature dimensions, hidden width, activation clip, two quantization factors,
reserved space, total file size, and output bias.

Every profile file stores, in order:

- the 32-byte header
- one signed 16-bit feature bias per hidden value
- two signed 16-bit output weights per hidden value
- bucket count times 640 times hidden width signed 8-bit feature weights

For the default 8x64 profile these arrays contain 64 biases, 128 output
weights, and 327680 feature weights, producing exactly 328096 bytes.

Header fields and 16-bit arrays use little-endian representation, matching the
supported host export and ESP32 P4 target.

Format version 2 identifies the vertically normalized and horizontally
king-mirrored feature semantics. Version 1 prototype networks are rejected even
though their dimensions match. The loader requires the exact eight-byte magic,
version 2, the compile-time bucket count and hidden width, 640 features per
bucket, activation clip 127, both quantization factors equal to 64, zero
reserved data, and the corresponding exact header and buffer sizes. It also
validates the safe feature-bias range before changing the active network.

load_nnue(path) reads and owns a host allocation. bind_nnue(data, size) validates
and borrows an existing memory image. Borrowed data must be at least two-byte
aligned and remain alive and unchanged until unload_nnue or the next successful
bind. A failed load or bind leaves an existing valid network active. The runtime
copies the validated header but keeps read-only pointers into the weight image.
unload_nnue releases only owned memory and clears all state. nnue_is_loaded
reports whether a validated network is active. Binding changes global network
state but cannot find existing positions, so a caller must refresh any position
that will be evaluated after a successful bind. FEN construction refreshes
automatically, and the UCI load path refreshes its current position explicitly.

## Features and accumulators

Each perspective first places its own side at the bottom by vertically flipping
the Black view. When the resulting king is on the right half, the entire view is
also flipped horizontally. Four normalized king files combine with one, two, or
four regular rank bands for 4, 8, or 16 buckets. The default uses two four-rank
bands. A bucket contains ten nonking piece classes across 64 normalized squares,
or 640 features. The default has 5,120 sparse features per perspective.

refresh_nnue_perspective receives a position and perspective. It finds that
side's king view, records its bucket and mirror orientation, starts its
compile-time-width signed int16 accumulator from feature bias, and adds every
active nonking feature vector. This is the only path that scans all pieces.
refresh_nnue rebuilds both perspectives and is the correctness oracle used by
tests.

add_nnue_feature and remove_nnue_feature update both perspectives for one
nonking piece-square change using the cached bucket and mirror state. Normal
moves, captures, promotions, en passant, and castling rook movement are composed
from these operations. A king is not itself a feature. Its perspective is
rebuilt only when its bucket or mirror orientation changes.

The accumulator range follows from the supported legal chess state. At most 30
nonking pieces contribute. Thirty signed int8 weights contribute between -3840
and 3810 to one lane. Restricting each exported feature bias to -28928 through
28957 therefore keeps every signed int16 accumulator between -32768 and 32767.
train/export.py applies that bound, and the loader rejects an image outside it.

## Output

evaluate_nnue reads the side-to-move accumulator first and the opponent
accumulator second. Each signed 16-bit value is clipped to the header's
nonnegative activation range. The two compile-time-width halves are multiplied
by signed int16 output weights, added to the signed int32 output bias, and
divided by the two quantization factors. The complete dot product uses signed
int64. Every supported comparison width is safe in int64 and the scaled result
fits int. evaluate_nnue performs no allocation or accumulator copy and returns
the side-to-move score.

## Export parity tools

`train/integer.py` reads the exported version 2 model directly. Its
`load_exported_model` function validates the fixed header, derives one supported
profile from its bucket count and width, validates byte size, array layout, and
accumulator-safe feature biases, and returns NumPy integer arrays with that
profile. `evaluate_integer` receives those arrays and a FEN, rebuilds sparse
features through the matching Python mapping, performs signed integer
accumulation and clipping, keeps the side-to-move perspective first, and uses
division truncated toward zero to match C. It does not call the floating
training network.

`p4eval` is the narrow C comparison executable. It receives an exported model
path and one quoted FEN, initializes the chess tables, loads and validates the
model through `load_nnue`, builds the position through `set_position_fen`, and
prints `evaluate_nnue`. The two commands below must print the same integer:

    python train/integer.py nn.bin "FEN"
    ./build/p4eval nn.bin "FEN"

The model regression test uses start positions, sparse pawn positions, and
queen positions with both sides to move. Exact equality protects sparse
accumulation, activation clipping, perspective order, signed dot products, and
negative division semantics at once.
