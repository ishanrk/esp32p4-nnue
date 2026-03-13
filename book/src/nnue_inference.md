# NNUE Inference

## Network layout

nnue_header_t is a fixed 32-byte header containing magic, version, bucket and
feature dimensions, hidden width, activation clip, two quantization factors,
reserved space, total file size, and output bias.

The 328096-byte file stores, in order:

- the 32-byte header
- 64 signed 16-bit feature biases
- 128 signed 16-bit output weights
- 327680 signed 8-bit feature weights

Header fields and 16-bit arrays use little-endian representation, matching the
supported host export and ESP32 P4 target.

Format version 2 identifies the vertically normalized and horizontally
king-mirrored feature semantics. Version 1 prototype networks are rejected even
though their dimensions match. The loader requires the exact eight-byte magic,
version 2, 8 buckets, 640 features per bucket, width 64, activation clip 127,
both quantization factors equal to 64, zero reserved data, and exact header and
buffer sizes. It also validates the safe feature-bias range before changing the
active network.

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
also flipped horizontally. Four normalized king files and two rank halves form
the eight buckets. A bucket contains ten nonking piece classes across 64
normalized squares, or 640 features. Across all buckets each perspective has
5,120 sparse features.

refresh_nnue_perspective receives a position and perspective. It finds that
side's king view, records its bucket and mirror orientation, starts its 64-value
signed 16-bit accumulator from feature bias, and adds every active nonking
feature vector. This is the only path that scans all pieces. refresh_nnue
rebuilds both perspectives and is the correctness oracle used by tests.

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
nonnegative activation range. The two 64-value halves are multiplied by signed
16-bit output weights, added to the signed 32-bit output bias, and divided by
the two quantization factors. The complete dot product uses signed int64. Even
with all 128 activations at 127 and all output weights at an int16 extreme, the
dot product plus an int32 bias is safe in int64 and the scaled result fits int.
evaluate_nnue performs no allocation or accumulator copy and returns the
side-to-move score.
