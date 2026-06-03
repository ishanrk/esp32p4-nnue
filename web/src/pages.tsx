import {
  Code,
  HardwareCalculator,
  KeyLink,
  Notice,
  PageTitle,
  Section,
  Stat,
} from "./components";
import type { SiteData } from "./data";
import { migration } from "./migration";

const smokeCommands = `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure

python3 train/prep.py test/training_labels.jsonl build-smoke-data \\
  --shard-size 2 --profile 4x128
python3 train/train.py build-smoke-data build-smoke.pt \\
  --epochs 2 --batch 2 --lr 0.001 --seed 7 \\
  --score-scale 400 --device cpu --workers 0 --weight-decay 0.01 \\
  --evaluate-test
python3 train/export.py build-smoke.pt build-smoke.nnue`;

const importCommand = `python3 train/import_evals.py \\
  https://database.lichess.org/lichess_db_eval.jsonl.zst \\
  data/reference_labels.jsonl \\
  --limit 10000000 --min-depth 20 \\
  --selection-denominator 4 --seed 7 \\
  --validation-percent 5 --test-percent 5 --workers 12`;

const trainCommands = `python3 train/prep.py data/reference_labels.jsonl data/reference_4x128 \\
  --shard-size 250000 --profile 4x128
python3 train/train.py data/reference_4x128 data/model_4x128_seed7.pt \\
  --epochs 12 --batch 4096 --lr 0.001 --seed 7 \\
  --score-scale 400 --device auto --workers 0 --weight-decay 0.01
python3 train/export.py data/model_4x128_seed7.pt data/model_4x128_seed7.nnue`;

const finalCommands = `python3 train/evaluate.py data/reference_4x128 data/model_4x128_seed7.pt \\
  --device cpu
python3 train/export.py data/model_4x128_seed7.pt models/reference.nnue
python3 train/compare.py models/reference.nnue data/reference_labels.jsonl \\
  build/p4eval --limit 1000 --split test`;

export function HomePage({ data }: { data: SiteData }) {
  return (
    <main>
      <section className="home-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">stage one · embedded nnue</p>
          <h1 id="home-title">Chess evaluation built for the P4</h1>
          <p className="hero-lead">
            A shared C11 chess core, a constrained integer NNUE, a reproducible
            ten-million-position training path, and a provisional reference
            network that fits under 512 KiB.
          </p>
          <div className="hero-actions">
            <KeyLink href="/guide/">Reproduce the model</KeyLink>
            <KeyLink href="/reference-model/" secondary>Download reference</KeyLink>
          </div>
        </div>
        <div className="hero-readout" aria-label="Reference model summary">
          <span className="readout-label">reference / seed 7</span>
          <strong>{data.reference.profile}</strong>
          <div className="hero-stats">
            <Stat label="model" value={`${data.reference.model_byte_size.toLocaleString()} B`} />
            <Stat label="corpus" value="10,000,000" />
            <Stat label="integer parity" value="1,000 / 1,000" />
            <Stat label="format" value={`v${data.reference.model_format_version}`} />
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Project status">
        <span>host engine complete</span>
        <span>real reference trained</span>
        <span>board protocol compiled</span>
      </section>

      <section className="home-grid">
        <a href="/architecture/">
          <span>01</span>
          <h2>One core</h2>
          <p>Desktop UCI and ESP-IDF compile the same move generation, search, and NNUE runtime.</p>
        </a>
        <a href="/results/">
          <span>02</span>
          <h2>Measured choice</h2>
          <p>Four profiles, repeated finalist seeds, 1,536 color-balanced games, and host benchmarks.</p>
        </a>
        <a href="/status/">
          <span>03</span>
          <h2>Honest boundary</h2>
          <p>Host evidence is published. Physical P4 speed, memory, and PIE work remain explicitly pending.</p>
        </a>
      </section>
    </main>
  );
}

const parameters = [
  ["positions", "more varied examples can improve generalization", "download disk and host training time", "host"],
  ["evaluation quality", "deeper teacher work generally stabilizes labels", "teacher CPU or source quality", "host"],
  ["minimum depth", "rejects more shallow Lichess records", "scan time and accepted distribution", "host"],
  ["sampling rate", "a larger denominator spreads a fixed sample farther", "stream scan time", "host"],
  ["epochs", "adds complete passes over training", "time and overfitting risk", "host"],
  ["batch size", "can improve device utilization", "host RAM and optimization step count", "host"],
  ["learning rate", "makes AdamW updates larger", "convergence stability", "host"],
  ["score scale", "delays target compression for large centipawn scores", "training objective", "host"],
  ["bucket count", "adds king-localized feature tables", "model flash and refresh locality", "host and device"],
  ["hidden width", "adds learned lanes to every active feature", "model flash accumulator RAM and inference", "host and device"],
  ["activation clip", "widens integer activation if format changes", "arithmetic range", "frozen at 127 in v3"],
  ["feature quantization", "changes float-to-int8 scale if format changes", "weight precision and accumulator range", "frozen at 64 in v3"],
  ["output quantization", "changes float-to-int16 output scale if format changes", "output precision and range", "frozen at 64 in v3"],
  ["model ceiling", "permits larger profiles", "flash and cache pressure", "512 KiB policy"],
  ["table size", "keeps more search entries", "runtime RAM", "host and device"],
] as const;

export function GuidePage({ data }: { data: SiteData }) {
  return (
    <main className="page-shell">
      <PageTitle
        index="guide / reproducible path"
        title="Train the network that is actually shipped"
        lead="Start with the quick fixture, then follow the same streamed import, held-out selection, constrained export, and integer comparison used for the public reference."
      />

      <Section id="start" index="01" title="Start and smoke test">
        <p>
          Install Python dependencies from <code>train/requirements.txt</code>.
          The committed seven-position fixture is deliberately tiny: it checks
          preparation, training, export, and C loading but says nothing about
          chess strength.
        </p>
        <Code>{smokeCommands}</Code>
        <Notice>Smoke metrics are pipeline checks only and never appear in the substantive result table.</Notice>
      </Section>

      <Section id="data" index="02" title="Stream and normalize public evaluations">
        <p>
          The source is the official CC0 Lichess Stockfish evaluation JSONL Zstandard
          stream dated 2026-08-02. <code>import_evals.py</code> reads it without loading
          the corpus into memory, rejects malformed or illegal positions, chooses the
          greatest-depth evaluation and first principal variation, and maps mate to
          finite ±30000.
        </p>
        <Code>{importCommand}</Code>
        <div className="stat-row">
          <Stat label="records scanned" value="47,836,886" />
          <Stat label="depth eligible" value="39,989,693" />
          <Stat label="accepted" value="10,000,000" />
          <Stat label="minimum depth" value="20" />
        </div>
        <h3>Perspective was measured</h3>
        <p>
          A deterministic 100-position comparison ran Stockfish 18 at 50,000
          nodes per position. Treating Lichess scores as White point of view,
          then negating when Black moves, produced 0.934689 Pearson correlation
          and 99% sign agreement. Treating raw scores as side-to-move produced
          -0.183512 correlation. The importer therefore performs the White-to-
          side-to-move conversion for centipawn and mate labels.
        </p>
        <Notice>
          The seeded 90/5/5 split is per accepted position because this dump does
          not expose source-game membership. The PGN labeler retains whole-game splits,
          which have stronger same-game leakage protection.
        </Notice>
      </Section>

      <Section id="train" index="03" title="Prepare and train all profiles">
        <p>
          Prepare the one normalized labeled corpus separately for each profile.
          Feature IDs remain <code>uint16</code>, labels remain <code>int16</code>,
          and FEN text is not stored in the NPZ shards. All profiles receive the
          same split assignments and optimization policy.
        </p>
        <Code>{trainCommands}</Code>
        <p>
          The architecture sweep omits <code>--evaluate-test</code>. It trains on
          9,000,455 examples and selects the minimum validation transformed
          smooth-L1 checkpoint on 500,453 examples. The trainer constrains
          quantizable parameters after every epoch and before validation. Export
          still independently rejects any saturation instead of silently clipping.
        </p>
      </Section>

      <Section id="parameters" index="04" title="Parameters are tradeoffs">
        <p>
          The reference values are one measured configuration, not universal
          prescriptions. Data and optimizer controls affect host work; bucket,
          width, quantization, clip, and table choices can also affect the device.
        </p>
        <div className="table-wrap" tabIndex={0}>
          <table>
            <thead><tr><th>parameter</th><th>increasing it tends to</th><th>cost</th><th>scope</th></tr></thead>
            <tbody>
              {parameters.map((row) => (
                <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="hardware-budget" index="05" title="Hardware budget calculator">
        <p>
          The browser uses the same formula as <code>train/profiles.py</code>.
          The build generates profile JSON from Python, and the focused site test
          checks every supported profile against this calculation.
        </p>
        <HardwareCalculator profiles={data.profiles} />
      </Section>

      <Section id="export" index="06" title="Select then export">
        <p>
          Compare validation across seeds, playing results, model and accumulator
          bytes, and host throughput. After the architecture and validation
          checkpoint are fixed, evaluate the untouched 499,092-position test split
          exactly once. Do not retrain from that result.
        </p>
        <Code>{finalCommands}</Code>
        <Code>{`python3 train/arena.py build-4x128/p4nnue data/model_4x128_seed7.nnue \\
  build-8x64/p4nnue data/model_8x64_seed7.nnue \\
  --openings test/openings.json --opening-count 128 \\
  --depth 4 --max-plies 240 --estimate-elo`}</Code>
        <p>
          <code>evaluate.py</code> refuses a second test evaluation recorded in the
          checkpoint manifest. <code>compare.py</code> sends a batch of held-out FENs
          to one C process and requires exact Python/C integer equality.
        </p>
      </Section>

      <Section id="test" index="07" title="Test the whole system">
        <Code>{`cmake -S . -B build-release -DCMAKE_BUILD_TYPE=Release
cmake --build build-release --parallel
ctest --test-dir build-release --output-on-failure

cmake -S . -B build-san -DP4_SAN=ON -DCMAKE_BUILD_TYPE=Debug
cmake --build build-san --parallel
ctest --test-dir build-san --output-on-failure

printf '%s\\n' uci \\
  'setoption name EvalFile value models/reference.nnue' \\
  isready 'position startpos' eval 'go depth 5' quit | build-release/p4nnue`}</Code>
        <p>
          <code>p4test</code> covers canonical perft, legal edge cases, make and
          undo restoration, incremental Zobrist state, incremental NNUE against
          full refresh, and search smoke. <code>p4protocol</code> covers framed
          parsing, upload state, validation errors, position, and search results;
          <code>p4boardclient</code> independently checks the Python codec. Python
          also covers mapping, import, data, training, export, integer comparison,
          and arena orchestration.
        </p>
      </Section>

      <Section id="migration" index="08" title="Book migration map">
        <p>Every useful page from the retired mdBook has a live application destination.</p>
        <div className="migration-list">
          {migration.map((entry) => (
            <a href={entry.destination} key={entry.source}>
              <code>{entry.source}</code><span>{entry.destination}</span>
            </a>
          ))}
        </div>
      </Section>
    </main>
  );
}

export function ArchitecturePage() {
  return (
    <main className="page-shell">
      <PageTitle
        index="architecture / current implementation"
        title="One compact core from FEN to integer score"
        lead="These are the data structures and functions in this repository, not a generic engine blueprint."
      />

      <Section id="board" index="01" title="Board and reversible state">
        <p>
          <code>position_t</code> keeps twelve piece bitboards, White/Black/all
          occupancy, a 64-entry direct lookup board, incremental Zobrist key and
          history, both NNUE accumulators and cached king views, clocks, side,
          castling, and en passant. The bitboards and square array must agree.
        </p>
        <div className="flow" aria-label="Position construction flow">
          <span>set_position_fen</span><b>→</b><span>calculate_position_hash</span><b>→</b><span>refresh_nnue</span><b>→</b><span>position_is_valid</span>
        </div>
        <p>
          <code>initialize_chess</code> builds knight, king, pawn, ray, and
          deterministic Zobrist tables once. <code>generate_bishop_attacks</code>
          and <code>generate_rook_attacks</code> trim precomputed rays at the nearest
          blocker. Native 64-bit bitboards remain the scalar baseline; paired
          32-bit halves await physical RV32 measurement.
        </p>
        <p>
          <code>calculate_position_hash</code> is the full recomputation check.
          <code>make_move</code> updates the live key, while <code>undo_move</code>
          restores the saved key. History supports repetition and fifty-move draws.
        </p>
      </Section>

      <Section id="moves" index="02" title="Packed moves generation make and undo">
        <Code>{`bits 0..5    source square
bits 6..11   destination square
bits 12..14  promotion selector
bits 15..18  capture en-passant castle double-pawn flags
bits 19..31  reserved`}</Code>
        <p>
          <code>generate_moves</code> emits bounded pseudo-legal moves into
          <code>move_list_t</code>. <code>make_move</code> validates packed fields,
          records the 24-byte <code>undo_t</code>, updates board/bitboards/hash/
          clocks/castling/en-passant/NNUE, flips side, and rejects an exposed king.
          A rejected move restores every change. <code>undo_move</code> reverses the
          same transitions without rebuilding full state.
        </p>
        <p>
          Castling is generated only when the king is not in check and neither
          transit nor destination square is attacked. En passant removes the pawn
          behind the destination before the exposed-king test. Promotions support
          knight, bishop, rook, and queen. <code>parse_uci_move</code> matches text
          against legal generated moves; <code>perft</code> recursively makes and
          undoes them as the move-generation regression reference.
        </p>
      </Section>

      <Section id="search" index="03" title="Single-threaded search baseline">
        <p>
          <code>search_position</code> owns iterative deepening and reports only
          completed iterations. Its principal variation search is negamax alpha-
          beta with full-window first moves, null-window later moves, check
          extension, one-ply late-move reduction for eligible quiet moves, and
          quiescence at depth zero. The baseline adds no other pruning family.
        </p>
        <div className="flow" aria-label="Search flow">
          <span>iterative deepening</span><b>→</b><span>principal variation search</span><b>→</b><span>quiescence</span><b>→</b><span>evaluate</span>
        </div>
        <p>
          The 16-byte direct-mapped <code>tt_entry_t</code> stores key, move, score,
          depth, and exact/lower/upper flag. Mate scores stay relative to ply.
          Ordering uses the table move, captures, promotions, two killers, and
          history. <code>evaluate</code> selects NNUE when loaded and otherwise uses
          the unchanged classic material and piece-square evaluator.
        </p>
        <p>
          <code>resize_transposition_table_bytes</code> rounds a byte budget down to
          a power-of-two entry count. The firmware requests 262,144 bytes; desktop
          UCI exposes a MiB convenience option.
        </p>
      </Section>

      <Section id="nnue" index="04" title="King-conditioned sparse NNUE">
        <div className="nnue-diagram" aria-label="NNUE data flow">
          <div><span>white view</span><strong>≤30 sparse features</strong></div>
          <b>+</b>
          <div><span>black view</span><strong>≤30 sparse features</strong></div>
          <b>→</b>
          <div><span>int16 accumulators</span><strong>128 + 128 lanes</strong></div>
          <b>→</b>
          <div><span>clipped relu</span><strong>0…127</strong></div>
          <b>→</b>
          <div><span>integer output</span><strong>side to move cp</strong></div>
        </div>
        <p>
          Each perspective vertically normalizes its side to the bottom and mirrors
          the entire view when its king is on files e through h. Four normalized
          king files select the reference buckets. Each bucket has ten nonking
          piece classes across 64 squares, or 640 features. The 4×128 profile has
          2,560 possible features per perspective and at most 30 active features.
        </p>
        <p>
          <code>refresh_nnue_perspective</code> starts from int16 feature bias and
          adds active int8 vectors. <code>add_nnue_feature</code> and
          <code>remove_nnue_feature</code> update normal piece changes in both views.
          A king move rebuilds only its perspective when bucket or mirror changes.
          <code>refresh_nnue</code> is the full refresh comparison used by tests.
        </p>
        <p>
          <code>evaluate_nnue</code> clips the side-to-move accumulator first and
          opponent second, applies signed int16 output weights plus int32 bias in
          int64, divides by both scale factors, and returns an integer side-to-move score.
        </p>
      </Section>

      <Section id="model-format" index="05" title="Version 3 model format">
        <div className="table-wrap" tabIndex={0}>
          <table>
            <thead><tr><th>offset</th><th>bytes</th><th>field</th><th>4×128 value</th></tr></thead>
            <tbody>
              <tr><td>0</td><td>8</td><td>magic</td><td>P4NNUE1 plus zero</td></tr>
              <tr><td>8</td><td>2</td><td>format</td><td>3</td></tr>
              <tr><td>10</td><td>2</td><td>buckets</td><td>4</td></tr>
              <tr><td>12</td><td>2</td><td>features per bucket</td><td>640</td></tr>
              <tr><td>14</td><td>2</td><td>hidden width</td><td>128</td></tr>
              <tr><td>16…22</td><td>8</td><td>clip scales perspectives</td><td>127 64 64 2</td></tr>
              <tr><td>24</td><td>4</td><td>complete file size</td><td>328480</td></tr>
              <tr><td>28</td><td>4</td><td>int32 output bias</td><td>payload begins</td></tr>
              <tr><td>32</td><td>256</td><td>int16 feature biases</td><td>128 lanes</td></tr>
              <tr><td>288</td><td>512</td><td>int16 output weights</td><td>two views</td></tr>
              <tr><td>800</td><td>327680</td><td>int8 feature weights</td><td>2560 × 128</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          All multibyte values are little endian. <code>validate_nnue</code> checks
          dimensions, constants, exact size, alignment, and safe bias range without
          changing the active network. <code>load_nnue</code> owns a host allocation;
          <code>bind_nnue</code> validates then borrows aligned read-only storage for
          firmware. Failed loads preserve the previous valid network.
        </p>
      </Section>
    </main>
  );
}

function signed(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function ResultsPage({ data }: { data: SiteData }) {
  return (
    <main className="page-shell">
      <PageTitle
        index="results / substantive sweep"
        title="Real profiles on one controlled corpus"
        lead="Validation remained clean for selection, finalists were repeated across three seeds, and color-balanced engine matches used 128 CC0 openings."
      />
      <Notice pending><strong>physical esp32 p4 results pending</strong> Host timing below is not device timing.</Notice>

      <Section id="profiles" index="01" title="Profile comparison">
        <div className="table-wrap" tabIndex={0}>
          <table className="results-table">
            <thead>
              <tr><th>profile</th><th>buckets</th><th>width</th><th>model</th><th>validation loss</th><th>MAE cp</th><th>host eval/s</th><th>vs 8×64</th></tr>
            </thead>
            <tbody>
              {data.comparison.profiles.map((profile) => (
                <tr className={profile.name === data.comparison.selection.profile ? "selected" : ""} key={profile.name}>
                  <th>{profile.name}{profile.name === data.comparison.selection.profile && <span> reference</span>}</th>
                  <td>{profile.bucket_count}</td>
                  <td>{profile.hidden_width}</td>
                  <td>{profile.model_bytes.toLocaleString()} B</td>
                  <td>{profile.seed_7.validation_loss.toFixed(8)}</td>
                  <td>{profile.seed_7.validation_cp_mae.toFixed(2)}</td>
                  <td>{profile.host.integer_evaluations_per_second.toLocaleString()}</td>
                  <td>{profile.versus_8x64_depth_4.score_percent === undefined
                    ? "baseline"
                    : `${profile.versus_8x64_depth_4.score_percent.toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          All seed-7 runs selected epoch 12. Exported saturation was zero in all
          four parameter groups. The primary metric is validation transformed
          loss; centipawn MAE is large because the corpus includes finite mate
          targets and tactical extremes.
        </p>
      </Section>

      <Section id="matches" index="02" title="Color-balanced engine matches">
        <div className="match-grid">
          {data.comparison.profiles.filter((profile) => profile.name !== "8x64").map((profile) => {
            const match = profile.versus_8x64_depth_4;
            return (
              <div key={profile.name}>
                <span>{profile.name} vs 8×64 · depth 4</span>
                <strong>{match.score_percent?.toFixed(2)}%</strong>
                <p>{match.wins}W {match.draws}D {match.losses}L · {signed(match.elo)} ± {match.elo_uncertainty_95?.toFixed(2)} Elo</p>
              </div>
            );
          })}
        </div>
        <p>
          The finalists played 512 additional games: 4×128 scored 49.41% at
          depth 4 and 51.17% at depth 5 against 8×96. Both uncertainty intervals
          include equality. Against the classic evaluator, reference 4×128 scored
          81 wins, 123 draws, and 52 losses: 55.66%, estimated +39.53 ± 30.75 Elo.
        </p>
      </Section>

      <Section id="host" index="03" title="Host resource and search measurements">
        <div className="table-wrap" tabIndex={0}>
          <table>
            <thead><tr><th>profile</th><th>accumulator</th><th>position</th><th>undo</th><th>start nps</th><th>kiwipete nps</th><th>middlegame nps</th></tr></thead>
            <tbody>
              {data.comparison.profiles.map((profile) => (
                <tr key={profile.name}>
                  <th>{profile.name}</th>
                  <td>{profile.accumulator_bytes} B</td>
                  <td>{profile.host.position_bytes} B</td>
                  <td>{profile.host.undo_bytes} B</td>
                  {Object.values(profile.host.search).map((search, index) => <td key={index}>{search.nodes_per_second.toLocaleString()}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          GCC release binaries used native instructions on an Intel Core i7-13700H.
          Evaluation measured 500,000 repetitions across six positions; search is
          the median of five depth-5 runs. These measurements guide host tradeoffs
          only and cannot predict RV32 flash, cache, or later PIE behavior.
        </p>
      </Section>

      <Section id="selection" index="04" title="Why 4×128 is the reference">
        <p>{data.comparison.selection.reason}.</p>
        <p>
          8×96 had a slightly lower three-seed mean loss; 4×128 had a slightly
          lower median. Their direct matches were inconclusive. The smaller model
          therefore won the stated tie-break. Seed 7 was the best validation
          checkpoint within 4×128. Only then did the 499,092-position test split
          measure loss 0.06664835 and MAE 4529.96 cp.
        </p>
        <Notice pending>The choice remains provisional until physical ESP32 P4 memory and timing results exist.</Notice>
      </Section>
    </main>
  );
}

export function ReferencePage({ data }: { data: SiteData }) {
  const manifest = data.reference;
  return (
    <main className="page-shell">
      <PageTitle
        index="reference model / actual artifact"
        title={`${manifest.profile} · format ${manifest.model_format_version}`}
        lead="The download and every value on this page come from the committed model and manifest copied at build time."
      />
      <div className="reference-actions">
        <KeyLink href="/generated/reference.nnue" download="reference.nnue">
          Download 328,480 byte model
        </KeyLink>
        <a href="/generated/reference.json">view manifest json</a>
      </div>

      <section className="manifest-grid" aria-label="Reference metadata">
        <Stat label="architecture" value={manifest.profile} />
        <Stat label="model bytes" value={manifest.model_byte_size.toLocaleString()} />
        <Stat label="parameters" value={manifest.training_parameter_count.toLocaleString()} />
        <Stat label="corpus" value={Number(manifest.dataset.accepted_positions).toLocaleString()} />
        <Stat label="train positions" value={Number(manifest.dataset.train_positions).toLocaleString()} />
        <Stat label="validation positions" value={Number(manifest.dataset.validation_positions).toLocaleString()} />
        <Stat label="test positions" value={Number(manifest.dataset.test_positions).toLocaleString()} />
        <Stat label="feature map" value={`v${manifest.feature_mapping_version}`} />
        <Stat label="best epoch" value={manifest.training.best_epoch} />
      </section>

      <Section id="training" index="01" title="Training and teacher">
        <p>
          Official CC0 Lichess Stockfish evaluations dated {String(manifest.dataset.source_date)}.
          The importer scanned {Number(manifest.dataset.records_scanned).toLocaleString()} records,
          required depth {manifest.dataset.minimum_depth}, and accepted one in four eligible records
          with seed {manifest.dataset.selection_seed}. It chose the deepest evaluation and first PV.
        </p>
        <p>
          Stockfish 18 established that the source score is White point of view;
          labels are negated when Black moves. Training used AdamW, seed {manifest.training.seed},
          {" "}{manifest.training.epochs_completed} epochs, batch {manifest.training.batch_size},
          learning rate {manifest.training.learning_rate}, weight decay {manifest.training.weight_decay},
          and score scale {manifest.training.score_scale}.
        </p>
      </Section>

      <Section id="quality" index="02" title="Validation test and parity">
        <div className="stat-row">
          <Stat label="validation loss" value={manifest.validation.transformed_loss} />
          <Stat label="validation MAE" value={`${manifest.validation.centipawn_mae} cp`} />
          <Stat label="test loss" value={manifest.test.transformed_loss} />
          <Stat label="test MAE" value={`${manifest.test.centipawn_mae} cp`} />
        </div>
        <p>
          Test labels were evaluated only after architecture and checkpoint selection.
          Python exported integer inference and C agreed on {manifest.integer_parity.positions.toLocaleString()}
          {" "}held-out positions with {manifest.integer_parity.mismatches} mismatches.
          {" "}The reference scored {manifest.arena_summary.versus_8x64_depth_4_score_percent}%
          {" "}against 8×64 at depth 4 and {manifest.arena_summary.versus_classic_depth_4_score_percent}%
          {" "}against the classic evaluator over 256 games per control.
        </p>
      </Section>

      <Section id="quantization" index="03" title="Integer contract">
        <p>
          {manifest.bucket_count} buckets × {manifest.hidden_width} hidden lanes,
          clipped ReLU {manifest.activation.clip}, feature scale {manifest.quantization.feature},
          output scale {manifest.quantization.output}, int8 feature weights, int16 accumulators,
          int16 output weights, and a version {manifest.model_format_version} little-endian header.
        </p>
        <div className="saturation">
          {Object.entries(manifest.export_saturation_counts).map(([name, count]) => (
            <Stat label={`${name} saturation`} value={count} key={name} />
          ))}
        </div>
      </Section>

      <Section id="use" index="04" title="Load it in the host engine">
        <Code>{`cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
printf '%s\\n' uci \\
  'setoption name EvalFile value models/reference.nnue' \\
  isready 'position startpos' eval 'go depth 5' quit | build/p4nnue`}</Code>
        <Notice>The ESP32 P4 firmware embeds this exact artifact as its mapped read-only fallback and also accepts a validated user model from a dedicated flash partition.</Notice>
      </Section>
    </main>
  );
}

export function StatusPage() {
  return (
    <main className="page-shell">
      <PageTitle
        index="status / current boundary"
        title="Firmware compiles · hardware evidence pending"
        lead="The thin ESP-IDF wrapper shares the core, safely selects mapped NNUE storage, and exposes a versioned binary board protocol. No physical-board claim is made yet."
      />
      <section className="status-line" aria-label="Implementation status">
        <div className="complete"><span>complete</span><strong>shared C core</strong></div>
        <div className="complete"><span>complete</span><strong>reference NNUE</strong></div>
        <div className="complete"><span>complete</span><strong>ESP-IDF build</strong></div>
        <div className="complete"><span>complete</span><strong>protocol v1</strong></div>
        <div className="pending"><span>pending</span><strong>physical P4 run</strong></div>
      </section>

      <Section id="firmware" index="01" title="Thin ESP-IDF target">
        <p>
          <code>esp/components/core/CMakeLists.txt</code> compiles the engine files
          directly from <code>src</code>; there is no firmware copy. <code>app_main</code>
          configures unbuffered UART I/O, initializes chess, selects a valid
          flash-mapped network, allocates a fixed 256 KiB table, and enters the
          board protocol loop.
          Wi-Fi, Bluetooth, display, filesystem, server, and authentication are absent.
        </p>
        <Code>{`. /path/to/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py fullclean
idf.py build
idf.py size
idf.py merge-bin -o esp32p4_nnue_merged.bin`}</Code>
        <p>
          ESP-IDF 6.0.2 with RISC-V GCC 15.2 built the 4×128 reference-model image.
          Firmware version 1.1.0 produced a 492,736-byte application binary with
          53% of the one-MiB factory partition free and a 558,272-byte merged raw
          image. Both grew 4,416 bytes from the previous firmware commit. Those are
          compile and layout checks, not board runtime measurements.
        </p>
      </Section>

      <Section id="protocol" index="02" title="Board protocol version 1">
        <p>
          Every frame starts with ASCII <code>P4</code>, then one-byte version and
          command fields, a little-endian <code>u16</code> payload length, at most
          1,024 payload bytes, and a little-endian IEEE CRC32 over the header after
          magic plus payload. Successful replies set command bit 7. Error
          <code>0xff</code> returns the rejected command and an error code. The fixed
          1,034-byte parser buffer handles partial and consecutive frames without allocation.
        </p>
        <Code>{`01 hello        02 device info    03 firmware info
04 model info   10 model begin    11 model chunk
12 model commit 20 position       21 go
22 bench        ff error`}</Code>
        <p>
          Position carries a complete ASCII FEN. Go type 1 requests fixed depth;
          type 2 requests device-measured milliseconds. The result reports UCI move,
          signed centipawn score, completed depth, nodes, elapsed milliseconds,
          active model state, and model CRC32. Version 1 exposes no authentication,
          signatures, accounts, or cryptographic identity field. The ESP32 P4 target
          value is an unverified firmware report.
        </p>
        <Code>{`python3 esp/board_client.py --port /dev/ttyACM0 info
python3 esp/board_client.py --port /dev/ttyACM0 upload models/reference.nnue
python3 esp/board_client.py --port /dev/ttyACM0 search 'FEN' --depth 5
python3 esp/board_client.py --port /dev/ttyACM0 search 'FEN' --time-ms 1000
python3 esp/board_client.py --port /dev/ttyACM0 bench`}</Code>
      </Section>

      <Section id="memory" index="03" title="Flash activation and memory policy">
        <p>
          Firmware is single-core, the main task stack is 32,768 bytes, PSRAM is
          not assumed, and the 262,144-byte transposition table is allocated from
          normal heap. The embedded 328,480-byte fallback remains in mapped
          <code>.flash.rodata</code>. A dedicated 328-KiB partition contains one
          4-KiB metadata sector, exactly one model, and 3,296 rounding bytes.
          Uploaded chunks stream directly to flash; commit writes the validity
          marker last after length, CRC32, format 3, 4-bucket, and width-128 checks.
          Boot maps an uploaded model read-only only when metadata, full CRC, and
          <code>validate_nnue</code> all pass. Otherwise it uses the embedded fallback.
        </p>
        <p>
          The current size report records 81,946 bytes of flash text, 355,844
          bytes of flash read-only data, 8,196 bytes of internal data, and 16,776
          bytes of internal BSS. The parser and upload state are fixed-size; no full
          user model buffer exists in RAM.
        </p>
      </Section>

      <Section id="hardware" index="04" title="Next physical measurements">
        <Notice pending><strong>physical esp32 p4 results pending</strong></Notice>
        <ul>
          <li>boot and UART protocol behavior including interrupted upload</li>
          <li>real table allocation and stack headroom</li>
          <li>integer evaluations per second and fixed-depth search throughput</li>
          <li>native 64-bit bitboards against explicit 32-bit halves</li>
          <li>portable scalar correctness before any P4 PIE SIMD kernel</li>
        </ul>
        <p>
          Web Serial play, verified device identity, NNUE visualization, and the
          online arena remain later website stages. No browser implementation,
          cryptographic device work, or PIE implementation is part of this feature.
        </p>
      </Section>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="page-shell not-found">
      <PageTitle index="404 / route" title="Square not found" lead="That page is outside the current guide." />
      <KeyLink href="/">Return home</KeyLink>
    </main>
  );
}
