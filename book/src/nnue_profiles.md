# NNUE Profile Comparison

## Engineering question

This experiment asks whether a constrained embedded NNUE should spend capacity
on more king localization or greater hidden width. It holds two perspectives,
ten nonking piece classes, perspective normalization, horizontal king symmetry,
clipped ReLU, quantization, training objective, optimizer, seed, epoch budget,
and checkpoint selection constant. Only king bucket count and hidden width vary.

The working model-file ceiling is 512 KiB, or 524288 bytes. The four profiles
form two close-budget comparisons: 4x128 against 8x64 near 320 KiB, and 8x96
against 16x48 near 480 KiB. Every candidate is below the ceiling.

## Where the bytes go

Let `B` be bucket count and `H` be hidden width. Each bucket has 640 nonking
piece-square features. The serialized file contains a 32-byte header, `H`
signed int16 feature biases, `2H` signed int16 output weights, and `640BH`
signed int8 feature weights:

```text
model bytes = 32 + 6H + 640BH
```

The `640BH` term dominates. More buckets give the same piece-square relation
different weights in more king regions. This can represent king-localized
patterns more precisely, but each added bucket multiplies the feature table.
More hidden values let every active feature contribute to a wider learned
representation, but every position must maintain, clip, and consume those
additional accumulator lanes.

Training includes one zero padding embedding row that is not serialized. The
reported PyTorch parameter count is:

```text
training parameters = (640B + 4)H + 1
```

A position keeps one signed int16 accumulator per perspective, so its direct
accumulator cost is `2 * H * 2`, or `4H` bytes. Bucket count changes model flash
but does not directly enlarge the accumulator. Hidden width changes model flash,
accumulator RAM, `position_t`, refresh work, incremental update work, and output
work together.

| profile | model bytes | training parameters | accumulator bytes | `position_t` bytes | `undo_t` bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4x128 | 328480 | 328193 | 512 | 2768 | 24 |
| 8x64 | 328096 | 327937 | 256 | 2512 | 24 |
| 8x96 | 492128 | 491905 | 384 | 2640 | 24 |
| 16x48 | 491840 | 491713 | 192 | 2448 | 24 |

## King regions

All profiles first put the perspective side at the bottom and mirror files e
through h onto files d through a. The normalized king therefore has four files.
The 4-bucket profile uses those four files without a rank split. The default
8-bucket profile combines four files with two four-rank bands. The 16-bucket
profile combines four files with four two-rank bands. These are regular regions,
not learned or irregular buckets.

`P4_NNUE_PROFILE` selects one of `4x128`, `8x64`, `8x96`, or `16x48` while
configuring CMake. It becomes compile-time bucket and width constants. The
inference loops and position layout stay statically sized, and a binary accepts
only the matching model header. Python datasets and model manifests carry the
same named profile.

## Smoke training results

No substantive prepared dataset was available for this experiment. Every row
below uses the same seven-position committed fixture, split membership, seed 7,
three epochs, batch size 2, learning rate 0.001, score scale 400, AdamW weight
decay 0.01, CPU device, and minimum validation transformed-loss checkpoint
rule. Every run selected epoch 1. The fixture contains extreme labels and is far
too small for architecture or strength conclusions.

| profile | validation loss | validation MAE | test loss | test MAE | saturation FW FB OW OB |
| --- | ---: | ---: | ---: | ---: | --- |
| 4x128 | 0.265013 | 15049.99 cp | 0.053366 | 100.00 cp | 0 0 0 0 |
| 8x64 | 0.264954 | 15049.99 cp | 0.053413 | 100.05 cp | 0 0 0 0 |
| 8x96 | 0.265044 | 15050.01 cp | 0.053361 | 99.99 cp | 0 0 0 0 |
| 16x48 | 0.264962 | 15049.99 cp | 0.053398 | 100.02 cp | 0 0 0 0 |

The near-identical values are fixture noise. They do not rank the profiles and
must not be interpreted as Elo. All four trained smoke models quantized to zero
evaluations on the comparison positions, although each exact-size model still
passed Python and matching C inference checks.

## Host measurements

The host run used GCC 11.4 release builds. Integer throughput measures 3,000,000
calls across six fixed positions. Search uses a one-megabyte transposition table,
requests depth 5 on the same three positions, clears the table before each run,
and reports the median of five runs from the microsecond host timer. These are
x86-64 directional measurements, not ESP32 P4 performance.

| profile | integer evaluations per second |
| --- | ---: |
| 4x128 | 8,059,706 |
| 8x64 | 15,810,276 |
| 8x96 | 10,774,391 |
| 16x48 | 20,886,274 |

Every search returned score zero because the smoke models quantized to zero.
The stable results were `a2a3` after 4,346 nodes from start, `e2a6` after 36,344
nodes from kiwipete, and `d4c5` after 24,141 nodes from the midgame position.

| profile | position | median time | nodes per second |
| --- | --- | ---: | ---: |
| 4x128 | start | 772 us | 5,629,533 |
| 4x128 | kiwipete | 11,661 us | 3,116,713 |
| 4x128 | midgame | 6,493 us | 3,718,004 |
| 8x64 | start | 553 us | 7,858,951 |
| 8x64 | kiwipete | 8,649 us | 4,202,104 |
| 8x64 | midgame | 4,792 us | 5,037,771 |
| 8x96 | start | 634 us | 6,854,889 |
| 8x96 | kiwipete | 10,192 us | 3,565,934 |
| 8x96 | midgame | 5,711 us | 4,227,105 |
| 16x48 | start | 503 us | 8,640,159 |
| 16x48 | kiwipete | 8,117 us | 4,477,516 |
| 16x48 | midgame | 4,416 us | 5,466,711 |

Narrower profiles evaluate faster on this host. Search gains are smaller because
move generation, make and undo, table access, and ordering also consume time.
Equal node counts show that the zero-valued smoke models searched the same trees.

## Match harness result

`train/arena.py` drives two matching profile binaries through UCI at fixed depth,
uses four fixed openings, and reverses colors for eight games. The smoke check
used depth 2 and at most 60 played plies. Against each of 4x128, 8x96, and 16x48,
8x64 scored one win, six draws, and one loss for 50 percent. The win and loss
were the same color-reversed deterministic queen's-gambit game; six games hit
the smoke ply limit.

No Elo was calculated. The models provide identical zero evaluations, eight
games are insufficient, and this run validates orchestration rather than chess
strength. A substantive run should use at least 20 games before requesting the
script's simple Elo estimate and 95 percent uncertainty, and substantially more
games before treating the estimate as stable.

## Reference choice

The default remains 8x64. At the lower budget it is 384 bytes smaller than
4x128, halves accumulator RAM, and measured about twice the integer throughput.
The 8x96 profile spends roughly 50 percent more model storage and accumulator
RAM without substantive quality evidence. The 16x48 profile is the fastest and
uses the least accumulator RAM, but its model is roughly 50 percent larger than
8x64 and the smoke data cannot establish whether its extra king localization
compensates for narrower hidden capacity.

Keeping the established 8x64 default is the conservative evidence-based choice
until a substantive fixed dataset can measure validation, test, and match
strength. Physical ESP32 P4 measurements may still favor a different tradeoff:
RV32 memory access, flash placement, cache behavior, compiler code generation,
and later PIE kernels can change the host ranking.

## Reproduction

Calculate static sizes:

    python3 train/profiles.py

For each profile, prepare the same labeled source and train with identical
options:

    python3 train/prep.py labels.jsonl data-8x64 --profile 8x64
    python3 train/train.py data-8x64 model-8x64.pt \
        --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
        --score-scale 400 --device auto --workers 0 --weight-decay 0.01
    python3 train/export.py model-8x64.pt model-8x64.bin

Build and measure the matching C profile:

    cmake -S . -B build-8x64 -DCMAKE_BUILD_TYPE=Release \
        -DP4_NNUE_PROFILE=8x64
    cmake --build build-8x64 --parallel
    build-8x64/p4bench model-8x64.bin 500000 5 5

Run a color-reversed match only after preparing compatible models and binaries:

    python3 train/arena.py build-8x64/p4nnue model-8x64.bin \
        build-16x48/p4nnue model-16x48.bin \
        --depth 6 --max-plies 240 --opening-count 4

Repeat those commands for every candidate with the same data, training options,
benchmark depths, and openings. Large checkpoints, models, and logs remain
outside source control.
