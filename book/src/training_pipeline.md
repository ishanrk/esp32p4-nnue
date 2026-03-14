# Training Pipeline

Training runs on a host and produces the integer network consumed by
`src/nnue.c`. This repository does not contain a final trained network or a
large dataset. It provides a reproducible path from source games to bounded
training, validation, and test shards:

```text
pgn games
  -> sampled positions
  -> fixed-node stockfish labels
  -> compact sparse features
  -> train validation and test shards
  -> dataset manifest
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

`train/train.py` consumes the prepared training shards and reports validation
error. It does not merge the splits or create a second position-level split.
The test shards are deliberately untouched by ordinary training.

## Exact sparse features

`train/features.py` is the single Python definition of the version 2 feature
map. It parses FEN piece placement, vertically normalizes the Black perspective,
horizontally mirrors every square when the normalized king is on files e
through h, selects one of eight king buckets, and maps ten nonking piece classes
over 64 squares. `feature_index` returns one complete index from 0 through 5119.
The C runtime and Python test read the common expected values in
`test/nnue_features.txt`.

`encode_position(fen)` receives one valid position and returns the side-to-move
feature list first and the opponent list second. Each perspective contains at
most 30 nonking features. The function pads both lists to exactly 30 entries
with sentinel 5120. The feature transformer has a zero row at that sentinel, so
padding does not affect an accumulator.

Indices 0 through 5120 fit in an unsigned 16-bit integer, whose maximum is
65535. Prepared shards therefore store features as `uint16`. Teacher scores are
already clamped to the engine's 30000 mate scale, so they safely use `int16`.

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

`prepare_dataset(source_path, output_directory, shard_size, metadata_path)`
streams labeled JSONL in source order. It requires records for a game to remain
grouped and rejects any game whose records change split. It keeps at most one
configured shard buffer per split, writes a buffer as soon as it fills, and
never loads all labeled positions at once. The default shard size is 100000.

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

## Training and export

`NnueNetwork` in `train/net.py` receives side-to-move and opponent feature
tensors. Its 5121-row embedding reserves the last zero row for padding, adds one
shared 64-value feature bias to each perspective, applies clipped ReLU, joins
the perspectives, and returns one score from the linear output layer.

`train/train.py` receives a dataset directory or manifest path and a checkpoint
output path. For each epoch it derives deterministic shard and row orders from
the training seed. Each batch is converted to the integer index type PyTorch
requires, sent to the selected CPU or CUDA device, and optimized with AdamW.
`_scaled_loss` applies smooth L1 loss after tanh-scaling predictions and targets
by 400 centipawns.

`evaluate_shards(network, shard_paths, batch_size, device)` disables gradients,
streams the ordered validation shards in batches, and returns mean absolute
centipawn error or `None` for an empty validation split. It changes no weights
and receives no test shard paths. After the configured epochs the command saves
the model state.

`train/export.py` loads that state, quantizes feature weights and bias by Q1,
quantizes output weights by Q2, and scales output bias by both factors. It
clamps feature bias to the accumulator-safe range and writes the fixed version
2 header and arrays. Export rejects a result that is not exactly 328096 bytes.
This defines the runtime format but does not provide a final trained model.

## Tiny fixture run

The committed labeled fixture needs no Stockfish process. It is useful for
checking preparation and inspecting the manifest:

```sh
python train/prep.py test/training_labels.jsonl build_tiny_data --shard-size 2
python -m json.tool build_tiny_data/manifest.json
```

To exercise real labeling with a local Stockfish executable, use the committed
eight-game PGN and a deliberately small limit:

```sh
python train/label.py test/training_games.pgn /path/to/stockfish \
    build_tiny_labels.jsonl --nodes 1000 --stride 2 --min-ply 1 \
    --limit 16 --seed 7 --validation-percent 20 --test-percent 20
python train/prep.py build_tiny_labels.jsonl build_tiny_teacher_data \
    --shard-size 8
```

The normal unit test substitutes a fake score function because engine startup,
version, and analysis cost are external integration concerns.

## Scaling a real run

A larger local run uses the same commands with paths outside the repository or
under the ignored `data` directory:

```sh
python train/label.py games.pgn /path/to/stockfish labels.jsonl \
    --nodes 20000 --stride 4 --min-ply 8 --limit 1000000 --seed 7
python train/prep.py labels.jsonl data --shard-size 100000
python train/train.py data model.pt --epochs 12 --batch 4096 --seed 7
python train/export.py model.pt nn.bin
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
fixed. Training and publishing a final reference network remain later work.
