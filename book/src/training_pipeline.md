# Training Pipeline

Training runs on a host and produces the integer network consumed by
`src/nnue.c`. This repository does not contain a final trained network or a
large dataset. It provides a reproducible path from source games through the
exported runtime model:

```text
pgn games
  -> sampled positions
  -> fixed-node stockfish labels
  -> compact sparse features
  -> train validation and test shards
  -> dataset manifest
  -> bounded baseline training
  -> best validation checkpoint
  -> safe integer quantization
  -> runtime model and model manifest
  -> exact python and c comparison
```

The labeled JSONL is retained separately from encoded data. It contains FENs
for inspection and re-encoding. Final NPZ shards contain only feature IDs and
scores, so repeated board text does not consume training storage.

## Choosing source data

Any legal standard-chess PGN can feed the reference labeler. Personal games,
engine matches, curated tournament games, and a filtered public corpus are all
reasonable sources. A mix of game phases and styles is more useful than many
near-duplicate games. The pipeline deliberately does not prescribe one magic
number of positions.

The official [Lichess open database](https://database.lichess.org/) publishes
monthly standard-game PGN archives under CC0. The same page has an Evaluations
section with a streaming JSONL Zstandard dump of Stockfish-evaluated positions.
Those public evaluations have different node counts and depths. The current
repository documents them but does not import them: the official schema does
not state the score perspective clearly enough to convert scores to this
engine's side-to-move contract without an authoritative validation case. Do not
feed raw public evaluation scores into this pipeline by guessing their sign.

Nothing in the scripts automatically downloads either database. Large PGN,
JSONL, Zstandard, NPZ, checkpoint, and network files are ignored so source data
does not accidentally enter Git.

## Teacher labeling

`train/label.py` receives a PGN path, a Stockfish-compatible executable, and an
output JSONL path. It opens the engine through UCI and records the engine's UCI
name and author in a companion `<output>.meta.json` file. A cryptographic engine
hash is neither calculated nor required.

`analyse_with_teacher(engine, board, nodes)` asks the engine to analyze one
position with exactly the configured node budget. A node budget limits searched
positions rather than elapsed seconds. A faster computer finishes sooner but
does not receive a larger nominal search allowance. Engine version and hardware
can still affect details, so the manifest records the UCI identity and node
budget needed to describe the run.

The teacher result is converted with `pov(board.turn)`. Every score is therefore
from the side-to-move perspective, matching the order consumed by the NNUE and
the sign returned by the C evaluator. Positive means the player about to move
is better. Mate values become finite scores within the 30000-point mate scale,
and all values are clamped to the inclusive -30000 through 30000 range.
`clip_score` rejects noninteger labels and performs this clamp before JSONL or
NPZ output.

`sampled_positions(game, stride, min_ply, max_ply)` walks a game's main line.
It validates the starting board, every move, and every resulting board. Invalid
input stops with the game and ply in the error instead of producing corrupt
labels. Terminal positions are skipped. A position is sampled when its ply is
at least `min_ply` and the ply number is divisible by `stride`. The default
minimum of eight reduces repeated early-opening positions. The default stride
of four labels one position every two full moves. `max_ply` is unlimited unless
set, so endgames are not systematically removed.

`write_labeled_positions` owns PGN reading and JSONL output while receiving a
score callback. The command passes the real UCI teacher callback; tests pass a
small deterministic fake callback and never start Stockfish. Each JSONL record
contains:

```json
{"fen":"...","game_id":12,"ply":24,"score":37,"split":"train"}
```

The maximum position count is global. It bounds an exploratory run without
silently triggering millions of analyses.

## Whole-game splits

Nearby positions from one game are highly correlated. Splitting individual
positions would let a training example and an almost identical validation
example come from adjacent plies. That leakage makes validation look better
without proving generalization.

`assign_game_split(game_id, seed, validation_percent, test_percent)` applies a
fixed noncryptographic 64-bit mixing rule to the sequential source game number
and seed. The resulting bucket assigns that complete game to one split. The
defaults are 90 percent training, 5 percent validation, and 5 percent test.
Actual counts vary because the assignment unit is a game and games contain
different numbers of sampled positions. The same ordered PGN, seed, and options
produce the same assignments. `validate_split_percentages` rejects negative
values and any pair that leaves no training percentage.

The splits have distinct roles:

- training positions update network weights
- validation positions measure choices during development without updating weights
- test positions remain isolated for a final assessment after choices are fixed

`train/train.py` consumes the prepared training shards without merging the
splits or creating a second position-level split. Test shards remain untouched
during optimization and checkpoint selection. They are read once after the
best validation checkpoint has been chosen.

## Exact sparse features

`train/features.py` is the single Python definition of the version 2 feature
map. It parses FEN piece placement, vertically normalizes the Black perspective,
horizontally mirrors every square when the normalized king is on files e
through h, selects a regular region from the requested 4-, 8-, or 16-bucket
profile, and maps ten nonking piece classes over 64 squares. The default
`feature_index` range is 0 through 5119. The default C runtime and Python test
read the common expected values in `test/nnue_features.txt`; additional Python
and exact-export tests cover every profile mapping.

`encode_position(fen)` receives one valid position and returns the side-to-move
feature list first and the opponent list second. An optional profile selects the
mapping. Each perspective contains at most 30 nonking features. The function
pads both lists to exactly 30 entries with the profile's feature count as its
sentinel. The feature transformer has a zero row at that sentinel, so padding
does not affect an accumulator.

The largest comparison profile uses active indices 0 through 10239 and 10240
as its padding sentinel. These fit in an unsigned 16-bit integer whose maximum
is 65535. Prepared shards therefore store features as `uint16`. Teacher scores
are already clamped to the engine's 30000 mate scale, so they safely use
`int16`.

One old encoded position used 60 `int64` IDs and one `float32` label:

```text
60 * 8 + 4 = 484 bytes
```

The compact representation uses 60 `uint16` IDs and one `int16` label:

```text
60 * 2 + 2 = 122 bytes
```

For one million positions that is approximately 484,000,000 bytes
(461.58 MiB) versus 122,000,000 bytes (116.35 MiB), before NPZ compression and
container overhead. The compact form saves 362,000,000 bytes (345.23 MiB), or
about 74.8 percent. This calculation multiplies record sizes; it does not
allocate a million-position array.

## Shards and manifest

`prepare_dataset(source_path, output_directory, shard_size, metadata_path,
profile)` streams labeled JSONL in source order. It requires records for a game
to remain grouped and rejects any game whose records change split. It keeps at
most one configured shard buffer per split, writes a buffer as soon as it fills,
and never loads all labeled positions at once. The default shard size is
100000, and the default profile is 8x64.

A prepared directory looks like:

```text
data/
  manifest.json
  train_00000.npz
  train_00001.npz
  validation_00000.npz
  test_00000.npz
```

Every NPZ contains three arrays:

- `side` is `uint16` with shape position count by 30
- `opponent` is `uint16` with the same shape
- `score` is `int16` with one side-to-move centipawn value per position

FEN, game number, ply, and split text remain in the source JSONL and do not
appear in a shard. Shard filenames and row ordering are deterministic for an
unchanged source and shard size.

`manifest.json` records dataset format version, feature mapping version, king
buckets, features per bucket, hidden width, padding feature, feature and label
dtypes, score perspective and clamp rule, requested shard size, filenames,
per-split position and shard counts, UCI teacher identity, teacher node budget,
stride, minimum and maximum ply, split percentages, and split seed. It contains
metadata rather than file hashes.

`load_dataset_manifest` rejects a dataset whose mapping, dimensions, dtypes,
padding, score perspective, or format version do not match the current profile.
`split_shard_paths` resolves one split's ordered filenames.
`load_shard` loads one NPZ and validates its keys, shapes, dtypes, feature range,
and score range before returning the three arrays. `train/train.py` uses these
functions to hold only one shard plus one batch conversion in memory. It may
shuffle shard and row order deterministically for optimization without changing
split membership.

## Baseline training

`NnueNetwork` in `train/net.py` receives side-to-move and opponent feature
tensors plus a profile. Its feature-count-plus-one-row embedding reserves the
last zero row for padding, adds one shared hidden-width feature bias to each
perspective, applies clipped ReLU, joins the perspectives, and returns one score
from the linear output layer.

`ShardDataset(shard_paths, seed, profile)` receives the ordered training shard
paths, an epoch seed, and the manifest profile. Each data-loader worker takes a
disjoint slice of the shuffled shard order, opens one shard at a time, and
yields its rows in a seeded order.
Memory is therefore bounded by one loaded shard and the loader's conservative
prefetch for each worker rather than the complete dataset. Worker count defaults
to zero and can be increased explicitly after measuring host memory and input
throughput.

`transformed_loss(prediction, target, score_scale)` applies smooth L1 to the
tanh-transformed prediction and teacher score. The bounded transform reduces
the leverage of very large centipawn and finite mate labels, while smooth L1 is
less sensitive to individual outliers than squared error. The default scale is
400 centipawns. This is still teacher-score regression, not WDL training or game
result mixing.

`evaluate_shards(network, shard_paths, batch_size, score_scale, device)` disables
gradients, reads one shard and one batch at a time, and returns transformed loss
and raw centipawn mean absolute error. It does not update the network.
`train_baseline` validates that every split is nonempty, seeds initialization
and row order, optimizes with AdamW, and evaluates validation after every epoch.
It replaces the saved checkpoint only when validation transformed loss reaches
a new minimum. After all epochs it reloads that checkpoint and evaluates the
test split for the first and only time. Training loss never selects a model.

An epoch is one pass over every training position. More epochs allow more
updates but eventually risk fitting the training set instead of improving held
out positions. Batch size is the number of positions used for one optimizer
update; larger batches usually improve device throughput and memory use, while
smaller batches make more updates and introduce more gradient variation.
Learning rate controls update size and is usually the first value to reduce if
loss is unstable. Score scale controls where tanh begins compressing large
scores: a smaller value focuses the loss more strongly on scores near equality,
and a larger value preserves more distinction between large evaluations.

The useful options and defaults are:

- `--epochs 12`
- `--batch 4096`
- `--lr 0.001`
- `--seed 7`
- `--score-scale 400`
- `--device auto`, which selects CUDA when available and otherwise CPU
- `--workers 0`
- `--weight-decay 0.01`

The checkpoint companion `<checkpoint>.json` records the named architecture,
exact dimensions, model byte size, training parameter count, seed, PyTorch and
NumPy versions, selected device, training options, dataset manifest path and
split counts, selection rule, best epoch, validation metrics, and final test
metrics. Initialization and data order are seeded. GPU kernels, library
versions, and different hardware may still produce different results, so GPU
runs are not claimed to be bit identical. The record intentionally contains no
cryptographic hash.

Validation loss is the primary selection metric. Validation and test
centipawn MAE report the mean absolute distance from teacher scores in familiar
units, but mate-scale labels and the distribution of positions can dominate the
number. A lower MAE is useful evidence for this regression objective; it is not
an Elo estimate and does not guarantee a stronger chess engine.

## Quantization and export

`load_checkpoint_parameters` reconstructs the manifest's named profile and
extracts the learned arrays. `quantize_parameters` rounds feature weights and
the shared feature bias by Q1 = 64, output weights by Q2 = 64, and output bias
by Q1 times Q2. Feature weights become signed int8, feature bias and output
weights become signed int16, and output bias becomes signed int32.

Quantization maps floating parameters onto the exact integer values consumed by
the C runtime. A value outside its destination range would saturate and change
the trained network unexpectedly. Export counts out-of-range values separately
for feature weights, feature bias, output weights, and output bias, and fails if
any count is nonzero. It does not silently clip. Feature bias is also restricted
to -28928 through 28957, which leaves room for the maximum 30 signed int8
feature vectors in a legal position without overflowing a signed int16
accumulator.

`build_model_blob` writes the fixed version 2 header, hidden-width feature
biases, twice-hidden-width output weights, and the profile feature table in the
order expected by `src/nnue.c`. `export_parameters` writes only after
quantization passes and also creates a JSON model manifest. The binary must
match the profile's calculated size. The manifest records runtime and feature
format versions, architecture,
quantization, byte size, dataset description, training settings and seed, best
epoch, validation and test metrics, and the four saturation counts. It contains
no signature or cryptographic hash.

`load_exported_model` in `train/integer.py` validates and parses that binary.
`evaluate_integer(model, fen)` encodes the two sparse perspectives with the
header-derived profile, adds int8 feature vectors to the int16-safe bias, clips
both accumulators to 0 through 127, orders side to move before opponent,
computes the integer dot product, and divides by Q1 times Q2 with truncation
toward zero. This is an independent Python implementation of exported integer
inference, not a floating PyTorch comparison.

## Smoke training and comparison

The committed seven-position labeled fixture needs no Stockfish process. It
exercises all three splits and the full train, select, export, and integer
comparison path quickly on CPU:

```sh
python train/prep.py test/training_labels.jsonl build_smoke_data \
    --shard-size 2 --profile 8x64
python train/train.py build_smoke_data build_smoke.pt --epochs 3 --batch 2 \
    --lr 0.001 --seed 7 --score-scale 400 --device cpu --workers 0
python train/export.py build_smoke.pt build_smoke.bin
python train/integer.py build_smoke.bin \
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
./build/p4eval build_smoke.bin \
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

The last two commands must print the same integer. `train/test_model.py`
automates exact comparison on three board arrangements with both sides to move
and tests unsafe and nonfinite exports. The tiny checkpoint is meaningful only
as a pipeline smoke artifact and must not be published as a reference network.

The smoke commands produce:

- `build_smoke_data/manifest.json` and split NPZ shards
- `build_smoke.pt`, the selected floating checkpoint
- `build_smoke.pt.json`, its reproducibility manifest
- `build_smoke.bin`, the exact runtime model
- `build_smoke.bin.json`, the exported model manifest

To exercise teacher labeling separately with a local Stockfish executable, use
the committed eight-game PGN and a deliberately small limit:

```sh
python train/label.py test/training_games.pgn /path/to/stockfish \
    build_tiny_labels.jsonl --nodes 1000 --stride 2 --min-ply 1 \
    --limit 16 --seed 7 --validation-percent 20 --test-percent 20
python train/prep.py build_tiny_labels.jsonl build_tiny_teacher_data \
    --shard-size 8
```

The normal labeler test substitutes a fake score function because engine
startup, version, and analysis cost are external integration concerns.

## Scaling a real run

A larger local run uses the same commands with paths outside the repository or
under the ignored `data` directory:

```sh
python train/label.py games.pgn /path/to/stockfish labels.jsonl \
    --nodes 20000 --stride 4 --min-ply 8 --limit 1000000 --seed 7
python train/prep.py labels.jsonl data --shard-size 100000 --profile 8x64
python train/train.py data model.pt --epochs 12 --batch 4096 --lr 0.001 \
    --seed 7 --score-scale 400 --device auto --workers 0 \
    --weight-decay 0.01
python train/export.py model.pt nn.bin
./build/p4eval nn.bin \
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

Reasonable parameters depend on available time and storage:

- more positions broaden coverage but increase teacher time disk use and training time
- more teacher nodes can improve each label but increase generation time almost proportionally
- a larger stride reduces correlated positions and teacher work but yields fewer examples per game
- a larger minimum ply reduces repeated opening prefixes but can underrepresent openings if set too high
- a maximum ply can cap unusually long games but also removes endgames and is normally left unset
- larger shards reduce file count but raise peak preparation and training memory
- split percentages may change for a specific experiment but the test set should remain isolated

More shallow labels and fewer deeper labels spend the same resources
differently; neither is universally best. Record the manifest, measure
validation behavior, and keep the test split unused until the experiment is
fixed. This repository does not include a substantive prepared dataset or a
trained reference network, so the commands above define the reference run
rather than claiming results from the tiny fixture.
