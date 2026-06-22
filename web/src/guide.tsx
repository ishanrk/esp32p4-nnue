import type { ReactNode } from "react";

const REPOSITORY = "https://github.com/ishanrk/esp32p4-nnue";

function source(path: string): string {
  return `${REPOSITORY}/blob/main/${path}`;
}

export const GUIDE_STEPS = [
  { id: "guide-budget", number: "01", title: "Set the device budget" },
  { id: "guide-core", number: "02", title: "Build one portable chess core" },
  { id: "guide-state", number: "03", title: "Establish legal chess state" },
  { id: "guide-search", number: "04", title: "Add a bounded search" },
  { id: "guide-profile", number: "05", title: "Choose an integer network profile" },
  { id: "guide-features", number: "06", title: "Keep feature mapping identical" },
  { id: "guide-teacher", number: "07", title: "Collect teacher positions" },
  { id: "guide-shards", number: "08", title: "Prepare sparse training shards" },
  { id: "guide-training", number: "09", title: "Train and freeze a checkpoint" },
  { id: "guide-export", number: "10", title: "Export exact integer inference" },
  { id: "guide-selection", number: "11", title: "Compare profiles under one budget" },
  { id: "guide-firmware", number: "12", title: "Compile the ESP32 P4 firmware" },
  { id: "guide-hardware", number: "13", title: "Validate the physical board" },
  { id: "guide-browser", number: "14", title: "Connect the browser" },
  { id: "guide-adapter", number: "15", title: "Adapt another model or chip" },
] as const;

export const GUIDE_RESOURCES = [
  "https://github.com/maksimKorzh/bbc",
  "https://www.youtube.com/watch?v=QUNP-UjujBM",
  "https://www.chessprogramming.org/Bitboards",
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
    <ul className="resource-links">
      {links.map((link) => (
        <li key={link.href}>
          <a href={link.href}>{link.label}<span aria-hidden="true"> ↗</span></a>
        </li>
      ))}
    </ul>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre tabIndex={0}>
      <code>{children}</code>
    </pre>
  );
}

export function Guide() {
  return (
    <main className="guide-page" id="guide-content" tabIndex={-1}>
      <span aria-hidden="true" className="view-anchor" id="guide" />
      <header className="guide-hero">
        <p className="eyebrow">implementation guide / constrained nnue</p>
        <h1>Build the engine.<br />Train the net.<br />Run the chip.</h1>
        <p className="guide-lead">
          A sequential implementation path for the exact ESP32 P4 reference build
          and a clean adaptation path for another constrained target
        </p>
        <dl className="guide-facts">
          <div><dt>target</dt><dd>ESP32 P4 RV32</dd></div>
          <div><dt>core</dt><dd>C11 single thread</dd></div>
          <div><dt>network</dt><dd>4 buckets × 128</dd></div>
          <div><dt>model</dt><dd>328480 bytes</dd></div>
        </dl>
      </header>

      <div className="guide-layout">
        <nav aria-label="Guide sequence" className="guide-index">
          <span className="guide-index-label">sequence</span>
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
          <GuideSection id="guide-budget" number="01" title="Set the device budget">
            <p>
              Record instruction width flash internal RAM external RAM clock model
              storage search memory stack and serial transport before selecting an
              architecture
            </p>
            <p>
              The reference target is the Waveshare ESP32 P4 Module DEV KIT with an
              ESP32 P4NRW32 module 32 MB package PSRAM and 16 MB NOR flash The current
              training profiles enforce a 512 KiB design ceiling The firmware accepts
              the selected 328480 byte model exactly and stores uploaded weights in a
              0x52000 byte partition with a 4096 byte metadata page The search uses a
              256 KiB transposition table and a 32 KiB main task stack It runs FreeRTOS
              in single core mode and does not depend on PSRAM
            </p>
            <figure className="hardware-figure hardware-figure-wide">
              <img
                alt="Waveshare ESP32 P4 Module DEV KIT with the PWR USB TO UART connector attached"
                decoding="async"
                height="1200"
                loading="lazy"
                src="/images/esp32-p4-module-dev-kit.jpg"
                width="1600"
              />
              <figcaption>
                project author photo of the waveshare esp32 p4 module dev kit used for
                the reference build
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "profile formulas", href: source("train/profiles.py") },
              { label: "runtime profile constants", href: source("src/nnue_config.h") },
              { label: "firmware configuration", href: source("esp/sdkconfig.defaults") },
              { label: "flash partition map", href: source("esp/partitions.csv") },
              { label: "reference model record", href: source("models/reference.json") },
              { label: "waveshare board documentation", href: GUIDE_RESOURCES[4] },
            ]} />
          </GuideSection>

          <GuideSection id="guide-core" number="02" title="Build one portable chess core">
            <p>
              Keep rules evaluation and search in portable C11 Compile the same source
              files for the desktop engine and firmware Keep host and ESP ownership at
              their entry points
            </p>
            <p>
              The firmware component compiles bitboards position move generation search
              evaluation NNUE and timing directly from <code>src</code> Desktop UCI stays
              in <code>src/uci.c</code> Firmware startup model storage and the binary board
              protocol stay in <code>esp</code>
            </p>
            <ResourceLinks links={[
              { label: "shared public core", href: source("src/ch.h") },
              { label: "host build", href: source("CMakeLists.txt") },
              { label: "firmware shared source list", href: source("esp/components/core/CMakeLists.txt") },
              { label: "desktop entry point", href: source("src/main.c") },
              { label: "firmware entry point", href: source("esp/main/app.c") },
              { label: "code monkey king bitboard engine", href: GUIDE_RESOURCES[0] },
              { label: "code monkey king bitboard series", href: GUIDE_RESOURCES[1] },
            ]} />
            <p className="guide-note">
              The Code Monkey King BBC repository is a learning reference under GPL 3
              Its source is not copied into this project
            </p>
          </GuideSection>

          <GuideSection id="guide-state" number="03" title="Establish legal chess state">
            <p>
              Store twelve colored piece sets and three occupancy sets in 64 bit
              bitboards Keep a 64 entry square array for direct lookup Update both
              representations through the same piece helpers
            </p>
            <Code>{`bits 0..5    source square
bits 6..11   destination square
bits 12..14  promotion selector
bits 15..18  capture en passant castle double pawn flags
bits 19..31  reserved`}</Code>
            <p>
              Generate bounded pseudo legal candidates Apply each candidate with
              <code>make_move</code> Reject an exposed king Restore state with
              <code>undo_move</code> Keep the Zobrist key clocks castling rights en
              passant history and NNUE accumulators incremental
            </p>
            <Code>{`cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure`}</Code>
            <ResourceLinks links={[
              { label: "bitboard tables and sliding attacks", href: source("src/bitboard.c") },
              { label: "move generation", href: source("src/movegen.c") },
              { label: "make undo fen uci and perft", href: source("src/position.c") },
              { label: "position move and undo types", href: source("src/ch.h") },
              { label: "chess programming wiki bitboards", href: GUIDE_RESOURCES[2] },
              { label: "move generation reference", href: "https://www.chessprogramming.org/Move_Generation" },
              { label: "perft reference", href: "https://www.chessprogramming.org/Perft" },
              { label: "zobrist reference", href: "https://www.chessprogramming.org/Zobrist_Hashing" },
            ]} />
          </GuideSection>

          <GuideSection id="guide-search" number="04" title="Add a bounded search">
            <p>
              Start with deterministic single threaded search The current baseline uses
              iterative deepening principal variation search quiescence check extension
              late move reduction a fixed transposition table killer moves history
              ordering draw detection and principal variation reconstruction
            </p>
            <p>
              <code>search_position</code> receives mutable position state an optional
              table a depth or time budget and an optional progress callback It returns
              the best move score completed depth node count elapsed time and principal
              variation Only completed iterations become public results
            </p>
            <ResourceLinks links={[
              { label: "search implementation", href: source("src/search.c") },
              { label: "nnue and classical evaluator selection", href: source("src/evaluate.c") },
              { label: "desktop uci loop", href: source("src/uci.c") },
              { label: "repeatable host benchmark", href: source("src/profile_bench.c") },
              { label: "alpha beta reference", href: "https://www.chessprogramming.org/Alpha-Beta" },
              { label: "principal variation search reference", href: "https://www.chessprogramming.org/Principal_Variation_Search" },
              { label: "quiescence reference", href: "https://www.chessprogramming.org/Quiescence_Search" },
              { label: "transposition table reference", href: "https://www.chessprogramming.org/Transposition_Table" },
            ]} />
          </GuideSection>

          <GuideSection id="guide-profile" number="05" title="Choose an integer network profile">
            <p>
              Use two perspectives Normalize Black vertically Mirror the full view when
              a normalized king occupies files e through h Select a king bucket and
              encode own and opposing nonking pieces as ten classes across 64 squares
            </p>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <tbody>
                  <tr><th>perspectives</th><td>2</td></tr>
                  <tr><th>king buckets</th><td>4</td></tr>
                  <tr><th>features per bucket</th><td>640</td></tr>
                  <tr><th>features per perspective</th><td>2560</td></tr>
                  <tr><th>hidden width</th><td>128</td></tr>
                  <tr><th>feature weights</th><td>signed int8</td></tr>
                  <tr><th>accumulators and output weights</th><td>signed int16</td></tr>
                  <tr><th>activation</th><td>clipped relu 0 through 127</td></tr>
                  <tr><th>serialized model</th><td>328480 bytes</td></tr>
                  <tr><th>accumulators</th><td>512 bytes</td></tr>
                </tbody>
              </table>
            </div>
            <Code>{`model bytes = 32 + 6H + 640BH
32 + 6 × 128 + 640 × 4 × 128 = 328480`}</Code>
            <ResourceLinks links={[
              { label: "supported profile formulas", href: source("train/profiles.py") },
              { label: "pytorch network", href: source("train/net.py") },
              { label: "integer dimensions and model layout", href: source("src/ch.h") },
              { label: "scalar integer runtime", href: source("src/nnue.c") },
              { label: "stockfish nnue technical guide", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md" },
              { label: "official stockfish nnue trainer", href: GUIDE_RESOURCES[3] },
            ]} />
          </GuideSection>

          <GuideSection id="guide-features" number="06" title="Keep feature mapping identical">
            <ol className="plain-steps">
              <li>Flip ranks for the Black perspective</li>
              <li>Mirror files when the normalized king occupies files e through h</li>
              <li>Select the normalized king file bucket</li>
              <li>Exclude kings from sparse inputs</li>
              <li>Encode own pawn through queen as classes zero through four</li>
              <li>Encode opposing pawn through queen as classes five through nine</li>
              <li>Append the normalized piece square</li>
              <li>Pad each host feature list to 30 entries</li>
            </ol>
            <p>
              Normal moves add and subtract affected feature vectors in both
              accumulators King moves rebuild only a perspective whose bucket or mirror
              changes Full refresh remains the parity oracle
            </p>
            <ResourceLinks links={[
              { label: "python feature mapping", href: source("train/features.py") },
              { label: "c feature mapping and incremental runtime", href: source("src/nnue.c") },
              { label: "shared feature fixture", href: source("test/nnue_features.txt") },
              { label: "mapping tests", href: source("train/test_features.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-teacher" number="07" title="Collect teacher positions">
            <p>
              Choose a licensed source Store legal nonterminal FEN positions with
              centipawn labels from the side to move Keep source attribution sampling
              policy teacher settings and split policy beside the data
            </p>
            <h3>local pgn and stockfish path</h3>
            <Code>{`python3 train/label.py \
  test/training_games.pgn /path/to/stockfish \
  build-guide/labels.jsonl \
  --nodes 100 --stride 1 --limit 1000 --min-ply 1 \
  --seed 0 --validation-percent 30 --test-percent 30 \
  --data-source "repository synthetic pgn fixture" \
  --data-license "fixture only" \
  --data-attribution "esp32p4 nnue test fixture"`}</Code>
            <p>
              This path samples complete games into one split and requests a fixed
              Stockfish node budget for each selected position
            </p>
            <h3>reference lichess evaluation path</h3>
            <Code>{`python3 train/import_evals.py \
  https://database.lichess.org/lichess_db_eval.jsonl.zst \
  data/reference_labels.jsonl \
  --limit 10000000 --min-depth 20 \
  --selection-denominator 4 --seed 7 \
  --validation-percent 5 --test-percent 5 --workers 12`}</Code>
            <p>
              The shipped network uses the CC0 Lichess Stockfish evaluation stream
              The import scanned 47836886 records and accepted 10000000 positions at
              depth 20 or greater with seeded one in four sampling The split contains
              9000455 training 500453 validation and 499092 test positions
            </p>
            <p className="guide-note">
              The Lichess dump exposes evaluation records rather than source game
              membership Its split therefore operates per accepted record
            </p>
            <ResourceLinks links={[
              { label: "fixed node stockfish labeler", href: source("train/label.py") },
              { label: "streaming lichess importer", href: source("train/import_evals.py") },
              { label: "split and manifest helpers", href: source("train/data.py") },
              { label: "selected data record", href: source("models/reference.json") },
              { label: "stockfish source", href: "https://github.com/official-stockfish/Stockfish" },
              { label: "lichess open database", href: "https://database.lichess.org/" },
            ]} />
          </GuideSection>

          <GuideSection id="guide-shards" number="08" title="Prepare sparse training shards">
            <Code>{`python3 train/prep.py \
  data/reference_labels.jsonl data/reference_4x128 \
  --shard-size 250000 --profile 4x128`}</Code>
            <p>
              Encode the same labeled corpus separately for each candidate profile
              Store two <code>uint16[30]</code> sparse feature arrays and one
              <code>int16</code> centipawn label per position Compressed NPZ shards
              avoid repeated FEN parsing during training
            </p>
            <p>
              The generated manifest records dimensions split counts source
              attribution teacher metadata selection policy and feature format
              Validate every shard against that manifest before training
            </p>
            <ResourceLinks links={[
              { label: "dataset preparation", href: source("train/prep.py") },
              { label: "manifest and shard validation", href: source("train/data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-training" number="09" title="Train and freeze a checkpoint">
            <Code>{`python3 train/train.py \
  data/reference_4x128 model_4x128_seed7.pt \
  --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
  --score-scale 400 --device auto --workers 0 \
  --weight-decay 0.01`}</Code>
            <p>
              Sum sparse embedding rows into each perspective accumulator Add one
              feature bias Clip both vectors Concatenate side to move first and
              opponent second Apply one linear integer output layer
            </p>
            <p>
              Training uses AdamW and transformed smooth L1 over
              <code>tanh(score / 400)</code> Quantizable ranges are enforced after
              every epoch The lowest validation loss selects the checkpoint Test data
              remains untouched during architecture selection
            </p>
            <ResourceLinks links={[
              { label: "network shape", href: source("train/net.py") },
              { label: "training loop and range constraints", href: source("train/train.py") },
              { label: "single final test evaluation", href: source("train/evaluate.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-export" number="10" title="Export exact integer inference">
            <Code>{`python3 train/evaluate.py \
  data/reference_4x128 model_4x128_seed7.pt

python3 train/export.py \
  model_4x128_seed7.pt model_4x128_seed7.nnue

python3 train/compare.py \
  model_4x128_seed7.nnue data/reference_labels.jsonl \
  build/p4eval --limit 1000 --split test`}</Code>
            <p>
              Write a 28 byte little endian header signed 32 bit output bias signed 16
              bit feature bias signed 16 bit output weights and signed 8 bit feature
              weights Reject nonfinite data wrong dimensions unsafe accumulator bias
              and every saturation event
            </p>
            <p>
              Compare exported Python integer output with the C runtime The selected
              model records 1000 comparisons and zero mismatches
            </p>
            <ResourceLinks links={[
              { label: "quantization and serialization", href: source("train/export.py") },
              { label: "readable integer oracle", href: source("train/integer.py") },
              { label: "python and c comparison", href: source("train/compare.py") },
              { label: "model validation binding and evaluation", href: source("src/nnue.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-selection" number="11" title="Compare profiles under one budget">
            <p>
              Train every candidate on the same corpus optimizer batch learning rate
              weight decay score scale epoch count and seed Compare validation across
              repeated seeds then use color reversed fixed depth games for direct play
            </p>
            <Code>{`python3 train/arena.py \
  build-4x128/p4nnue model_4x128_seed7.nnue \
  build-8x96/p4nnue model_8x96_seed7.nnue \
  --depth 5 --max-plies 120 \
  --openings test/openings.json --opening-count 128 \
  --estimate-elo`}</Code>
            <p>
              The controlled sweep covered 4x128 8x64 8x96 and 16x48 The 4x128 and
              8x96 finalists remained statistically indistinguishable in validation
              and direct play The 4x128 profile used 163648 fewer serialized bytes and
              became the provisional reference
            </p>
            <p className="guide-note">
              Match estimates compare these engines under one controlled setup They
              are not an absolute human player rating Host throughput is not ESP32 P4
              throughput
            </p>
            <ResourceLinks links={[
              { label: "profile comparison evidence", href: source("results/profile_comparison.json") },
              { label: "reference result", href: source("results/reference.json") },
              { label: "selected model record", href: source("models/reference.json") },
              { label: "arena runner", href: source("train/arena.py") },
              { label: "opening set preparation", href: source("train/openings.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-firmware" number="12" title="Compile the ESP32 P4 firmware">
            <Code>{`. /home/ishan/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py fullclean
idf.py build
idf.py size
idf.py merge-bin -o esp32p4_nnue_merged.bin`}</Code>
            <p>
              Use ESP IDF 6.0.2 The build embeds <code>models/reference.nnue</code>
              directly into mapped read only flash A validated uploaded network can be
              mapped from the dedicated NNUE partition Neither path copies the full
              model into heap RAM
            </p>
            <p>
              <code>app_main</code> initializes chess tables binds model storage
              allocates the 256 KiB transposition table installs the UART driver and
              enters the binary protocol loop WiFi Bluetooth display filesystem and
              web server code remain absent
            </p>
            <ResourceLinks links={[
              { label: "esp idf project and model embedding", href: source("esp/CMakeLists.txt") },
              { label: "firmware startup and protocol loop", href: source("esp/main/app.c") },
              { label: "mapped fallback and uploaded model", href: source("esp/main/model_storage.c") },
              { label: "partition layout", href: source("esp/partitions.csv") },
              { label: "esp idf 6.0.2 setup", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/linux-macos-setup-legacy.html" },
              { label: "esp32 p4 project build and flash", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/start-project.html" },
              { label: "esp32 p4 uart api", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-reference/peripherals/uart.html" },
            ]} />
          </GuideSection>

          <GuideSection id="guide-hardware" number="13" title="Validate the physical board">
            <p>
              Connect the PWR USB TO UART port Flash one known image Release every
              serial monitor before starting another client One process can own the
              serial port at a time
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
                alt="Physical development setup with the ESP32 P4 board connected beside a laptop"
                decoding="async"
                height="1350"
                loading="lazy"
                src="/images/esp32-p4-test-setup.jpg"
                width="1800"
              />
              <figcaption>
                project author photo of the first physical setup with the board
                connected through pwr usb to uart
              </figcaption>
            </figure>
            <ul className="status-list">
              <li className="is-complete">host core verified</li>
              <li className="is-complete">integer parity verified</li>
              <li className="is-complete">firmware built for esp32 p4</li>
              <li className="is-complete">first physical boot observed</li>
              <li>uart driver correction awaiting recorded reflash validation</li>
              <li>device speed power and thermals still unmeasured</li>
            </ul>
            <div className="video-slot">
              <span>match footage</span>
              <strong>link pending</strong>
              <p>The recorded game belongs here after its URL is supplied</p>
            </div>
          </GuideSection>

          <GuideSection id="guide-browser" number="14" title="Connect the browser">
            <p>
              Open Web Serial at 115200 baud eight data bits one stop bit no parity
              and no flow control Send a complete FEN before every search Validate the
              returned UCI move with the browser chess rules before applying it
            </p>
            <Code>{`request serial port
open port
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
                  <tr><th>go</th><td><code>0x21</code></td><td>budget type and u32</td><td>29 byte result</td></tr>
                  <tr><th>error response</th><td><code>0xff</code></td><td>not a request</td><td>failed command and error code</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Every frame starts with ASCII <code>P4</code> then protocol version
              command payload length payload and IEEE CRC32 A successful response sets
              bit seven on the request command
            </p>
            <ResourceLinks links={[
              { label: "browser framing and codecs", href: source("web/src/protocol.ts") },
              { label: "web serial transport and device checks", href: source("web/src/device.ts") },
              { label: "fen and legal uci integration", href: source("web/src/game.ts") },
              { label: "fake serial port tests", href: source("web/src/site.test.ts") },
              { label: "web serial specification", href: GUIDE_RESOURCES[5] },
            ]} />
          </GuideSection>

          <GuideSection id="guide-adapter" number="15" title="Adapt another model or chip">
            <h3>compatible weights on this board</h3>
            <p>
              Keep model format 3 four buckets width 128 and 328480 serialized bytes
              Export new weights with <code>train/export.py</code> Embed the file during
              the firmware build or upload it before browser play The website requires
              no change for compatible weights
            </p>
            <Code>{`python3 esp/board_client.py \
  --port /dev/ttyACM0 upload path/to/model.nnue`}</Code>
            <h3>another microcontroller</h3>
            <ol className="plain-steps">
              <li>Compile the portable C core or supply another legal chess engine</li>
              <li>Provide a monotonic millisecond clock</li>
              <li>Expose USB serial or a UART bridge at the configured line settings</li>
              <li>Reuse the C protocol or reproduce its byte format exactly</li>
              <li>Implement hello device info position go and error commands</li>
              <li>Accept complete FEN text</li>
              <li>Return a legal UCI move in the fixed search result</li>
              <li>Allocate a new target identifier in <code>esp/protocol.h</code></li>
              <li>Extend browser device validation in <code>web/src/device.ts</code></li>
              <li>Add binary frame fixtures and a fake serial port test</li>
              <li>Measure flash RAM stack speed power and temperature on target</li>
            </ol>
            <p>
              The current browser accepts protocol 1 ESP32 P4 target 1 model format 3
              four buckets width 128 exactly 328480 active model bytes and embedded or
              uploaded model state A different network shape requires matching changes
              in training constants serialization C runtime firmware metadata storage
              limits and browser validation
            </p>
            <p>
              A different engine can retain the same browser interface when it accepts
              FEN and returns legal UCI The browser never depends on the internal search
              or evaluation implementation
            </p>
            <ResourceLinks links={[
              { label: "protocol identifiers and records", href: source("esp/protocol.h") },
              { label: "allocation free c frame parser", href: source("esp/protocol.c") },
              { label: "standard library host client", href: source("esp/board_client.py") },
              { label: "browser compatibility checks", href: source("web/src/device.ts") },
              { label: "browser transport tests", href: source("web/src/site.test.ts") },
            ]} />
          </GuideSection>

          <footer className="guide-end">
            <span>15 / 15</span>
            <strong>one constrained path from board state to physical search</strong>
          </footer>
        </article>
      </div>
    </main>
  );
}
