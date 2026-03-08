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

load_nnue(path) reads and owns a host allocation. bind_nnue(data, size) validates
and borrows an existing memory image, which supports firmware-embedded data and
tests. Both reject any mismatch in magic, version, dimensions, size, or zero
quantization factors. unload_nnue releases owned memory and clears all network
pointers. nnue_is_loaded reports whether a validated header is active.

## Features and accumulators

Each perspective has eight king buckets. Files e through h mirror onto d
through a, and ranks zero through three select the lower four buckets while
ranks four through seven select the upper four. A bucket contains ten nonking
piece classes across 64 squares, or 640 features. Across all buckets each
perspective has 5120 sparse features.

refresh_nnue_perspective receives a position and perspective. It finds that
side's king bucket, starts its 64-value signed 16-bit accumulator from feature
bias, and adds every active nonking feature vector. refresh_nnue rebuilds both
perspectives and is the correctness oracle used by tests.

add_nnue_feature and remove_nnue_feature update both perspectives for one
nonking piece-square change. make_move uses these operations for normal moves.
A king is not itself a feature; a king move calls
refresh_nnue_perspective after piece motion.

## Output

evaluate_nnue reads the side-to-move accumulator first and the opponent
accumulator second. Each signed 16-bit value is clipped to the header's
nonnegative activation range. The two 64-value halves are multiplied by signed
16-bit output weights, added to the signed 32-bit output bias, and divided by
the two quantization factors. It returns the resulting side-to-move score.
