import type { ReactNode } from "react";

const REPOSITORY = "https://github.com/ishanrk/esp32p4-nnue";

function source(path: string): string {
  return `${REPOSITORY}/blob/main/${path}`;
}

export const GUIDE_STEPS = [
  { id: "guide-budget", number: "01", title: "Measure the hardware limits" },
  { id: "guide-core", number: "02", title: "Build the chess engine in C" },
  { id: "guide-state", number: "03", title: "Store the board and legal moves" },
  { id: "guide-search", number: "04", title: "Add the chess search" },
  { id: "guide-profile", number: "05", title: "Choose the NNUE size" },
  { id: "guide-features", number: "06", title: "Match the Python and C features" },
  { id: "guide-teacher", number: "07", title: "Create Stockfish training labels" },
  { id: "guide-shards", number: "08", title: "Prepare the training data" },
  { id: "guide-training", number: "09", title: "Train the NNUE" },
  { id: "guide-export", number: "10", title: "Export the NNUE for C" },
  { id: "guide-selection", number: "11", title: "Test the NNUE sizes" },
  { id: "guide-firmware", number: "12", title: "Build the ESP32 P4 firmware" },
  { id: "guide-hardware", number: "13", title: "Test the physical ESP32 P4 board" },
  { id: "guide-browser", number: "14", title: "Connect the browser to the board" },
  { id: "guide-adapter", number: "15", title: "Use another NNUE or microcontroller" },
] as const;

export const GUIDE_RESOURCES = [
  "https://www.chessprogramming.org/",
  "https://github.com/maksimKorzh/bbc",
  "https://www.youtube.com/watch?v=QUNP-UjujBM",
  "https://github.com/official-stockfish/nnue-pytorch",
  "https://docs.waveshare.com/ESP32-P4-Module-DEV-KIT",
  "https://wicg.github.io/serial/",
] as const;

type Resource = {
  label: string;
  href: string;
};

function GuideSection({
  children,
  id,
  number,
  title,
}: {
  children: ReactNode;
  id: string;
  number: string;
  title: string;
}) {
  return (
    <section className="guide-section" id={id}>
      <header className="guide-section-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </header>
      <div className="guide-section-body">{children}</div>
    </section>
  );
}

function ResourceLinks({ links }: { links: readonly Resource[] }) {
  return (
    <div className="resource-block">
      <strong>References and project code</strong>
      <ul className="resource-links">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}<span aria-hidden="true">↗</span></a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

function ReferenceFigure({
  alt,
  caption,
  className = "",
  height,
  src,
  width,
}: {
  alt: string;
  caption: ReactNode;
  className?: string;
  height: number;
  src: string;
  width: number;
}) {
  return (
    <figure className={`reference-figure ${className}`.trim()}>
      <div className="reference-image-wrap">
        <img
          alt={alt}
          decoding="async"
          height={height}
          loading="lazy"
          src={src}
          width={width}
        />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function Guide() {
  return (
    <main className="guide-page" id="guide-content" tabIndex={-1}>
      <span aria-hidden="true" className="view-anchor" id="guide" />
      <header className="guide-hero">
        <p className="eyebrow">ESP32 P4 NNUE GUIDE</p>
        <h1>A Small Guide on How to Build Your Own Neural Networks Under Hardware Constraints</h1>
        <p className="guide-lead">
          This guide follows the exact chess engine, NNUE training, firmware, and
          browser code used for the Waveshare ESP32-P4 board. Each step links to
          the project files and the outside references used for that part.
        </p>
        <dl className="guide-facts">
          <div><dt>board</dt><dd>Waveshare ESP32-P4</dd></div>
          <div><dt>engine</dt><dd>Portable C11</dd></div>
          <div><dt>network</dt><dd>4 buckets × 128</dd></div>
          <div><dt>model size</dt><dd>328,480 bytes</dd></div>
        </dl>
        <div className="primary-references">
          <p>
            <a href={GUIDE_RESOURCES[0]}>Chess Programming Wiki</a> is the main
            reference for board representation, move generation, engine testing,
            evaluation, and search.
          </p>
          <p>
            <a href={GUIDE_RESOURCES[1]}>Code Monkey King</a> provides a practical
            C bitboard engine in the BBC repository and a separate
            {" "}<a href={GUIDE_RESOURCES[2]}>video series</a>.
          </p>
        </div>
      </header>

      <div className="guide-layout">
        <nav aria-label="Guide sequence" className="guide-index">
          <span className="guide-index-label">15 steps</span>
          <ol>
            {GUIDE_STEPS.map((step) => (
              <li key={step.id}>
                <a href={`#${step.id}`}>
                  <span>{step.number}</span>
                  {step.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="guide-content">
          <GuideSection id="guide-budget" number="01" title="Measure the hardware limits">
            <p>
              Write down the CPU width, clock speed, flash, internal RAM, external
              RAM, model storage, search memory, stack size, and serial connection.
              These limits set the largest network and transposition table that fit.
            </p>
            <p>
              This project uses the Waveshare ESP32-P4-Module-DEV-KIT with an
              ESP32-P4NRW32 module, 32 MB PSRAM, and 16 MB flash. The NNUE profiles
              stay below 512 KiB. The selected model is 328,480 bytes. Firmware
              reserves 256 KiB for the transposition table and 32 KiB for the main
              task stack. It runs on one core and does not require PSRAM.
            </p>
            <figure className="hardware-figure hardware-figure-wide">
              <img
                alt="Waveshare ESP32-P4-Module-DEV-KIT with the USB serial cable attached"
                decoding="async"
                height="1200"
                loading="lazy"
                src="/images/esp32-p4-module-dev-kit.jpg"
                width="1600"
              />
              <figcaption>
                Waveshare ESP32-P4-Module-DEV-KIT used for this project. Photo by
                Ishan Kumthekar.
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "Waveshare documentation — ESP32-P4-Module-DEV-KIT", href: GUIDE_RESOURCES[4] },
              { label: "Project code — train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code — src/nnue_config.h", href: source("src/nnue_config.h") },
              { label: "Project code — esp/sdkconfig.defaults", href: source("esp/sdkconfig.defaults") },
              { label: "Project record — models/reference.json", href: source("models/reference.json") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-core" number="02" title="Build the chess engine in C">
            <p>
              Put chess rules, evaluation, and search in one portable C11 core.
              Compile the same C files for desktop tests and ESP32-P4 firmware. The
              <code>src</code> directory contains the shared engine. Desktop UCI stays
              in <code>src/uci.c</code>. Board startup, model storage, and the serial
              protocol stay in <code>esp</code>.
            </p>
            <div className="reference-callouts">
              <p>
                <strong>Chess Programming Wiki</strong>
                Use it as the main map of chess-engine concepts and established
                terminology.
              </p>
              <p>
                <strong>Code Monkey King</strong>
                Use BBC as a compact working example of bitboards and move generation
                in C. This project does not copy BBC source.
              </p>
            </div>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki — Main Page", href: GUIDE_RESOURCES[0] },
              { label: "Chess Programming Wiki — Board Representation", href: "https://www.chessprogramming.org/Board_Representation" },
              { label: "Code Monkey King — BBC repository", href: GUIDE_RESOURCES[1] },
              { label: "Code Monkey King — bitboard video series", href: GUIDE_RESOURCES[2] },
              { label: "Project code — src/ch.h", href: source("src/ch.h") },
              { label: "Project build — CMakeLists.txt", href: source("CMakeLists.txt") },
              { label: "Project firmware build — esp/components/core/CMakeLists.txt", href: source("esp/components/core/CMakeLists.txt") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-state" number="03" title="Store the board and legal moves">
            <p>
              The engine stores twelve piece bitboards and three occupancy bitboards.
              It also stores one piece value for each of the 64 squares. Every move
              updates both representations.
            </p>
            <ReferenceFigure
              alt="Chessboard showing algebraic file and rank coordinates"
              caption={(
                <>
                  Algebraic square coordinates used by FEN, UCI moves, bitboards, and
                  the 64-entry square array. Diagram derived by Beao from work credited
                  on the {" "}<a href="https://commons.wikimedia.org/wiki/File:SCD_algebraic_notation.svg">source page</a>.
                  Unmodified and licensed {" "}<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>.
                </>
              )}
              className="reference-figure-board"
              height={246}
              src="/images/reference/chess-coordinates.svg"
              width={242}
            />
            <Code>{`bits 0..5    source square
bits 6..11   destination square
bits 12..14  promotion selector
bits 15..18  capture en passant castle double pawn flags
bits 19..31  reserved`}</Code>
            <p>
              Generate pseudo-legal moves. Make one move. Reject it when it leaves
              the moving side&apos;s king in check. Undo it. The undo record restores
              captured pieces, castling rights, en passant, clocks, the Zobrist hash,
              and NNUE accumulator state.
            </p>
            <Code>{`cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure`}</Code>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki — Bitboards", href: "https://www.chessprogramming.org/Bitboards" },
              { label: "Chess Programming Wiki — Move Generation", href: "https://www.chessprogramming.org/Move_Generation" },
              { label: "Chess Programming Wiki — Make Move", href: "https://www.chessprogramming.org/Make_Move" },
              { label: "Chess Programming Wiki — Unmake Move", href: "https://www.chessprogramming.org/Unmake_Move" },
              { label: "Chess Programming Wiki — Perft", href: "https://www.chessprogramming.org/Perft" },
              { label: "Chess Programming Wiki — Zobrist Hashing", href: "https://www.chessprogramming.org/Zobrist_Hashing" },
              { label: "Project code — src/bitboard.c", href: source("src/bitboard.c") },
              { label: "Project code — src/movegen.c", href: source("src/movegen.c") },
              { label: "Project code — src/position.c", href: source("src/position.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-search" number="04" title="Add the chess search">
            <p>
              Use one score from the side to move. Search each child with the sign
              reversed. Alpha-beta stops branches that cannot change the result.
              Iterative deepening completes depth 1, then 2, then 3, so the engine
              always has a finished answer.
            </p>
            <div className="reference-pair">
              <ReferenceFigure
                alt="Three stages of values moving upward through a minimax tree"
                caption={(
                  <>
                    A minimax tree with leaf scores carried back toward the root.
                    Negamax uses the same choices with one signed score convention.
                    Diagram by Handige Harrie from {" "}<a href="https://commons.wikimedia.org/wiki/File:MiniMax.svg">Wikimedia Commons</a>, public domain.
                  </>
                )}
                height={360}
                src="/images/reference/minimax-tree.svg"
                width={180}
              />
              <ReferenceFigure
                alt="Alpha-beta search tree with gray pruned branches"
                caption={(
                  <>
                    Alpha-beta leaves gray branches unsearched after their result can
                    no longer affect the root. Diagram by Antonsusi, based on Sgop,
                    from {" "}<a href="https://commons.wikimedia.org/wiki/File:Alpha_beta.svg">Wikimedia Commons</a>, public domain.
                  </>
                )}
                height={800}
                src="/images/reference/alpha-beta-tree.svg"
                width={1600}
              />
            </div>
            <h3>Quiescence search</h3>
            <p>
              At depth zero, quiescence search continues tactical captures before
              evaluation. This keeps a hanging queen or an unfinished exchange from
              producing an unstable score at the search boundary.
            </p>
            <h3>The current search result</h3>
            <p>
              The engine also uses principal variation search, a fixed transposition
              table, killer moves, history ordering, one check extension, and late
              move reduction. <code>search_position</code> returns the best move,
              score, completed depth, node count, elapsed time, and principal variation.
            </p>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki — Negamax", href: "https://www.chessprogramming.org/Negamax" },
              { label: "Chess Programming Wiki — Alpha-Beta", href: "https://www.chessprogramming.org/Alpha-Beta" },
              { label: "Chess Programming Wiki — Iterative Deepening", href: "https://www.chessprogramming.org/Iterative_Deepening" },
              { label: "Chess Programming Wiki — Principal Variation Search", href: "https://www.chessprogramming.org/Principal_Variation_Search" },
              { label: "Chess Programming Wiki — Quiescence Search", href: "https://www.chessprogramming.org/Quiescence_Search" },
              { label: "Chess Programming Wiki — Horizon Effect", href: "https://www.chessprogramming.org/Horizon_Effect" },
              { label: "Chess Programming Wiki — Transposition Table", href: "https://www.chessprogramming.org/Transposition_Table" },
              { label: "Chess Programming Wiki — Move Ordering", href: "https://www.chessprogramming.org/Move_Ordering" },
              { label: "Chess Programming Wiki — Late Move Reductions", href: "https://www.chessprogramming.org/Late_Move_Reductions" },
              { label: "Project code — src/search.c", href: source("src/search.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-profile" number="05" title="Choose the NNUE size">
            <p>
              This is a king-conditioned NNUE inspired by HalfKP. The king square
              selects one of four mirrored buckets. The other pieces select sparse
              piece-square features. Each side has one 128-value accumulator.
            </p>
            <ReferenceFigure
              alt="Feed-forward neural network with input hidden and output layers"
              caption={(
                <>
                  A general feed-forward network showing inputs, hidden layers, and an
                  output. The project NNUE is smaller and activates only the feature
                  rows present on the chessboard. Diagram by Offnfopt from {" "}<a href="https://commons.wikimedia.org/wiki/File:Multi-Layer_Neural_Network-Vector.svg">Wikimedia Commons</a>, released to the public domain under {" "}<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>.
                </>
              )}
              className="reference-figure-network"
              height={305}
              src="/images/reference/neural-network-layers.svg"
              width={527}
            />
            <div className="table-wrap" tabIndex={0}>
              <table>
                <tbody>
                  <tr><th>perspectives</th><td>2</td></tr>
                  <tr><th>king buckets</th><td>4</td></tr>
                  <tr><th>features per bucket</th><td>640</td></tr>
                  <tr><th>features per perspective</th><td>2,560</td></tr>
                  <tr><th>hidden width</th><td>128</td></tr>
                  <tr><th>feature weights</th><td>signed int8</td></tr>
                  <tr><th>accumulators and output weights</th><td>signed int16</td></tr>
                  <tr><th>activation</th><td>clipped ReLU from 0 through 127</td></tr>
                  <tr><th>serialized model</th><td>328,480 bytes</td></tr>
                  <tr><th>both accumulators</th><td>512 bytes</td></tr>
                </tbody>
              </table>
            </div>
            <Code>{`model bytes = 32 + 6H + 640BH
32 + 6 × 128 + 640 × 4 × 128 = 328480`}</Code>
            <ResourceLinks links={[
              { label: "Stockfish — NNUE technical documentation", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md" },
              { label: "Stockfish — official nnue-pytorch trainer", href: GUIDE_RESOURCES[3] },
              { label: "Chess Programming Wiki — NNUE", href: "https://www.chessprogramming.org/NNUE" },
              { label: "Project code — train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code — train/net.py", href: source("train/net.py") },
              { label: "Project code — src/nnue.c", href: source("src/nnue.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-features" number="06" title="Match the Python and C features">
            <p>
              Implement the same feature index in Python and C. The Black view flips
              ranks. Kings on files e through h mirror the board. The king file selects
              a bucket. Non-king pieces map to ten piece classes.
            </p>
            <ol className="plain-steps">
              <li>Flip ranks for the Black perspective</li>
              <li>Mirror files when the normalized king occupies files e through h</li>
              <li>Select the normalized king-file bucket</li>
              <li>Exclude kings from sparse inputs</li>
              <li>Map friendly pawns through queens to classes zero through four</li>
              <li>Map opposing pawns through queens to classes five through nine</li>
              <li>Append the normalized piece square</li>
              <li>Pad each training feature list to 30 entries</li>
            </ol>
            <p>
              A normal move subtracts old feature vectors and adds new ones. Rebuild
              one perspective only when a king changes its bucket or mirror. Compare
              every incremental result with a full refresh after make and undo.
            </p>
            <ResourceLinks links={[
              { label: "Stockfish — NNUE feature transformation", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md#feature-transformer" },
              { label: "Project code — train/features.py", href: source("train/features.py") },
              { label: "Project code — src/nnue.c", href: source("src/nnue.c") },
              { label: "Project fixture — test/nnue_features.txt", href: source("test/nnue_features.txt") },
              { label: "Project tests — train/test_features.py", href: source("train/test_features.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-teacher" number="07" title="Create Stockfish training labels">
            <p>
              Use Stockfish scores as training targets. Store a legal FEN and a
              centipawn score from the side to move. Record the source, license,
              teacher settings, random seed, and data split.
            </p>
            <h3>Small local data path</h3>
            <p>
              Sample complete PGN games and ask Stockfish for a fixed-node search.
              This path is useful for checking the complete pipeline with a small file.
            </p>
            <Code>{`python3 train/label.py \
  test/training_games.pgn /path/to/stockfish \
  build-guide/labels.jsonl \
  --nodes 100 --stride 1 --limit 1000 --min-ply 1 \
  --seed 0 --validation-percent 30 --test-percent 30`}</Code>
            <h3>Reference model data path</h3>
            <p>
              The shipped model uses the CC0 Lichess Stockfish evaluation database.
              The importer scanned 47,836,886 records and kept 10,000,000 positions at
              depth 20 or greater. The split contains 9,000,455 training positions,
              500,453 validation positions, and 499,092 test positions.
            </p>
            <Code>{`python3 train/import_evals.py \
  https://database.lichess.org/lichess_db_eval.jsonl.zst \
  data/reference_labels.jsonl \
  --limit 10000000 --min-depth 20 \
  --selection-denominator 4 --seed 7 \
  --validation-percent 5 --test-percent 5 --workers 12`}</Code>
            <p className="guide-note">
              The Lichess file contains evaluation records rather than original game
              membership, so the importer splits accepted records individually.
            </p>
            <ResourceLinks links={[
              { label: "Stockfish — official source", href: "https://github.com/official-stockfish/Stockfish" },
              { label: "Lichess — open evaluation database", href: "https://database.lichess.org/" },
              { label: "Project code — train/label.py", href: source("train/label.py") },
              { label: "Project code — train/import_evals.py", href: source("train/import_evals.py") },
              { label: "Project code — train/data.py", href: source("train/data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-shards" number="08" title="Prepare the training data">
            <p>
              Convert every FEN into two fixed lists of active feature indexes and one
              int16 centipawn label. Save the data in compressed NPZ shards so training
              does not parse FEN during every epoch.
            </p>
            <Code>{`python3 train/prep.py \
  data/reference_labels.jsonl data/reference_4x128 \
  --shard-size 250000 --profile 4x128`}</Code>
            <p>
              Create separate shards for each NNUE size. Store dimensions, split
              counts, attribution, and teacher settings in the manifest. Validate
              every shard before training.
            </p>
            <ResourceLinks links={[
              { label: "Project code — train/prep.py", href: source("train/prep.py") },
              { label: "Project code — train/data.py", href: source("train/data.py") },
              { label: "Project tests — train/test_data.py", href: source("train/test_data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-training" number="09" title="Train the NNUE">
            <p>
              Sum the sparse feature rows for both perspectives. Add the feature bias,
              clip the values, place the side-to-move accumulator first, and send the
              256 values through the output layer.
            </p>
            <Code>{`python3 train/train.py \
  data/reference_4x128 model_4x128_seed7.pt \
  --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
  --score-scale 400 --device auto --workers 0 \
  --weight-decay 0.01`}</Code>
            <p>
              Training uses AdamW and smooth L1 loss over
              <code>tanh(score / 400)</code>. Clamp parameters to exportable ranges
              after every epoch. Keep the checkpoint with the lowest validation loss.
              Use the test split only after model selection.
            </p>
            <ResourceLinks links={[
              { label: "PyTorch — AdamW", href: "https://docs.pytorch.org/docs/stable/generated/torch.optim.AdamW.html" },
              { label: "PyTorch — Smooth L1 loss", href: "https://docs.pytorch.org/docs/stable/generated/torch.nn.SmoothL1Loss.html" },
              { label: "Project code — train/net.py", href: source("train/net.py") },
              { label: "Project code — train/train.py", href: source("train/train.py") },
              { label: "Project code — train/evaluate.py", href: source("train/evaluate.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-export" number="10" title="Export the NNUE for C">
            <p>
              Write the model in the exact order read by the C loader: header, output
              bias, feature bias, output weights, and feature weights. Reject wrong
              dimensions, nonfinite values, unsafe accumulator bias, and saturation.
            </p>
            <Code>{`python3 train/evaluate.py \
  data/reference_4x128 model_4x128_seed7.pt

python3 train/export.py \
  model_4x128_seed7.pt model_4x128_seed7.nnue

python3 train/compare.py \
  model_4x128_seed7.nnue data/reference_labels.jsonl \
  build/p4eval --limit 1000 --split test`}</Code>
            <p>
              Run the same positions through the Python integer implementation and
              the C runtime. Require exact scores. The selected model matched on all
              1,000 comparison positions.
            </p>
            <ResourceLinks links={[
              { label: "Project code — train/export.py", href: source("train/export.py") },
              { label: "Project code — train/integer.py", href: source("train/integer.py") },
              { label: "Project code — train/compare.py", href: source("train/compare.py") },
              { label: "Project code — src/nnue.c", href: source("src/nnue.c") },
              { label: "Project model record — models/reference.json", href: source("models/reference.json") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-selection" number="11" title="Test the NNUE sizes">
            <p>
              Train every NNUE size with the same data, optimizer, batch size,
              learning rate, epoch count, and seed. Compare validation loss across
              repeated seeds. Play paired games with the same openings and reversed
              colors.
            </p>
            <Code>{`python3 train/arena.py \
  build-4x128/p4nnue model_4x128_seed7.nnue \
  build-8x96/p4nnue model_8x96_seed7.nnue \
  --depth 5 --max-plies 120 \
  --openings test/openings.json --opening-count 128 \
  --estimate-elo`}</Code>
            <p>
              The tested profiles were 4x128, 8x64, 8x96, and 16x48. The 4x128 and
              8x96 networks were statistically indistinguishable in validation and
              direct play. The 4x128 model is 163,648 bytes smaller, so it became the
              provisional reference.
            </p>
            <p className="guide-note">
              These matches compare only the tested engines. They do not establish an
              absolute human Elo. ESP32-P4 search speed is still unmeasured.
            </p>
            <ResourceLinks links={[
              { label: "Project results — profile comparison", href: source("results/profile_comparison.json") },
              { label: "Project results — reference model", href: source("results/reference.json") },
              { label: "Project code — train/arena.py", href: source("train/arena.py") },
              { label: "Project code — train/openings.py", href: source("train/openings.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-firmware" number="12" title="Build the ESP32 P4 firmware">
            <p>
              Build with ESP-IDF 6.0.2 for the <code>esp32p4</code> target. The build
              embeds <code>models/reference.nnue</code> in mapped read-only flash. An
              uploaded model uses the dedicated NNUE partition. Neither path copies
              the full model to the heap.
            </p>
            <Code>{`. /home/ishan/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py fullclean
idf.py build
idf.py size
idf.py merge-bin -o esp32p4_nnue_merged.bin`}</Code>
            <p>
              At boot, <code>app_main</code> initializes chess tables, binds the model,
              allocates the 256 KiB transposition table, installs UART, and starts the
              binary command loop. The firmware contains no Wi-Fi, Bluetooth, display,
              filesystem, or web server.
            </p>
            <ResourceLinks links={[
              { label: "Espressif — ESP-IDF setup for ESP32-P4", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/linux-macos-setup-legacy.html" },
              { label: "Espressif — build and flash a project", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/start-project.html" },
              { label: "Espressif — ESP32-P4 UART API", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-reference/peripherals/uart.html" },
              { label: "Project firmware — esp/main/app.c", href: source("esp/main/app.c") },
              { label: "Project firmware — esp/main/model_storage.c", href: source("esp/main/model_storage.c") },
              { label: "Project firmware — esp/partitions.csv", href: source("esp/partitions.csv") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-hardware" number="13" title="Test the physical ESP32 P4 board">
            <p>
              Connect the cable to the port labeled PWR USB TO UART. Flash one known
              firmware image. Close every serial monitor before running the board
              client because only one process can own the port.
            </p>
            <Code>{`cd /home/ishan/esp32p4-nnue/esp
idf.py -p PORT flash

cd /home/ishan/esp32p4-nnue
python3 esp/board_client.py --port /dev/ttyACM0 info
python3 esp/board_client.py --port /dev/ttyACM0 bench
python3 esp/board_client.py --port /dev/ttyACM0 search \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --depth 5`}</Code>
            <figure className="hardware-figure">
              <img
                alt="ESP32-P4 development board connected beside a laptop during the first physical test"
                decoding="async"
                height="1350"
                loading="lazy"
                src="/images/esp32-p4-test-setup.jpg"
                width="1800"
              />
              <figcaption>
                First physical ESP32-P4 test setup. Photo by Ishan Kumthekar.
              </figcaption>
            </figure>
            <ul className="status-list">
              <li className="is-complete">Host chess core verified</li>
              <li className="is-complete">Python and C integer scores matched</li>
              <li className="is-complete">Firmware built for ESP32-P4</li>
              <li className="is-complete">First physical boot observed</li>
              <li>UART correction still needs a recorded reflash test</li>
              <li>Board speed, power, memory headroom, and temperature are unmeasured</li>
            </ul>
            <div className="video-slot">
              <span>Recorded board game</span>
              <strong>Video link pending</strong>
              <p>The finished game recording can be added here without changing the guide.</p>
            </div>
          </GuideSection>

          <GuideSection id="guide-browser" number="14" title="Connect the browser to the board">
            <p>
              The website does not use an HTTP API. It communicates with the
              microcontroller through Web Serial.
            </p>
            <p>
              Open the port at 115200 baud with eight data bits, one stop bit, no
              parity, and no flow control. Send a complete FEN before every search.
              The firmware returns a UCI move. The browser checks that move against
              the legal moves before applying it.
            </p>
            <Code>{`request serial port
open at 115200 baud
send hello
read protocol version
send device info
validate target and model
send complete fen
wait for acknowledgement
send depth 5 search
read 29 byte result
validate returned uci move`}</Code>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr><th>message</th><th>id</th><th>request payload</th><th>response payload</th></tr>
                </thead>
                <tbody>
                  <tr><th>hello</th><td><code>0x01</code></td><td>empty</td><td>version byte</td></tr>
                  <tr><th>device info</th><td><code>0x02</code></td><td>empty</td><td>target and model metadata</td></tr>
                  <tr><th>position</th><td><code>0x20</code></td><td>ASCII FEN</td><td>empty acknowledgement</td></tr>
                  <tr><th>go</th><td><code>0x21</code></td><td>budget type and u32</td><td>29-byte result</td></tr>
                  <tr><th>error</th><td><code>0xff</code></td><td>not a request</td><td>failed command and error code</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Each binary frame contains the P4 marker, protocol version, command,
              payload length, payload, and CRC32. A successful response sets bit seven
              on the request command.
            </p>
            <ResourceLinks links={[
              { label: "Web Incubator CG — Web Serial specification", href: GUIDE_RESOURCES[5] },
              { label: "Project browser — web/src/protocol.ts", href: source("web/src/protocol.ts") },
              { label: "Project browser — web/src/device.ts", href: source("web/src/device.ts") },
              { label: "Project browser — web/src/game.ts", href: source("web/src/game.ts") },
              { label: "Project tests — web/src/site.test.ts", href: source("web/src/site.test.ts") },
              { label: "Project firmware protocol — esp/protocol.h", href: source("esp/protocol.h") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-adapter" number="15" title="Use another NNUE or microcontroller">
            <h3>Use new weights on this board</h3>
            <p>
              Export model format 3 with four buckets, width 128, and 328,480 bytes.
              Embed the file during the firmware build or upload it with
              <code>board_client.py</code>. The website needs no change when those
              values stay the same.
            </p>
            <Code>{`python3 esp/board_client.py \
  --port /dev/ttyACM0 upload path/to/model.nnue`}</Code>
            <h3>Connect a different microcontroller</h3>
            <p>
              Implement the same hello, device info, position, go, and error messages.
              Accept a complete FEN and return a legal UCI move. Add a target identifier
              in <code>esp/protocol.h</code>, allow it in <code>web/src/device.ts</code>,
              and add protocol fixtures with a fake serial-port test.
            </p>
            <ol className="plain-steps">
              <li>Run a legal chess engine on the new target</li>
              <li>Expose USB serial or a UART bridge</li>
              <li>Use the same binary frame header and CRC32</li>
              <li>Return target and model metadata from device info</li>
              <li>Accept full FEN position messages</li>
              <li>Return legal UCI moves in the fixed search response</li>
              <li>Extend browser validation for the new target identifier</li>
              <li>Add byte-level protocol and fake-port tests</li>
            </ol>
            <p>
              The browser does not depend on the search or NNUE internals. Any engine
              can connect when it implements the serial protocol and returns legal UCI
              moves.
            </p>
            <ResourceLinks links={[
              { label: "Project protocol — esp/protocol.h", href: source("esp/protocol.h") },
              { label: "Project protocol — esp/protocol.c", href: source("esp/protocol.c") },
              { label: "Project host client — esp/board_client.py", href: source("esp/board_client.py") },
              { label: "Project browser checks — web/src/device.ts", href: source("web/src/device.ts") },
              { label: "Project browser tests — web/src/site.test.ts", href: source("web/src/site.test.ts") },
            ]} />
          </GuideSection>

          <footer className="guide-end">
            <span>Step 15 of 15</span>
            <strong>The complete path from chess code to a running microcontroller</strong>
          </footer>
        </article>
      </div>
    </main>
  );
}
