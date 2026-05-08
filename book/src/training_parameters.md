# Training Parameters and Hardware Budget

Parameters have different scopes. Some affect only host training, some change
the prepared dataset, and the architecture and integer-format constants also
change firmware storage or runtime work. Values below describe the current
tools; they are starting points rather than universal recommendations.

## Parameter reference

| parameter | what increasing it usually changes | resource and scope |
| --- | --- | --- |
| dataset size | covers more positions and may improve generalization if the added data is varied | labeling time, teacher CPU, disk, and training time; host only |
| teacher node budget | produces more stable, generally stronger labels | Stockfish CPU time per labeled position; host only |
| stride | samples fewer positions from each game because only every nth ply is retained | reduces labels, disk, and training time; host only |
| minimum ply | excludes more early opening positions | changes the phase distribution and reduces labels; host only |
| validation and test percentages | reserve more complete games for measurement and leave fewer for weight updates | changes statistical confidence and training data, not firmware |
| shard size | holds more encoded positions in each NPZ file | increases peak preparation and loader memory while reducing file count; host only |
| epochs | gives the optimizer more passes over training data | training time and overfitting risk; host only |
| batch size | processes more positions per optimizer step | host accelerator or CPU memory and throughput; host only |
| learning rate | makes each optimizer update larger | convergence and stability; host only |
| score scale | delays tanh compression of large centipawn labels when increased | training objective only |
| bucket count | gives piece-square features more king-localized regions | model flash and refresh-table footprint; training and firmware |
| hidden width | gives every feature and accumulator more lanes | model flash, accumulator RAM, `position_t`, training compute, and inference work |
| model byte ceiling | permits larger architecture profiles when raised | firmware flash and possibly cache behavior; enforced at C compile time |
| feature quantization | changes the scale from floating feature parameters to signed int8 weights and signed int16 biases | frozen at 64 in model format 3; training export and firmware arithmetic |
| output quantization | changes the scale from floating output weights to signed int16 | frozen at 64 in model format 3; training export and firmware arithmetic |
| activation clip | allows a wider integer activation range when increased | frozen at 127 clipped ReLU in model format 3; training behavior and firmware arithmetic |

`--limit`, `--nodes`, `--stride`, `--min-ply`, `--validation-percent`, and
`--test-percent` belong to `train/label.py`. `--shard-size` and `--profile`
belong to `train/prep.py`. Epochs, batch size, learning rate, seed, score scale,
device, worker count, and weight decay belong to `train/train.py`.

Bucket count and hidden width are intentionally not free-form runtime options.
They come from a supported named profile and must match the CMake
`P4_NNUE_PROFILE`. Quantization and activation constants are part of the frozen
model format, so changing them requires an explicitly incompatible format and
matching runtime rather than an undocumented training tweak.

## Model flash

Let `B` be bucket count and `H` hidden width. There are 640 nonking
piece-square features per bucket. Model format 3 stores a 28-byte header, one
signed int32 output bias, `H` signed int16 feature biases, `2H` signed int16
output weights, and `640BH` signed int8 feature weights:

```text
model bytes = 28 + 4 + 2H + 4H + 640BH
            = 32 + 6H + 640BH
```

For the reference `8x64` profile:

```text
32 + 6 * 64 + 640 * 8 * 64 = 328096 bytes
```

The working ceiling is 512 KiB or 524288 bytes. The C runtime rejects profiles
above that ceiling at compile time and rejects blobs whose exact byte count or
header dimensions do not match the compiled profile.

## Accumulator and position RAM

Each position stores one signed int16 accumulator for each of two perspectives:

```text
accumulator bytes = 2 perspectives * H values * 2 bytes = 4H
```

At width 64 this is 256 bytes. On the tested host ABI the complete position is:

```text
position_t bytes = 2256 + 4H
                 = 2512 bytes at width 64
```

The 2256-byte remainder contains piece and occupancy bitboards, Zobrist history,
the square array, clocks, castling and en passant state, and cached king views,
including final structure padding. Confirm `sizeof(position_t)` with `p4bench`
for the actual compiler and target ABI rather than assuming a host measurement
is an ESP32 P4 result.

`undo_t` is 24 bytes and does not snapshot accumulators. A search ply keeps its
own position and move-ordering state elsewhere, so `position_t` is useful budget
input but is not the complete search-stack requirement.

## Transposition table RAM

One `tt_entry_t` is 16 bytes. `resize_transposition_table_bytes` converts a byte
budget to an entry count, rounds down to a power of two, and allocates:

```text
requested entries = floor(requested bytes / 16)
allocated entries = largest power of two not above requested entries
table bytes = allocated entries * 16
```

`resize_transposition_table` remains the desktop MiB convenience function. A
one-MiB request produces 65536 entries and exactly 1048576 table bytes. The
firmware's explicit 262144-byte budget produces 16384 entries. This allocation
is separate from the 328096 model bytes and per-position state.

## Frozen reference profile

The first public profile has two perspectives, eight king buckets arranged as
four horizontally normalized files by two four-rank bands, 5120 sparse features
per perspective, hidden width 64, signed int8 feature weights, signed int16
accumulators and output weights, signed int32 output bias, clipped ReLU from zero
through 127, feature and output quantization factors of 64, 256 accumulator
bytes per position, and a 328096-byte format-version-3 model.
