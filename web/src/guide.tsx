import type { ReactNode } from "react";

const REPOSITORY = "https://github.com/ishanrk/esp32p4-nnue";

function source(path: string): string {
  return `${REPOSITORY}/blob/main/${path}`;
}

export const GUIDE_STEPS = [
  { id: "guide-budget", number: "01", title: "Measure your hardware limits" },
  { id: "guide-core", number: "02", title: "Build your chess engine in C" },
  { id: "guide-state", number: "03", title: "Store your board and legal moves" },
  { id: "guide-search", number: "04", title: "Add search to your engine" },
  { id: "guide-profile", number: "05", title: "Choose a NNUE that fits your hardware" },
  { id: "guide-features", number: "06", title: "Make Python and C create the same features" },
  { id: "guide-teacher", number: "07", title: "Create your Stockfish training labels" },
  { id: "guide-shards", number: "08", title: "Prepare your training data" },
  { id: "guide-training", number: "09", title: "Train your NNUE" },
  { id: "guide-export", number: "10", title: "Export your NNUE for C" },
  { id: "guide-selection", number: "11", title: "Test your NNUE choices" },
  { id: "guide-firmware", number: "12", title: "Build your ESP32 P4 firmware" },
  { id: "guide-hardware", number: "13", title: "Test your physical board" },
  { id: "guide-browser", number: "14", title: "Connect your browser to your board" },
  { id: "guide-adapter", number: "15", title: "Use your own NNUE or microcontroller" },
] as const;

export const GUIDE_RESOURCES = [
  "https://www.chessprogramming.org/",
  "https://github.com/maksimKorzh/bbc",
  "https://github.com/official-stockfish/nnue-pytorch",
  "https://docs.waveshare.com/ESP32-P4-Module-DEV-KIT",
  "https://wicg.github.io/serial/",
  "https://developer.chrome.com/docs/capabilities/serial",
  "https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https",
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
      <nav aria-label="Section references" className="resource-links">
        {links.map((link) => (
          <a href={link.href} key={link.href}>{link.label}</a>
        ))}
      </nav>
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

function CodeStudy({
  children,
  code,
  path,
  title,
}: {
  children: ReactNode;
  code: string;
  path: string;
  title: string;
}) {
  return (
    <section className="code-study">
      <header className="code-study-heading">
        <span>Project code</span>
        <h3>{title}</h3>
        <a href={source(path)}>{path}</a>
      </header>
      <Code>{code}</Code>
      <div className="code-study-notes">{children}</div>
    </section>
  );
}

function ReferenceFigure({
  alt,
  caption,
  compact = false,
  height,
  src,
  width,
}: {
  alt: string;
  caption: ReactNode;
  compact?: boolean;
  height: number;
  src: string;
  width: number;
}) {
  return (
    <figure className={`reference-figure${compact ? " is-compact" : ""}`}>
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

function GuideStepList() {
  return (
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
          This guide follows the chess engine, NNUE training code, firmware, and browser
          used with the Waveshare ESP32 P4 board. Each part is explained in plain terms
          before the code that implements it.
        </p>
        <dl className="guide-facts">
          <div><dt>board</dt><dd>Waveshare ESP32 P4</dd></div>
          <div><dt>engine</dt><dd>Portable C11</dd></div>
          <div><dt>network</dt><dd>4 king regions × 128 values</dd></div>
          <div><dt>model size</dt><dd>328,480 bytes</dd></div>
        </dl>
      </header>

      <div className="guide-layout">
        <nav aria-label="Guide sequence" className="guide-index">
          <div className="guide-index-desktop">
            <span className="guide-index-label">15 steps</span>
            <GuideStepList />
          </div>
          <details className="guide-index-mobile">
            <summary>
              <span className="guide-index-label">15 steps</span>
              <span className="guide-index-action is-closed">open steps</span>
              <span className="guide-index-action is-open">close steps</span>
            </summary>
            <GuideStepList />
          </details>
        </nav>

        <article className="guide-content">
          <GuideSection id="guide-budget" number="01" title="Measure your hardware limits">
            <p>
              Start by writing down your CPU width, clock speed, flash, internal RAM,
              external RAM, model storage, search memory, stack size, and connection to
              the host computer. An NNUE is a neural network built so a chess engine can
              update its inputs cheaply after every move. Its weights must fit in flash
              and its working values must fit in RAM while the engine is searching.
            </p>
            <p>
              This build uses a Waveshare ESP32 P4 Module DEV KIT with an ESP32 P4NRW32
              module, 32 MB PSRAM, and 16 MB flash. The network limit was 512 KiB. The
              selected model is 328,480 bytes, with 256 KiB reserved for remembered search
              positions and a 32 KiB main task stack. Another board might have a native
              64 bit CPU, less flash, or no external RAM, so measure its limits first.
            </p>
            <CodeStudy
              code={`typedef uint64_t bitboard_t;
typedef uint32_t move_t;

_Static_assert(sizeof(bitboard_t) == 8, "bitboard size");
_Static_assert(sizeof(move_t) == 4, "move size");`}
              path="src/ch.h"
              title="Choose integer widths from the data"
            >
              <p>
                A bitboard is one 64 bit integer where each bit represents one square.
                That makes attacks and occupied squares easy to combine with AND, OR,
                XOR, and shifts. A move needs only 19 active bits in this format, so one
                32 bit integer can hold its source, destination, promotion, and flags.
              </p>
              <p>
                The ESP32 P4 has a 32 bit RISC V core. It can still run 64 bit bitboard
                code, but the compiler may turn one source operation into several 32 bit
                instructions. The 64 bit form stays direct, readable, and covered by the
                chess tests. If your chip handles 64 bit values
                poorly, benchmark two explicit 32 bit halves after you have a correct
                reference engine to compare against.
              </p>
            </CodeStudy>
            <figure className="hardware-figure">
              <img
                alt="Waveshare ESP32 P4 Module DEV KIT with the USB serial cable attached"
                decoding="async"
                height="1200"
                loading="lazy"
                src="/images/esp32-p4-module-dev-kit.jpg"
                width="1600"
              />
              <figcaption>
                Waveshare ESP32 P4 Module DEV KIT used for this project. Ishan
                Kumthekar photograph.
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "Waveshare documentation: ESP32 P4 Module DEV KIT", href: GUIDE_RESOURCES[3] },
              { label: "Project code: train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code: src/nnue_config.h", href: source("src/nnue_config.h") },
              { label: "Project code: esp/sdkconfig.defaults", href: source("esp/sdkconfig.defaults") },
              { label: "Project record: models/reference.json", href: source("models/reference.json") },
            ]} />
            <p className="guide-note">
              Two resources I used heavily while learning about chess engines and NNUE
              were the <a href={GUIDE_RESOURCES[0]}>Chess Programming Wiki</a> and
              {" "}<a href={GUIDE_RESOURCES[1]}>Code Monkey King</a>.
            </p>
          </GuideSection>

          <GuideSection id="guide-core" number="02" title="Build your chess engine in C">
            <p>
              The chess engine is the code that understands the board, generates legal
              moves, searches future positions, and chooses a move. The NNUE does not
              choose a move by itself. It gives the search a score for a position. The
              engine is portable C11, so the same chess code can be tested on a laptop
              and compiled for the ESP32 P4.
            </p>
            <CodeStudy
              code={`set(P4_SRC
    src/bitboard.c
    src/evaluate.c
    src/movegen.c
    src/nnue.c
    src/position.c
    src/search.c
    src/system.c
)

add_library(p4core STATIC \${P4_SRC})`}
              path="CMakeLists.txt"
              title="Compile the same chess code for your laptop and board"
            >
              <p>
                The rules, move generation, NNUE evaluation, and search files live in
                <code>src</code>. CMake compiles them into <code>p4core</code> on a laptop.
                The ESP IDF build points to those same files for the board, so both builds
                run the same chess implementation.
              </p>
              <p>
                UCI is the text protocol desktop chess programs use to talk to an engine.
                <code>src/uci.c</code> handles that on the laptop. UART is the serial byte
                connection used by the board. <code>esp/main/app.c</code> handles that
                connection. Both front ends call the chess functions declared in
                <code>src/ch.h</code>.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki: Board Representation", href: "https://www.chessprogramming.org/Board_Representation" },
              { label: "Project code: src/ch.h", href: source("src/ch.h") },
              { label: "Project build: CMakeLists.txt", href: source("CMakeLists.txt") },
              { label: "Project firmware build: esp/components/core/CMakeLists.txt", href: source("esp/components/core/CMakeLists.txt") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-state" number="03" title="Store your board and legal moves">
            <p>
              The position is stored in two useful forms. Twelve bitboards answer questions
              about whole sets such as every white knight. A 64 entry square array gives
              the exact piece on one square. Every move must update both forms or the
              position becomes inconsistent.
            </p>
            <CodeStudy
              code={`typedef struct {
    bitboard_t pieces[PIECE_COUNT];
    bitboard_t occupancy[3];
    uint64_t key;
    uint64_t history[POSITION_HISTORY_SIZE];
    int16_t accumulator[COLOR_COUNT][NNUE_HIDDEN_SIZE];
    uint8_t board[64];
    uint16_t halfmove_clock;
    uint16_t fullmove_number;
    uint16_t history_count;
    uint8_t king_bucket[COLOR_COUNT];
    uint8_t king_mirror[COLOR_COUNT];
    uint8_t side_to_move;
    uint8_t castling;
    uint8_t en_passant;
} position_t;`}
              path="src/ch.h"
              title="Store fast sets and direct square lookup together"
            >
              <p>
                <code>pieces</code> holds the piece bitboards. <code>occupancy</code>
                combines them for White, Black, and the whole board. <code>board</code>
                gives direct square lookup. Each operation uses the simpler form instead
                of rebuilding one from the other.
              </p>
              <p>
                A Zobrist hash is a compact fingerprint of the full position.
                <code>key</code> updates whenever a piece or rule state changes.
                <code>history</code> stores older fingerprints for repetition detection.
                The accumulators are the running NNUE hidden values for both sides. Keeping
                them in the position makes the next evaluation ready immediately.
              </p>
              <p>
                FEN is the text format used to describe a complete chess position. The
                clocks preserve its move counters and the fifty move rule.
                <code>history_count</code> marks how much repetition history is valid.
                <code>king_bucket</code> is the internal code name for the current king
                location group. <code>king_mirror</code> records whether that view is
                mirrored. The final fields preserve the side to move, castling rights,
                and en passant square.
              </p>
            </CodeStudy>
            <ReferenceFigure
              alt="Chessboard showing algebraic file and rank coordinates"
              caption={(
                <>
                  Algebraic square coordinates used by FEN, UCI moves, bitboards, and
                  the 64 entry square array. Diagram derived by Beao from work credited
                  on the {" "}<a href="https://commons.wikimedia.org/wiki/File:SCD_algebraic_notation.svg">source page</a>.
                  Unmodified and licensed {" "}<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY SA 3.0</a>.
                </>
              )}
              compact
              height={246}
              src="/images/reference/chess-coordinates.svg"
              width={242}
            />
            <CodeStudy
              code={`bits 0..5    source square
bits 6..11   destination square
bits 12..14  promotion selector
bits 15..18  capture en passant castle double pawn flags
bits 19..31  reserved

#define PACK_MOVE(from, to, promotion, flags) \\
    ((move_t)((from) | ((to) << 6) | ((promotion) << 12) | ((flags) << 15)))`}
              path="src/ch.h"
              title="Pack a complete move into 32 bits"
            >
              <p>
                There are 64 squares, so the source and destination each need six bits.
                Promotion uses three bits. Four flags record captures, en passant,
                castling, and a double pawn push. The engine can copy, compare, sort, and
                remember a complete move as one integer without allocating memory.
              </p>
            </CodeStudy>
            <p>
              Move generation starts with pseudo legal moves. Each piece follows its
              movement rules, but king safety has not been checked yet. The engine makes
              each candidate, rejects it if the king is attacked, and then undoes it. The
              undo record restores every field changed by that move.
            </p>
            <CodeStudy
              code={`remove_piece(position, from);
if (captured != NO_PIECE) remove_piece(position, capture_square);
place_piece(position, placed_piece, to);

position->side_to_move = (uint8_t)opponent;
position->key ^= zobrist_side;

int king_square = find_king_square(position, side);
if (king_square == NO_SQUARE ||
    square_is_attacked(position, king_square, opponent)) {
    undo_move(position, move, undo);
    return false;
}`}
              path="src/position.c"
              title="Make the move then reject an exposed king"
            >
              <p>
                <code>remove_piece</code> and <code>place_piece</code> update the square
                array, bitboards, occupancy, hash, and NNUE features together. The side
                to move changes only after the pieces are in their new places. The final
                attack check turns a candidate into a fully legal move.
              </p>
              <p>
                <code>undo_t</code> is the small receipt for that change. It saves the old
                hash, clocks, castling rights, en passant square, history count, pieces,
                and king view. Undo reverses the piece operations and copies those values
                back instead of rebuilding the whole position.
              </p>
            </CodeStudy>
            <Code>{`cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure`}</Code>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki: Bitboards", href: "https://www.chessprogramming.org/Bitboards" },
              { label: "Chess Programming Wiki: Move Generation", href: "https://www.chessprogramming.org/Move_Generation" },
              { label: "Chess Programming Wiki: Make Move", href: "https://www.chessprogramming.org/Make_Move" },
              { label: "Chess Programming Wiki: Unmake Move", href: "https://www.chessprogramming.org/Unmake_Move" },
              { label: "Chess Programming Wiki: Perft", href: "https://www.chessprogramming.org/Perft" },
              { label: "Chess Programming Wiki: Zobrist Hashing", href: "https://www.chessprogramming.org/Zobrist_Hashing" },
              { label: "Project code: src/bitboard.c", href: source("src/bitboard.c") },
              { label: "Project code: src/movegen.c", href: source("src/movegen.c") },
              { label: "Project code: src/position.c", href: source("src/position.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-search" number="04" title="Add search to your engine">
            <p>
              Search is the part that tries legal moves and replies until it reaches a
              chosen depth. Negamax always scores the position for the side
              about to move and negates the score after switching sides. Alpha beta
              avoids branches that cannot improve the result. Iterative deepening runs
              depth 1, then 2, then 3, so there is always a completed move available.
            </p>
            <CodeStudy
              code={`bool quiet = !(MOVE_FLAGS(move) & MOVE_CAPTURE) &&
             !MOVE_PROMOTION(move);
if (!legal_moves) {
    score = -principal_variation_search(
        context, position, depth - 1, -beta, -alpha, ply + 1);
} else {
    int reduction = depth >= 3 && legal_moves >= 4 && quiet &&
                    !in_check && !gives_check;
    score = -principal_variation_search(
        context, position, depth - 1 - reduction,
        -alpha - 1, -alpha, ply + 1);
    if (!context->stop && reduction && score > alpha) {
        score = -principal_variation_search(
            context, position, depth - 1,
            -alpha - 1, -alpha, ply + 1);
    }
    if (!context->stop && score > alpha && score < beta) {
        score = -principal_variation_search(
            context, position, depth - 1, -beta, -alpha, ply + 1);
    }
}`}
              path="src/search.c"
              title="Negamax and principal variation search"
            >
              <p>
                A ply is one move by one side. After a move, the other side owns the next
                ply, so the returned score changes sign. Alpha and beta are the best
                score limits already known by each side. They also change sign and swap
                places when the side changes.
              </p>
              <p>
                Principal variation search gives the first move the full score range.
                Later moves get a narrow test around the best score found so far. Most
                worse moves fail that test cheaply. A late quiet move can start one ply
                shallower. If it looks promising, the engine searches it again at full
                depth and then with the full score range when necessary.
              </p>
            </CodeStudy>
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
                alt="Alpha beta search tree with gray pruned branches"
                caption={(
                  <>
                    Alpha beta leaves gray branches unsearched after their result can
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
              Stopping immediately at depth zero can evaluate the middle of a capture
              sequence. Quiescence search continues captures and promotions until the
              position becomes tactically quiet. This prevents a hanging queen or an
              unfinished exchange from producing a misleading final score.
            </p>
            <CodeStudy
              code={`static int quiescence_search(search_context_t *context,
                             position_t *position,
                             int alpha,
                             int beta,
                             int ply) {
    count_node(context);
    if (context->stop) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(position);
    if (position_is_draw(position)) return 0;
    bool in_check = side_in_check(position, position->side_to_move);
    if (!in_check) {
        int score = evaluate(position);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }

    move_list_t list;
    bool tactical_only = !in_check;
    generate_moves(position, &list, tactical_only);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        select_next_move(context, position, &list, i, 0, ply);
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        ++legal_moves;
        int score =
            -quiescence_search(context, position, -beta, -alpha, ply + 1);
        undo_move(position, list.moves[i], &undo);
        if (context->stop) return 0;
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }
    if (in_check && !legal_moves) return -SCORE_MATE + ply;
    return alpha;
}`}
              path="src/search.c"
              title="Continue unstable positions at depth zero"
            >
              <p>
                Stand pat is the score before making another tactical move. It is safe only
                when the king is not in check. The search then tries captures and
                promotions. A checked king must generate every escape. If none is legal,
                the function returns the checkmate score.
              </p>
            </CodeStudy>
            <h3>What the search returns</h3>
            <p>
              The engine also remembers useful moves for ordering and extends a checked
              position by one ply. <code>search_position</code> returns the chosen move,
              its score, completed depth, number of positions searched, elapsed time,
              and principal variation. The principal variation is the best sequence of
              moves found during that search.
            </p>
            <CodeStudy
              code={`tt_entry_t *entry =
    &context->table->entries[key & (context->table->count - 1)];
if (entry->key != key) return SCORE_INFINITY;
*table_move = entry->move;
int score = entry->score;
if (score > SCORE_MATE - MAX_PLY) score -= ply;
else if (score < -SCORE_MATE + MAX_PLY) score += ply;
if (entry->depth < depth) return SCORE_INFINITY;
if (entry->flag == TT_EXACT) return score;
if (entry->flag == TT_LOWER_BOUND && score >= beta) return score;
if (entry->flag == TT_UPPER_BOUND && score <= alpha) return score;`}
              path="src/search.c"
              title="Reuse positions with the transposition table"
            >
              <p>
                A transposition table remembers positions already searched. The Zobrist
                fingerprint selects one 16 byte entry. The full fingerprint
                confirms that the entry belongs to this exact position. A deep enough
                result can save the entire repeated search. A shallower entry still gives
                the engine a promising move to try first.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki: Negamax", href: "https://www.chessprogramming.org/Negamax" },
              { label: "Chess Programming Wiki: Alpha Beta", href: "https://www.chessprogramming.org/Alpha-Beta" },
              { label: "Chess Programming Wiki: Iterative Deepening", href: "https://www.chessprogramming.org/Iterative_Deepening" },
              { label: "Chess Programming Wiki: Principal Variation Search", href: "https://www.chessprogramming.org/Principal_Variation_Search" },
              { label: "Chess Programming Wiki: Quiescence Search", href: "https://www.chessprogramming.org/Quiescence_Search" },
              { label: "Chess Programming Wiki: Horizon Effect", href: "https://www.chessprogramming.org/Horizon_Effect" },
              { label: "Chess Programming Wiki: Transposition Table", href: "https://www.chessprogramming.org/Transposition_Table" },
              { label: "Chess Programming Wiki: Move Ordering", href: "https://www.chessprogramming.org/Move_Ordering" },
              { label: "Chess Programming Wiki: Late Move Reductions", href: "https://www.chessprogramming.org/Late_Move_Reductions" },
              { label: "Project code: src/search.c", href: source("src/search.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-profile" number="05" title="Choose a NNUE that fits your hardware">
            <p>
              This NNUE groups mirrored king squares into four king regions. A king region
              is simply a set of nearby king locations that share one learned piece
              square table. The exact king region and the location of every non king
              piece select the active inputs. Each side has 128 running hidden values.
              Those values are called an accumulator because moves add and subtract from
              them instead of calculating the full network again.
            </p>
            <ReferenceFigure
              alt="Feed forward neural network with input hidden and output layers"
              caption={(
                <>
                  A general feed forward network showing inputs, hidden layers, and an
                  output. The project NNUE is smaller and activates only the feature
                  rows present on the chessboard. Diagram by Offnfopt from {" "}<a href="https://commons.wikimedia.org/wiki/File:Multi-Layer_Neural_Network-Vector.svg">Wikimedia Commons</a>, released to the public domain under {" "}<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>.
                </>
              )}
              height={305}
              src="/images/reference/neural-network-layers.svg"
              width={527}
            />
            <div className="table-wrap" tabIndex={0}>
              <table>
                <tbody>
                  <tr><th>perspectives</th><td>2</td></tr>
                  <tr><th>king location groups</th><td>4</td></tr>
                  <tr><th>features per king group</th><td>640</td></tr>
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
            <CodeStudy
              code={`@property
def model_bytes(self) -> int:
    return (
        MODEL_HEADER_SIZE
        + MODEL_OUTPUT_BIAS_SIZE
        + self.feature_count * self.hidden_width
        + 3 * self.hidden_width * 2
    )

PROFILES = (
    NnueProfile("4x128", 4, 128),
    NnueProfile("8x64", 8, 64),
    NnueProfile("8x96", 8, 96),
    NnueProfile("16x48", 16, 48),
)`}
              path="train/profiles.py"
              title="Calculate each model before training it"
            >
              <p>
                Each king location group contains 640 piece square features. A feature
                means one piece type, color relationship, and square. Every feature owns
                one signed 8 bit row with <code>hidden_width</code> values. These rows use
                most of the model file. The remaining bytes store the header, biases,
                and output weights.
              </p>
              <Code>{`model bytes = 32 + 6H + 640BH
32 + 6 × 128 + 640 × 4 × 128 = 328480`}</Code>
              <p>
                Hidden width is the number of learned values each active feature adds to
                the accumulator. A wider layer can learn more detail. More king location
                groups preserve more information about exactly where the king sits. Both
                choices consume flash. Four shapes below the 512 KiB limit were tested
                rather than assuming the largest one would play best.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Stockfish: NNUE technical documentation", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md" },
              { label: "Stockfish: official NNUE trainer", href: GUIDE_RESOURCES[2] },
              { label: "Chess Programming Wiki: NNUE", href: "https://www.chessprogramming.org/NNUE" },
              { label: "Project code: train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code: train/net.py", href: source("train/net.py") },
              { label: "Project code: src/nnue.c", href: source("src/nnue.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-features" number="06" title="Make Python and C create the same features">
            <p>
              A feature index is the number that identifies one active NNUE input. The
              same calculation runs in the Python training code and C inference code. The
              Black view flips the ranks. Kings on files e through h mirror the board.
              The mirrored king square selects one of four king location groups. Every
              other piece maps to one of ten piece and color classes.
            </p>
            <CodeStudy
              code={`def _feature_index_from_view(
    bucket: int,
    mirror: bool,
    piece: int,
    square: int,
    perspective: int,
) -> int | None:
    piece_type = piece % 6
    if piece_type == 5:
        return None
    normalized_square = _perspective_square(square, perspective, mirror)
    own_piece = (piece >= 6) == bool(perspective)
    piece_class = piece_type if own_piece else 5 + piece_type
    return bucket * FEATURES_PER_BUCKET + piece_class * 64 + normalized_square`}
              path="train/features.py"
              title="Create the sparse feature index"
            >
              <p>
                A perspective is one player&apos;s view of the board. Both perspectives are
                normalized so the friendly pieces always face the same direction.
                Mirroring lets symmetric king positions share one learned table. The king
                chooses the table but is not itself an input feature. Friendly pawns
                through queens use classes zero through four. Enemy pieces use classes
                five through nine. The final square completes the feature number.
              </p>
              <p>
                Sparse means storing only features that are actually present instead of
                thousands of zero inputs. <code>encode_position</code> builds the side to
                move list first and the opponent list second. Each list is padded to 30
                entries with a reserved zero row so PyTorch can combine many positions
                into one training batch.
              </p>
            </CodeStudy>
            <p>
              A normal move subtracts the old piece feature and adds the new one. One
              player&apos;s accumulator is rebuilt only when its king enters a different
              location group or changes the mirrored view. Tests compare every cheap
              update with a complete refresh after both make and undo.
            </p>
            <CodeStudy
              code={`void add_nnue_feature(position_t *position, int piece, int square) {
    if (!nnue_is_loaded() || piece_type(piece) == KING) return;
    for (int perspective = 0; perspective < COLOR_COUNT; ++perspective) {
        int feature = feature_index_from_view(
            position->king_bucket[perspective],
            position->king_mirror[perspective] != 0,
            piece, square, perspective);
        add_vector(position->accumulator[perspective],
                   feature_vector(feature));
    }
}`}
              path="src/nnue.c"
              title="Update both accumulators after a piece change"
            >
              <p>
                Each non king piece produces one feature for each player&apos;s view. Adding
                the piece adds one signed 8 bit row to each signed 16 bit accumulator.
                Removing it subtracts those rows. When the king changes location group or
                mirror state, only that king&apos;s view is rebuilt from the current pieces.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Stockfish: NNUE feature transformation", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md#feature-transformer" },
              { label: "Project code: train/features.py", href: source("train/features.py") },
              { label: "Project code: src/nnue.c", href: source("src/nnue.c") },
              { label: "Project fixture: test/nnue_features.txt", href: source("test/nnue_features.txt") },
              { label: "Project tests: train/test_features.py", href: source("train/test_features.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-teacher" number="07" title="Create your Stockfish training labels">
            <p>
              The network needs a target score for every training position. This pipeline
              uses Stockfish as the teacher and stores each legal FEN with its evaluation in
              centipawns. One centipawn is one hundredth of a pawn. Positive always means
              the player about to move is better. The source and every setting needed to
              reproduce the data are recorded with it.
            </p>
            <h3>Try the pipeline with a small local file</h3>
            <p>
              A PGN stores complete played games. Sample positions from those games and
              ask Stockfish to inspect the same number of search positions for each one.
              Use this small path first because it catches broken labels before you spend
              hours preparing a large dataset.
            </p>
            <CodeStudy
              code={`def analyse_with_teacher(
    engine: chess.engine.SimpleEngine, board: chess.Board, nodes: int
) -> int:
    info = engine.analyse(board, chess.engine.Limit(nodes=nodes))
    if "score" not in info:
        raise ValueError("teacher returned no score")
    score = info["score"].pov(board.turn).score(mate_score=SCORE_LIMIT)
    if score is None:
        raise ValueError("teacher returned an empty score")
    return clip_score(score)`}
              path="train/label.py"
              title="Convert every teacher score to side to move"
            >
              <p>
                A node is one position visited by search. Fixing the node limit gives each
                sample the same Stockfish budget. <code>pov(board.turn)</code> changes the
                score to the player about to move. Very large values are clamped and mate
                scores are converted to the same bounded numeric range.
              </p>
              <p>
                Assign each whole game to training, validation, or test before taking
                positions from it. This prevents nearly identical positions from one game
                appearing on both sides of the final accuracy check.
              </p>
            </CodeStudy>
            <Code>{`python3 train/label.py \
  test/training_games.pgn /path/to/stockfish \
  build-guide/labels.jsonl \
  --nodes 100 --stride 1 --limit 1000 --min-ply 1 \
  --seed 0 --validation-percent 30 --test-percent 30`}</Code>
            <h3>Prepare enough data for the reference model</h3>
            <p>
              For the shipped model I used the CC0 Lichess Stockfish evaluation database.
              The importer scanned 47,836,886 records and kept 10,000,000 positions with
              evaluations at depth 20 or greater. That left 9,000,455 for training,
              500,453 for validation, and 499,092 for the final test.
            </p>
            <CodeStudy
              code={`depth, knodes, score_kind, white_score = _selected_evaluation(record)
score = white_score if board.turn == chess.WHITE else -white_score
return ImportedEvaluation(
    fen=board.fen(en_passant="fen"),
    score=clip_score(score),
    depth=depth,
    knodes=knodes,
    score_kind=score_kind,
    side_to_move="white" if board.turn == chess.WHITE else "black",
    piece_count=len(board.piece_map()),
)`}
              path="train/import_evals.py"
              title="Normalize the large evaluation database"
            >
              <p>
                The importer rejects invalid positions and chooses the deepest usable
                score. Lichess stores scores from White&apos;s view. The score is negated when
                Black moves next so every label uses the same convention. A fixed random
                seed makes the ten million selected positions reproducible.
              </p>
            </CodeStudy>
            <Code>{`python3 train/import_evals.py \
  https://database.lichess.org/lichess_db_eval.jsonl.zst \
  data/reference_labels.jsonl \
  --limit 10000000 --min-depth 20 \
  --selection-denominator 4 --seed 7 \
  --validation-percent 5 --test-percent 5 --workers 12`}</Code>
            <p className="guide-note">
              Lichess provides evaluation records without the original game membership.
              Accepted records are therefore split individually for this data source.
            </p>
            <ResourceLinks links={[
              { label: "Stockfish: official source", href: "https://github.com/official-stockfish/Stockfish" },
              { label: "Lichess: open evaluation database", href: "https://database.lichess.org/" },
              { label: "Project code: train/label.py", href: source("train/label.py") },
              { label: "Project code: train/import_evals.py", href: source("train/import_evals.py") },
              { label: "Project code: train/data.py", href: source("train/data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-shards" number="08" title="Prepare your training data">
            <p>
              Before training, convert every FEN into the two feature lists described in
              step 6 and one signed 16 bit score. Save groups of positions as compressed
              NPZ files. Each group is called a shard. This prevents Python from parsing
              millions of FEN strings again during every training pass.
            </p>
            <CodeStudy
              code={`def _new_buffer(shard_size: int) -> dict[str, Any]:
    return {
        "side": np.empty(
            (shard_size, MAX_ACTIVE_FEATURES), dtype=FEATURE_DTYPE
        ),
        "opponent": np.empty(
            (shard_size, MAX_ACTIVE_FEATURES), dtype=FEATURE_DTYPE
        ),
        "score": np.empty(shard_size, dtype=LABEL_DTYPE),
        "count": 0,
    }`}
              path="train/prep.py"
              title="Encode compact fixed shape training rows"
            >
              <p>
                One row has 30 feature indexes for the player about to move and 30 for the
                opponent. It also has one centipawn label. The FEN is parsed and its
                features are calculated once here. Training later reads numeric arrays directly.
              </p>
              <p>
                A manifest is a small record describing the dataset. This one stores the
                network shape, feature mapping version, numeric types, split sizes,
                teacher settings, and shard names. <code>load_shard</code> checks every
                shape and value range before training trusts the file.
              </p>
            </CodeStudy>
            <Code>{`python3 train/prep.py \
  data/reference_labels.jsonl data/reference_4x128 \
  --shard-size 250000 --profile 4x128`}</Code>
            <p>
              Create separate shards for each NNUE shape because the feature count can
              change. Keep the dimensions, split counts, attribution, and teacher
              settings beside them. Validate every shard before training.
            </p>
            <ResourceLinks links={[
              { label: "Project code: train/prep.py", href: source("train/prep.py") },
              { label: "Project code: train/data.py", href: source("train/data.py") },
              { label: "Project tests: train/test_data.py", href: source("train/test_data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-training" number="09" title="Train your NNUE">
            <p>
              Training adjusts the weights so the network prediction approaches the
              Stockfish label. The network adds the active feature rows for both player
              views and a learned bias, clips the values to the runtime range, and sends
              the combined 256 values through one output layer.
            </p>
            <CodeStudy
              code={`class NnueNetwork(torch.nn.Module):
    def forward(
        self, side_features: torch.Tensor, opponent_features: torch.Tensor
    ) -> torch.Tensor:
        side = self.feature_transformer(side_features).sum(1) + self.feature_bias
        opponent = (
            self.feature_transformer(opponent_features).sum(1) + self.feature_bias
        )
        clip = ACTIVATION_CLIP / FEATURE_QUANTIZATION
        side = torch.clamp(side, 0.0, clip)
        opponent = torch.clamp(opponent, 0.0, clip)
        return self.output(torch.cat((side, opponent), 1)).squeeze(1)`}
              path="train/net.py"
              title="Train the same accumulator shape used by C"
            >
              <p>
                The embedding table stores one learned row for every possible feature.
                Looking up the active indexes selects only rows present on the board. Those
                rows and one learned bias produce each 128 value accumulator.
                The padding index points to zeros and changes nothing.
              </p>
              <p>
                Clipping limits every value from zero through 127 just like the C runtime.
                The player about to move comes first and the opponent second. The output
                layer turns those 256 values into one centipawn prediction.
              </p>
            </CodeStudy>
            <Code>{`python3 train/train.py \
  data/reference_4x128 model_4x128_seed7.pt \
  --epochs 12 --batch 4096 --lr 0.001 --seed 7 \
  --score-scale 400 --device auto --workers 0 \
  --weight-decay 0.01`}</Code>
            <p>
              AdamW updates the weights and smooth L1 loss measures prediction
              error. An epoch is one full pass through the training data. After each epoch
              the weights are clamped to values the integer model can represent. Keep the
              checkpoint with the lowest validation error and leave the test split alone
              until the model is chosen.
            </p>
            <CodeStudy
              code={`prediction = network(side, opponent)
loss = transformed_loss(prediction, target, score_scale)
optimizer.zero_grad(set_to_none=True)
loss.backward()
optimizer.step()

epoch_constraints = constrain_quantized_parameters(network)
validation = evaluate_shards(
    network, shard_paths["validation"], batch_size, score_scale, device
)
is_best = (
    best_validation is None
    or validation["loss"] < best_validation["loss"]
)`}
              path="train/train.py"
              title="Select checkpoints with validation data"
            >
              <p>
                A batch is the group of positions processed in one update. AdamW changes
                the weights after each batch. At the end of the epoch every value is forced
                into the exportable range. Validation uses positions that did not update
                the weights, so a lower validation error is meaningful. The test data
                remains outside this selection loop.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "PyTorch: AdamW", href: "https://docs.pytorch.org/docs/stable/generated/torch.optim.AdamW.html" },
              { label: "PyTorch: Smooth L1 loss", href: "https://docs.pytorch.org/docs/stable/generated/torch.nn.SmoothL1Loss.html" },
              { label: "Project code: train/net.py", href: source("train/net.py") },
              { label: "Project code: train/train.py", href: source("train/train.py") },
              { label: "Project code: train/evaluate.py", href: source("train/evaluate.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-export" number="10" title="Export your NNUE for C">
            <p>
              PyTorch checkpoints are not a useful firmware format. Export one small
              binary file in the exact order the C loader expects: header, output bias,
              feature bias, output weights, and feature weights. The exporter rejects
              wrong dimensions, invalid numbers, and values that do not fit.
            </p>
            <CodeStudy
              code={`def build_model_blob(
    quantized: dict[str, Any],
    profile: NnueProfile = DEFAULT_PROFILE,
) -> bytes:
    header = struct.pack(
        "<8s8HI",
        MAGIC,
        MODEL_FORMAT_VERSION,
        profile.bucket_count,
        FEATURES_PER_BUCKET,
        profile.hidden_width,
        ACTIVATION_CLIP,
        FEATURE_QUANTIZATION,
        OUTPUT_QUANTIZATION,
        PERSPECTIVE_COUNT,
        profile.model_bytes,
    )
    if len(header) != HEADER_SIZE:
        raise RuntimeError("bad model header size")
    blob = (
        header
        + struct.pack("<i", quantized["output_bias"])
        + quantized["feature_bias"].astype("<i2", copy=False).tobytes()
        + quantized["output_weights"].astype("<i2", copy=False).tobytes()
        + quantized["feature_weights"].tobytes()
    )
    if len(blob) != profile.model_bytes:
        raise RuntimeError("bad model size")
    return blob`}
              path="train/export.py"
              title="Write one fixed little endian model layout"
            >
              <p>
                The header identifies the file and records its version, king location
                group count, features per group, hidden width, clipping limit, numeric
                scales, player views, and final size. Feature weights become signed 8 bit
                values. Biases and output weights use signed 16 bit values. The final
                output bias uses signed 32 bit storage.
              </p>
              <p>
                Quantization means converting trained decimal weights into fixed integers.
                This model uses fixed scales of 64 and stops if rounding would overflow an integer.
                The C loader checks the same dimensions, offsets, byte order, file size,
                alignment, and safe bias range before using any weight pointer.
              </p>
            </CodeStudy>
            <Code>{`python3 train/evaluate.py \
  data/reference_4x128 model_4x128_seed7.pt

python3 train/export.py \
  model_4x128_seed7.pt model_4x128_seed7.nnue

python3 train/compare.py \
  model_4x128_seed7.nnue data/reference_labels.jsonl \
  build/p4eval --limit 1000 --split test`}</Code>
            <p>
              Run the same positions through Python integer inference and the C runtime,
              then require exactly equal scores. The selected model matched all 1,000
              comparison positions.
            </p>
            <CodeStudy
              code={`python_scores = [evaluate_integer(model, fen) for fen in fens]
process = subprocess.run(
    [str(eval_tool), str(model_path)],
    input="\\n".join(fens) + "\\n",
    check=True,
    capture_output=True,
    text=True,
)
c_scores = [int(line) for line in process.stdout.splitlines()]
for index, (python_score, c_score) in enumerate(
    zip(python_scores, c_scores, strict=True)
):
    if python_score != c_score:
        raise ValueError(
            f"integer mismatch at position {index} "
            f"python {python_score} c {c_score}"
        )`}
              path="train/compare.py"
              title="Require bit exact Python and C scores"
            >
              <p>
                Python reads the exported bytes and repeats the exact integer accumulator,
                clipping, multiplication, and division used by C. Send the identical FEN
                list to the C tool. One unequal score fails the comparison and points to a
                layout, perspective, rounding, or feature mapping bug.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Project code: train/export.py", href: source("train/export.py") },
              { label: "Project code: train/integer.py", href: source("train/integer.py") },
              { label: "Project code: train/compare.py", href: source("train/compare.py") },
              { label: "Project code: src/nnue.c", href: source("src/nnue.c") },
              { label: "Project model record: models/reference.json", href: source("models/reference.json") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-selection" number="11" title="Test your NNUE choices">
            <p>
              A larger network is useful only if it plays better enough to justify its
              flash and inference cost. Train every candidate with the same data,
              optimizer, batch size, learning rate, epoch count, and random seed. Then
              compare validation error and play paired games from identical openings.
            </p>
            <CodeStudy
              code={`for item in opening_suite[:opening_count]:
    opening_name = item["name"]
    opening = item["fen"]
    for engine_a_white in (True, False):
        white = engine_a if engine_a_white else engine_b
        black = engine_b if engine_a_white else engine_a
        winner, termination, plies = play_game(
            white, black, opening, depth, max_plies
        )`}
              path="train/arena.py"
              title="Play every opening with both color assignments"
            >
              <p>
                Paired games give each candidate the same opening once as White and once
                as Black. This reduces color and opening bias. The arena sends the full FEN
                to each engine and checks every returned move with the Python chess
                library before applying it.
              </p>
              <p>
                The Elo estimate describes only the difference between the two engines in
                this match. Its uncertainty comes from the wins, draws, and losses. It is
                not a human playing strength estimate.
              </p>
            </CodeStudy>
            <Code>{`python3 train/arena.py \
  build-4x128/p4nnue model_4x128_seed7.nnue \
  build-8x96/p4nnue model_8x96_seed7.nnue \
  --depth 5 --max-plies 120 \
  --openings test/openings.json --opening-count 128 \
  --estimate-elo`}</Code>
            <p>
              The test covered shapes 4x128, 8x64, 8x96, and 16x48. The first number is the king
              location group count. The second is the hidden width. The 4x128 and 8x96
              networks were indistinguishable in validation and games. The 4x128 model
              is 163,648 bytes smaller, so it became the reference.
            </p>
            <p className="guide-note">
              These matches compare only the tested engines. They do not establish an
              absolute human Elo. Measure speed again on your actual board because a
              model that is efficient on the ESP32 P4 may behave differently on your CPU.
            </p>
            <ResourceLinks links={[
              { label: "Project results: profile comparison", href: source("results/profile_comparison.json") },
              { label: "Project results: reference model", href: source("results/reference.json") },
              { label: "Project code: train/arena.py", href: source("train/arena.py") },
              { label: "Project code: train/openings.py", href: source("train/openings.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-firmware" number="12" title="Build your ESP32 P4 firmware">
            <p>
              Firmware is the program that boots directly on your board. This one uses
              ESP IDF 6.0.2 for the <code>esp32p4</code> target. The reference NNUE
              stays in flash where the CPU can read it. A later upload goes into its own
              flash partition. Neither path wastes RAM by copying the full model.
            </p>
            <CodeStudy
              code={`set(reference_model "\${CMAKE_CURRENT_LIST_DIR}/../models/reference.nnue")
target_add_binary_data(
    \${PROJECT_NAME}.elf "\${reference_model}" BINARY
    RENAME_TO reference_nnue
)`}
              path="esp/CMakeLists.txt"
              title="Embed the reference model as binary data"
            >
              <p>
                ESP IDF places the original model bytes inside the application image.
                Linker symbols provide the start and end addresses. That memory range is
                passed directly to <code>bind_nnue</code>. The heap is general runtime RAM,
                so avoiding a full model copy leaves more of it for search.
              </p>
            </CodeStudy>
            <Code>{`. /home/ishan/esp-idf/export.sh
cd esp
idf.py set-target esp32p4
idf.py fullclean
idf.py build
idf.py size
idf.py merge-bin -o esp32p4_nnue_merged.bin`}</Code>
            <p>
              The firmware starts in <code>app_main</code>. At boot it initializes
              the chess tables, connects the NNUE weights, allocates 256 KiB for
              remembered search positions, installs the serial driver, and waits for
              commands. WiFi, Bluetooth, display code, a filesystem, and a web server are
              left out because none of them helps the engine choose a move.
            </p>
            <CodeStudy
              code={`initialize_chess();
if (!model_storage_init(&context.model_storage,
                        reference_nnue_start, model_size)) return;
if (!resize_transposition_table_bytes(
        &context.table, FIRMWARE_TT_BYTES)) {
    model_storage_deinit(&context.model_storage);
    unload_nnue();
    return;
}
uart_port_t port;
if (!initialize_uart_transport(&port)) {
    free_transposition_table(&context.table);
    model_storage_deinit(&context.model_storage);
    unload_nnue();
    return;
}
if (!run_protocol_loop(&context, &port)) {
    ESP_LOGE(firmware_log_tag, "uart receive failed");
}`}
              path="esp/main/app.c"
              title="Start only the engine and serial transport"
            >
              <p>
                Startup first checks the dedicated flash area for a complete uploaded model.
                If it passes validation, the firmware reads it directly. Otherwise it uses
                the model built into the firmware. The search table is the main writable
                allocation. UART then waits for complete protocol messages.
              </p>
              <p>
                This build uses one CPU core and a 32 KiB task stack in
                <code>esp/sdkconfig.defaults</code>. Your board may need a different stack
                or memory placement, so inspect its linker size report instead of copying
                these numbers without checking.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Espressif: ESP IDF setup for ESP32 P4", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/linux-macos-setup-legacy.html" },
              { label: "Espressif: build and flash a project", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/start-project.html" },
              { label: "Espressif: ESP32 P4 UART API", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-reference/peripherals/uart.html" },
              { label: "Project firmware: esp/main/app.c", href: source("esp/main/app.c") },
              { label: "Project firmware: esp/main/model_storage.c", href: source("esp/main/model_storage.c") },
              { label: "Project firmware: esp/partitions.csv", href: source("esp/partitions.csv") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-hardware" number="13" title="Test your physical board">
            <p>
              On the Waveshare board, connect the cable to PWR USB TO UART. Another board
              may use a different label. Flash one known firmware image and close every
              serial monitor before using the client because only one program can own the port.
            </p>
            <Code>{`cd /home/ishan/esp32p4-nnue/esp
idf.py -p PORT flash

cd /home/ishan/esp32p4-nnue
python3 esp/board_client.py --port /dev/ttyACM0 info
python3 esp/board_client.py --port /dev/ttyACM0 bench
python3 esp/board_client.py --port /dev/ttyACM0 search \
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --depth 5`}</Code>
            <CodeStudy
              code={`def request(self, command, payload=b"", timeout=None):
    frame = encode_frame(command, payload)
    written = 0
    while written < len(frame):
        written += os.write(self.fd, frame[written:])
    deadline = time.monotonic() + (self.timeout if timeout is None else timeout)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("board response timed out")
        readable, _, _ = select.select([self.fd], [], [], remaining)
        if not readable:
            raise TimeoutError("board response timed out")
        data = os.read(self.fd, 4096)
        for response_command, response_payload in self.decoder.feed(data):
            if response_command == COMMAND_ERROR:
                self._raise_board_error(response_payload)
            expected = command | 0x80
            if response_command != expected:
                raise ProtocolError(
                    f"expected response 0x{expected:02x} got 0x{response_command:02x}"
                )
            return response_payload`}
              path="esp/board_client.py"
              title="Test the binary protocol without the website"
            >
              <p>
                Raw mode gives the client the serial bytes without terminal text handling.
                The client opens one explicit device path, writes a complete request, and
                feeds every returned chunk into the protocol decoder. A deadline stops a
                disconnected board from waiting forever. The response identifier must match
                the request.
              </p>
              <p>
                Run <code>info</code> first. It reports the firmware, NNUE shape, model
                checksum, and search table size. A checksum is a number used to detect
                changed bytes. Then run <code>bench</code> for a repeatable start position
                search and <code>search</code> with a FEN to confirm a legal move returns.
              </p>
            </CodeStudy>
            <figure className="hardware-figure">
              <img
                alt="ESP32 P4 development board connected beside a laptop during the first physical test"
                decoding="async"
                height="1350"
                loading="lazy"
                src="/images/esp32-p4-test-setup.jpg"
                width="1800"
              />
              <figcaption>
                First physical ESP32 P4 test setup. Ishan Kumthekar photograph.
              </figcaption>
            </figure>
            <div className="hardware-status">
              <p>
                The host chess core is verified and every tested Python and C integer score
                matches. The firmware builds for ESP32 P4 and the board completed its first
                physical boot.
              </p>
              <p>
                You should still measure search speed, power draw, free memory, and
                temperature on your own board. Host benchmarks do not answer those
                physical questions.
              </p>
            </div>
          </GuideSection>

          <GuideSection id="guide-browser" number="14" title="Connect your browser to your board">
            <p>
              Web Serial is the browser feature that lets a page talk directly to a USB
              serial device after you grant permission. This site uses it instead of an
              HTTP server on the board.
            </p>
            <p>
              It works on localhost or an HTTPS site such as
              <code>nnue.ishankumthekar.com</code>. Your board remains plugged into your
              computer. Positions and moves travel between that browser tab and USB. The
              hosting server never receives your chess position or controls the board.
            </p>
            <p>
              Use Chrome or Edge on a desktop computer. Press connect and choose your
              board in the browser permission window. Close terminal programs and serial
              monitors first so the browser can open the port.
            </p>
            <p>
              Baud rate is the serial signaling speed. The port opens at 115200 baud
              with eight data bits, one stop bit, no parity, and no flow control. Before
              every search the browser sends a complete FEN. The engine searches with
              NNUE inference and returns a UCI move. The browser confirms that move is
              legal before changing the board.
            </p>
            <CodeStudy
              code={`const frame = new Uint8Array(HEADER_SIZE + payload.byteLength + CRC_SIZE);
const view = dataView(frame);
frame[0] = MAGIC_FIRST;
frame[1] = MAGIC_SECOND;
frame[2] = version;
frame[3] = command;
view.setUint16(4, payload.byteLength, true);
frame.set(payload, HEADER_SIZE);
const checksumOffset = HEADER_SIZE + payload.byteLength;
view.setUint32(
  checksumOffset,
  crc32(frame.subarray(2, checksumOffset)),
  true,
);`}
              path="web/src/protocol.ts"
              title="Encode the same frame in TypeScript and C"
            >
              <p>
                A frame is one complete serial message. This one starts with the ASCII marker
                <code>P4</code>, then protocol version and command. A 16 bit length tells
                the receiver where the payload ends. CRC32 is a checksum over the message
                body, so damaged frames are rejected before command code reads them.
              </p>
              <p>
                USB can split one message across several reads. <code>FrameDecoder</code>
                keeps incomplete bytes, skips boot text, waits for the declared length,
                checks the checksum and version, and then returns one complete frame.
              </p>
            </CodeStudy>
            <CodeStudy
              code={`const openTask = port.open({
  baudRate: BAUD_RATE,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
});
await openTask;

const hello = await this.exchange(
  COMMAND.hello,
  new Uint8Array(),
  COMMAND_TIMEOUT_MS,
);
decodeHello(hello.payload);

const deviceResponse = await this.exchange(
  COMMAND.deviceInfo,
  new Uint8Array(),
  COMMAND_TIMEOUT_MS,
);`}
              path="web/src/device.ts"
              title="Open the selected port and verify the board"
            >
              <p>
                <code>requestPort</code> runs only after you press connect. The browser
                permission window gives this page access to the device you selected. The
                hello message confirms protocol version. Device info then checks the
                ESP32 P4 target, model format 3, four king location groups, hidden width
                128, model size, and active model state.
              </p>
              <p>
                <code>requestChipSearch</code> sends <code>game.fen()</code> before every
                search. It reads depth, time, positions searched, score, and move from the
                29 byte result. The returned text must match UCI move notation and
                <code>chess.js</code> must accept it before the board changes.
              </p>
            </CodeStudy>
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
                  <tr><th>go</th><td><code>0x21</code></td><td>budget type and u32</td><td>29 byte result</td></tr>
                  <tr><th>error</th><td><code>0xff</code></td><td>not a request</td><td>failed command and error code</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Every frame contains the P4 marker, version, command, payload length,
              payload, and checksum. A response sets bit seven on the request command so
              the reply can be matched to the request.
            </p>
            <figure className="hardware-figure">
              <img
                alt="A live browser chess game connected to the ESP32 P4 board"
                decoding="async"
                height="2160"
                loading="lazy"
                src="/images/esp32-p4-browser-game.jpg"
                width="2880"
              />
              <figcaption>
                ITS ACTUALLY PLAYING CHESS.
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "Web Incubator CG: Web Serial specification", href: GUIDE_RESOURCES[4] },
              { label: "Chrome for Developers: Web Serial", href: GUIDE_RESOURCES[5] },
              { label: "GitHub Pages: HTTPS deployment", href: GUIDE_RESOURCES[6] },
              { label: "Project browser: web/src/protocol.ts", href: source("web/src/protocol.ts") },
              { label: "Project browser: web/src/device.ts", href: source("web/src/device.ts") },
              { label: "Project browser: web/src/game.ts", href: source("web/src/game.ts") },
              { label: "Project tests: web/src/site.test.ts", href: source("web/src/site.test.ts") },
              { label: "Project firmware protocol: esp/protocol.h", href: source("esp/protocol.h") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-adapter" number="15" title="Use your own NNUE or microcontroller">
            <h3>Use your own weights on this board</h3>
            <p>
              If your network uses model format 3, four king location groups, width 128,
              and 328,480 bytes, you can embed it during the firmware build or upload it
              with <code>board_client.py</code>. The website needs no change because the
              shape and serial messages remain identical.
            </p>
            <Code>{`python3 esp/board_client.py \
  --port /dev/ttyACM0 upload path/to/model.nnue`}</Code>
            <CodeStudy
              code={`if (
  info.kingBuckets !== EXPECTED_KING_BUCKETS ||
  info.hiddenWidth !== EXPECTED_HIDDEN_WIDTH
) {
  throw new Error("Board NNUE architecture is incompatible");
}
if (
  info.activeModelBytes !== EXPECTED_MODEL_BYTES ||
  info.maximumModelBytes < EXPECTED_MODEL_BYTES
) {
  throw new Error("Board NNUE model size is incompatible");
}`}
              path="web/src/device.ts"
              title="Keep new weights inside the accepted format"
            >
              <p>
                The browser checks the shape reported by your board before starting a
                game. The upload client sends the byte count and checksum first, streams
                the file in ordered pieces, and then commits it. Firmware validates the
                completed header and numeric ranges before marking the model usable.
              </p>
              <p>
                If you change the number of king location groups or hidden values, you
                change the binary layout and the C array sizes. Rebuild the engine with
                matching dimensions and update the browser compatibility constants.
                Uploading a different number of bytes cannot change compiled C code.
              </p>
            </CodeStudy>
            <h3>Connect your own microcontroller</h3>
            <p>
              Your board only needs to implement the hello, device info, position, go,
              and error messages. It must accept a complete FEN and return a legal UCI
              move. Give it a target identifier in <code>esp/protocol.h</code>, allow that
              identifier in <code>web/src/device.ts</code>, and add a fake serial test.
            </p>
            <CodeStudy
              code={`export interface BoardTransport {
  readonly connected: boolean;
  connect(): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  setPosition(fen: string): Promise<void>;
  searchDepth(depth: number): Promise<SearchResult>;
}`}
              path="web/src/device.ts"
              title="Implement the small browser boundary"
            >
              <p>
                <code>BoardTransport</code> is the small boundary used by the chess page.
                The page needs connection state, a complete FEN setter, and fixed depth
                search. Your target can use any board representation, search, or neural
                network behind that boundary as long as it exposes compatible USB serial.
              </p>
              <p>
                Report an honest target identifier and model shape. Position must accept
                a full legal FEN. Go must return depth, time, positions searched, score,
                and a legal UCI move. Reuse the protocol fixtures and fake Web Serial test
                to check exact bytes, partial reads, damaged messages, command order,
                legal moves, and disconnects.
              </p>
            </CodeStudy>
            <p>
              The browser does not care how your search or NNUE works internally. It can
              connect to any engine that implements this serial boundary and returns a
              legal UCI move.
            </p>
            <ResourceLinks links={[
              { label: "Project protocol: esp/protocol.h", href: source("esp/protocol.h") },
              { label: "Project protocol: esp/protocol.c", href: source("esp/protocol.c") },
              { label: "Project host client: esp/board_client.py", href: source("esp/board_client.py") },
              { label: "Project browser checks: web/src/device.ts", href: source("web/src/device.ts") },
              { label: "Project browser tests: web/src/site.test.ts", href: source("web/src/site.test.ts") },
            ]} />
          </GuideSection>

        </article>
      </div>
    </main>
  );
}
