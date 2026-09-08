# Measurements and recovery

`train/benchmark.py` records host timing with source, compiler, binary, and
model hashes. Run it after a host build:

```bash
python3 train/benchmark.py build/p4bench models/reference.nnue
```

The output is host evidence. Existing high throughput figures are desktop i7
results where their manifest says so. They are not ESP32 P4 measurements.

## Repeated search observations

The measurement command uses six fixed positions: the start, a reply to e2e4,
promotion, castling, a middlegame and Kiwipete. Each returned move is checked
with python chess. These commands run real engine code through host pipes:

```bash
python3 esp/measure.py --host build/p4hostdevice --runs 2 --time-ms 50 --output results/host_classical_smoke.json
python3 esp/measure.py --host build/p4hostdevice --model models/reference.nnue --runs 2 --time-ms 50 --output results/host_nnue_smoke.json
```

The checked reports contain twelve observations each. They are bounded harness
checks, not matches or an Elo estimate. Source revision and dirty state, binary
and model hashes, FEN, run number, requested budget, completed depth, nodes,
device elapsed time, client elapsed time and device overshoot are recorded.
The client interval includes Position and Go and uses Python monotonic time.
The browser API separately measures its own round trip, including queue wait.
Never subtract timestamps from different clock domains.

For later physical testing, fill in `docs/measurement-metadata.example.json`
with the compiler, ESP IDF version, board revision, clock, build flags, memory
placement and watchdog observations. Leave unmeasured values null. Close Play
and any serial monitor, reset the board, then run this command with its actual
port. It has not been run against a physical board here:

```bash
python3 esp/measure.py --port PORT --firmware esp/build/esp32p4_nnue.bin --model models/reference.nnue --metadata docs/measurement-metadata.example.json --runs 10 --time-ms 2000 --output board-observations.json
```

Telemetry command `0x06` reports current and minimum internal heap, optional
PSRAM heap and minimum free task stack, all in bytes. The availability mask
distinguishes absent telemetry from a real zero. The stack observation is for
the calling firmware task. Heap minima include other firmware allocations and
are not a measurement of the engine alone. Watchdog and reset observations
remain manual metadata. Host fixtures return unknown command and the harness
records null rather than inventing board memory figures.

## Training diagnostic

```bash
python3 train/analyze_errors.py data/reference_4x128 data/real_4x128_seed7.pt --limit 20000 --output results/error_diagnostic_sample.json
```

The local dataset shards and checkpoint are ignored training artifacts, not
included in the public repository. Their hashes are recorded in the report.
Exporting that checkpoint with the current integer exporter reproduced
`models/reference.nnue` byte for byte, with zero saturation in all four arrays.
Reproduction elsewhere requires those exact source artifacts or a new dataset
whose different identity is recorded honestly.

| Test sample group | Positions | Mean absolute error in centipawns |
| :--- | ---: | ---: |
| All sampled positions | 20000 | 4569.67 |
| Absolute label below 30000 | 17039 | 243.11 |
| Absolute label equal to 30000 | 2961 | 29466.70 |
| Absolute label below 100 | 9924 | 65.37 |

Labels at magnitude 30000 contributed 95.47 percent of absolute error in this
sample. This establishes sample dominance, not the cause of every historical
error. The shards no longer retain original mate flags, so the second row is
not a clean nonmate metric. The report also groups by score range and nonking
piece count, a phase proxy. Overall sign agreement was 71.41 percent. Small
scores often cross zero; sign agreement is not a chess accuracy percentage.

Feature equivalent inputs were found across sampled splits. The feature key
sorts each perspective independently before hashing. Castling, move counters
and game provenance are absent from these features, so it is neither a game
identifier nor exact FEN equality. Future position grouping can assign each
feature key to exactly one split before training. Related but unequal positions
can still cross splits. Whole game separation needs original game provenance.
This diagnostic revisits existing test data and must not be presented as a new
untouched test set. Historical manifests and comparison files are retained.

## Strength comparisons

Use equal wall time budgets when comparing classical and neural evaluation.
The existing arena accepts `--time-ms`, paired openings and both colors. Save
all moves, PGN, stopping rules and results. The following is only a smoke run:

```bash
python3 train/arena.py build/p4nnue models/reference.nnue build/p4nnue classic --time-ms 50 --max-plies 8 --opening-count 1
```

Two short games cannot establish an Elo difference. Longer comparisons must
report sample size, paired outcomes and uncertainty, and distinguish natural
draws from a move limit. Fixed depth can conceal evaluation cost. Historical
results are not reruns of the changed engine.

Model upload checks header, byte count, checksum, numeric bounds, flash space,
and activation. The firmware first activates the embedded model, erases the
upload partition, writes model bytes, writes metadata, then writes the validity
marker last. A failed update has a known fallback after restart. It does not
guarantee that the old uploaded model survived an erased partition.

`p4storage` injects erase, write, metadata, and activation failures through the
host storage stubs. This is not a physical power interruption test. For a board
test, flash a known embedded model, start an upload, cut power at several known
write stages, restore power, then verify the firmware reports either a valid new
upload or the embedded fallback. Record the board, firmware, model checksum,
and observed result for every run.

For physical interruption trials, use a disposable uploaded model and keep the
known firmware image available. Test separately after fallback activation,
during erase, during a chunk, after data validation and during validity metadata
write. Instrument the stage on a separate logging channel, never inject logs
into binary protocol output. Restore power and request Hello and Device info,
then perform a legal move exchange. The only acceptable active states are the
verified embedded fallback or the fully validated new upload. Record hashes
and stage, not personal serial identifiers. If neither state works, stop using
that image and retain logs. No power interruption trials were performed here.

Software tests cover erase failure, chunk failure, metadata and validity marker
write failure, commit mapping failure, activation failure and invalid stored
bytes at boot. They also check mapping lifetime and evaluator cache refresh.
