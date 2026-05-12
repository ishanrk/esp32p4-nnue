# NNUE Profile Comparison

## Controlled question

The substantive sweep compares the existing `4x128`, `8x64`, `8x96`, and
`16x48` profiles under a 512 KiB model ceiling. Every run used the same ten
million accepted positions, split assignment, AdamW optimizer, transformed
smooth-L1 objective, batch size 4096, learning rate 0.001, weight decay 0.01,
score scale 400, validation checkpoint rule, and twelve-epoch budget. Seed 7
was common to the four-way sweep. Test data was not evaluated during selection.

The profile name is bucket count by hidden width. With `B` buckets and width
`H`, the version 3 format uses:

```text
model bytes = 32 + 6H + 640BH
accumulator bytes = 4H
training parameters = (640B + 4)H + 1
```

## Training results

All four profiles trained on 9,000,455 positions and selected epoch 12 using
500,453 validation positions. Export produced the exact expected byte count and
zero saturation in feature weights, feature bias, output weights, and output
bias.

| profile | model bytes | parameters | accumulator bytes | seed 7 validation loss | validation MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4x128 | 328480 | 328193 | 512 | 0.06631719 | 4512.89 cp |
| 8x64 | 328096 | 327937 | 256 | 0.06715742 | 4517.70 cp |
| 8x96 | 492128 | 491905 | 384 | 0.06623187 | 4513.59 cp |
| 16x48 | 491840 | 491713 | 192 | 0.06729667 | 4519.63 cp |

The first sweep advanced `4x128` and `8x96`. Repeating each with seeds 17 and
29 produced:

| profile | seed losses 7 17 29 | mean | median | spread |
| --- | --- | ---: | ---: | ---: |
| 4x128 | 0.06631719 0.06636357 0.06652224 | 0.06640100 | 0.06636357 | 0.00020505 |
| 8x96 | 0.06623187 0.06637391 0.06641640 | 0.06634073 | 0.06637391 | 0.00018452 |

The means differ by only 0.00006027 and their median ordering reverses. This is
not enough evidence to treat one validation result as a decisive strength
difference.

## Engine matches

The suite contains 128 unique positions after twelve plies of legal standard
games from the official CC0 Lichess January 2013 rated-game export. Each pairing
plays both colors for 256 games. Architecture-isolating matches use the seed 7
checkpoint for every profile.

| engine A | engine B | depth | A wins draws losses | A score | Elo and 95 percent uncertainty |
| --- | --- | ---: | --- | ---: | ---: |
| 4x128 | 8x64 | 4 | 66 147 43 | 54.49 percent | +31.30 plus or minus 27.79 |
| 8x96 | 8x64 | 4 | 73 131 52 | 54.10 percent | +28.56 plus or minus 29.79 |
| 16x48 | 8x64 | 4 | 36 165 55 | 46.29 percent | -25.83 plus or minus 25.37 |
| 4x128 | 8x96 | 4 | 49 155 52 | 49.41 percent | -4.07 plus or minus 26.78 |
| 4x128 | 8x96 | 5 | 61 140 55 | 51.17 percent | +8.14 plus or minus 28.70 |

The finalist matches are statistically inconclusive. The selected `4x128`
network also scored 81 wins, 123 draws, and 52 losses against the unchanged
classic evaluator at depth 4, or 55.66 percent and an estimated +39.53 Elo plus
or minus 30.75.

## Host measurements

These x86-64 GCC release results are directional and are not ESP32 P4 timing.
`p4bench` ran 500,000 evaluations on each of six positions and reported the
median of five depth-5 searches.

| profile | evals per second | start nps | kiwipete nps | middlegame nps | position bytes | undo bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4x128 | 25417051 | 7494000 | 3568277 | 3260378 | 2768 | 24 |
| 8x64 | 45364503 | 7735885 | 4128450 | 5534919 | 2512 | 24 |
| 8x96 | 30601940 | 7568143 | 3357533 | 4553197 | 2640 | 24 |
| 16x48 | 62309178 | 8914597 | 4435726 | 5887458 | 2448 | 24 |

## Reference selection

`4x128` is the provisional pre-hardware reference. Its validation distribution
and direct play are indistinguishable from `8x96`, while its model is 163648
bytes smaller. Seed 7 had the selected architecture's best validation loss, so
that checkpoint was exported. Only after selection, the untouched 499,092
position test split measured transformed loss 0.06664835 and centipawn MAE
4529.96. Python and C integer inference agreed exactly on 1,000 deterministic
test positions.

`results/profile_comparison.json` is the machine-readable source for the full
comparison. `models/reference.json` describes the selected artifact. Physical
ESP32 P4 memory, timing, and playing measurements can still revise this
provisional choice.

## Reproduction

Prepare one labeled corpus into each profile, keeping the split assignments
unchanged, then train with the common command:

    python3 train/prep.py data/reference_labels.jsonl data/reference_4x128 \
        --shard-size 250000 --profile 4x128
    python3 train/train.py data/reference_4x128 model_4x128_seed7.pt \
        --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
        --score-scale 400 --device auto --workers 0 --weight-decay 0.01
    python3 train/export.py model_4x128_seed7.pt model_4x128_seed7.nnue

Repeat for all profiles with the same seed, and for finalist seeds 17 and 29.
After selection, evaluate the test split once with `train/evaluate.py`.
