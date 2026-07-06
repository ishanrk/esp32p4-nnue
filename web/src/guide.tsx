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
            <CodeStudy
              code={`typedef uint64_t bitboard_t;
typedef uint32_t move_t;

_Static_assert(sizeof(bitboard_t) == 8, "bitboard size");
_Static_assert(sizeof(move_t) == 4, "move size");`}
              path="src/ch.h"
              title="Choose integer widths from the data"
            >
              <p>
                A chessboard has 64 squares. One bit in <code>bitboard_t</code> maps
                directly to one square. A full board mask can therefore be combined
                with one AND, OR, XOR, or shift in the C source. The packed move needs
                only 19 active bits, so <code>uint32_t</code> leaves room for the complete
                move and keeps each move-list entry small.
              </p>
              <p>
                The ESP32-P4 uses a 32-bit RISC-V core. Its compiler can still implement
                <code>uint64_t</code>, but many operations become work on two 32-bit
                halves. An explicit pair of <code>uint32_t</code> values could make that
                cost visible and give more control over carries and shifts. It would also
                make every attack mask and bit scan more complicated. This repository
                keeps the direct 64-bit form until both representations can be measured
                on the physical board. No pair-of-halves result exists yet.
              </p>
            </CodeStudy>
            <figure className="hardware-figure">
              <img
                alt="Waveshare ESP32-P4-Module-DEV-KIT with the USB serial cable attached"
                decoding="async"
                height="1200"
                loading="lazy"
                src="/images/esp32-p4-module-dev-kit.jpg"
                width="1600"
              />
              <figcaption>
                Waveshare ESP32-P4-Module-DEV-KIT used for this project. Ishan
                Kumthekar photograph.
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "Waveshare documentation: ESP32-P4-Module-DEV-KIT", href: GUIDE_RESOURCES[4] },
              { label: "Project code: train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code: src/nnue_config.h", href: source("src/nnue_config.h") },
              { label: "Project code: esp/sdkconfig.defaults", href: source("esp/sdkconfig.defaults") },
              { label: "Project record: models/reference.json", href: source("models/reference.json") },
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
              title="Keep one shared engine core"
            >
              <p>
                The root build turns these files into the desktop <code>p4core</code>
                library. The ESP-IDF component lists the same source paths instead of
                keeping a firmware copy. A move that passes the host tests is therefore
                handled by the same implementation on the microcontroller.
              </p>
              <p>
                Platform code stays at the edge. <code>src/uci.c</code> reads desktop
                UCI commands. <code>esp/main/app.c</code> starts the board and reads UART
                frames. Both call the public functions declared in <code>src/ch.h</code>.
              </p>
            </CodeStudy>
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
              { label: "Chess Programming Wiki: Main Page", href: GUIDE_RESOURCES[0] },
              { label: "Chess Programming Wiki: Board Representation", href: "https://www.chessprogramming.org/Board_Representation" },
              { label: "Code Monkey King: BBC repository", href: GUIDE_RESOURCES[1] },
              { label: "Code Monkey King: bitboard video series", href: GUIDE_RESOURCES[2] },
              { label: "Project code: src/ch.h", href: source("src/ch.h") },
              { label: "Project build: CMakeLists.txt", href: source("CMakeLists.txt") },
              { label: "Project firmware build: esp/components/core/CMakeLists.txt", href: source("esp/components/core/CMakeLists.txt") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-state" number="03" title="Store the board and legal moves">
            <p>
              The engine stores twelve piece bitboards and three occupancy bitboards.
              It also stores one piece value for each of the 64 squares. Every move
              updates both representations.
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
              title="Store sets and direct square lookup together"
            >
              <p>
                <code>pieces</code> answers set questions such as every white knight or
                every occupied square. <code>board</code> answers the different question
                of which exact piece occupies one square. Search and move generation use
                both forms without rebuilding either one.
              </p>
              <p>
                <code>key</code> is the incremental Zobrist hash. <code>history</code>
                records earlier hashes for repetition detection. The accumulators hold
                both NNUE perspectives inside the position so make and undo can keep the
                evaluation ready for the next search node.
              </p>
              <p>
                The move clocks preserve FEN state and the fifty-move rule.
                <code>history_count</code> bounds the valid repetition history. The king
                bucket and mirror arrays cache the active NNUE view for each side. The
                remaining bytes record the side to move and the two reversible move
                rights needed by castling and en passant.
              </p>
            </CodeStudy>
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
                Source and destination squares each need six bits. Promotion needs three
                bits. Four flag bits distinguish captures, en passant, castling, and a
                double pawn push. Search can copy, compare, sort, and store a move as one
                integer without heap allocation.
              </p>
            </CodeStudy>
            <p>
              Generate pseudo-legal moves. Make one move. Reject it when it leaves
              the moving side&apos;s king in check. Undo it. The undo record restores
              captured pieces, castling rights, en passant, clocks, the Zobrist hash,
              and NNUE accumulator state.
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
                array, piece bitboards, occupancy, hash, and NNUE features as one state
                transition. The side changes only after the pieces move. The final king
                attack test turns a pseudo-legal generated move into a legal move.
              </p>
              <p>
                <code>undo_t</code> saves the old hash, clocks, castling rights, en
                passant square, history count, moved piece, captured piece, and king
                view. Undo reverses the piece operations and restores those values. The
                search never rebuilds the complete position after every child.
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

          <GuideSection id="guide-search" number="04" title="Add the chess search">
            <p>
              Use one score from the side to move. Search each child with the sign
              reversed. Alpha-beta stops branches that cannot change the result.
              Iterative deepening completes depth 1, then 2, then 3, so the engine
              always has a finished answer.
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
                Every returned score belongs to the side that is about to move. Making
                a move changes that side, so the recursive result is negated. The bounds
                also change sign and exchange places. This is the negamax form of
                alpha-beta.
              </p>
              <p>
                The first legal move receives the full search window. Later moves first
                receive the narrow window from <code>-alpha - 1</code> through
                <code>-alpha</code>. Most inferior moves fail inside that narrow window
                with less work. A late quiet move can first use one less ply. A reduced
                result above alpha repeats the narrow search at full depth. A full-depth
                result between alpha and beta then receives the complete window.
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
                A quiet position can use its static score as a lower bound called stand
                pat. The search then considers captures and promotions. A checked king
                cannot stand pat, so <code>tactical_only</code> becomes false and every
                evasion is generated. Checkmate is returned when none of those moves is
                legal.
              </p>
            </CodeStudy>
            <h3>The current search result</h3>
            <p>
              The engine also uses principal variation search, a fixed transposition
              table, killer moves, history ordering, one check extension, and late
              move reduction. <code>search_position</code> returns the best move,
              score, completed depth, node count, elapsed time, and principal variation.
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
                The table count is a power of two. Masking the Zobrist key selects one
                16-byte entry without division. The full 64-bit key confirms that the
                slot belongs to this position. An exact score can return immediately.
                Lower and upper bounds return only when they already prove the current
                alpha-beta result. The stored move still helps move ordering when the
                stored depth is too shallow for a score cutoff.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Chess Programming Wiki: Negamax", href: "https://www.chessprogramming.org/Negamax" },
              { label: "Chess Programming Wiki: Alpha-Beta", href: "https://www.chessprogramming.org/Alpha-Beta" },
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
                Each bucket contains 640 piece-square features. Every feature owns one
                signed 8-bit row with <code>hidden_width</code> values. This transformer
                dominates the file size. The remaining bytes hold the header, output
                bias, feature bias, and two sets of signed 16-bit output weights.
              </p>
              <Code>{`model bytes = 32 + 6H + 640BH
32 + 6 × 128 + 640 × 4 × 128 = 328480`}</Code>
              <p>
                A wider hidden layer gives every active feature more learned values. More
                king buckets preserve more king location detail. Both consume flash in
                the product <code>640BH</code>. The four listed profiles stay below the
                project&apos;s 512 KiB ceiling and make that tradeoff measurable.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Stockfish: NNUE technical documentation", href: "https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md" },
              { label: "Stockfish: official nnue-pytorch trainer", href: GUIDE_RESOURCES[3] },
              { label: "Chess Programming Wiki: NNUE", href: "https://www.chessprogramming.org/NNUE" },
              { label: "Project code: train/profiles.py", href: source("train/profiles.py") },
              { label: "Project code: train/net.py", href: source("train/net.py") },
              { label: "Project code: src/nnue.c", href: source("src/nnue.c") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-features" number="06" title="Match the Python and C features">
            <p>
              Implement the same feature index in Python and C. The Black view flips
              ranks. Kings on files e through h mirror the board. The king file selects
              a bucket. Non-king pieces map to ten piece classes.
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
                Perspective normalization makes the friendly side face the same
                direction in both accumulators. Horizontal mirroring lets symmetric king
                positions share a bucket. Kings provide the view and are not input
                features. Friendly pawns through queens use classes zero through four.
                Opposing pawns through queens use classes five through nine. The final
                square selects one value inside that piece class.
              </p>
              <p>
                <code>encode_position</code> builds the side-to-move list first and the
                opponent list second. Each list is padded to 30 entries with a reserved
                index whose embedding row remains zero. Fixed shapes let PyTorch batch
                positions without changing the sparse meaning.
              </p>
            </CodeStudy>
            <p>
              A normal move subtracts old feature vectors and adds new ones. Rebuild
              one perspective only when a king changes its bucket or mirror. Compare
              every incremental result with a full refresh after make and undo.
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
                A non-king piece appears once in each perspective with a different
                feature index. Adding that piece adds one signed 8-bit row to each signed
                16-bit accumulator. Removal subtracts the same rows. A king contributes
                no row. When a king changes bucket or mirror state, only that king&apos;s
                perspective is rebuilt from the feature bias and current pieces.
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
                A fixed node limit gives every sampled position the same teacher budget.
                <code>pov(board.turn)</code> converts the result to the player about to
                move. Positive labels therefore always favor that player. Mate scores
                become the bounded score limit and every output is clamped before it is
                written.
              </p>
              <p>
                The PGN path assigns an entire game to one split before sampling its
                positions. Related positions from one game cannot leak across training,
                validation, and test data.
              </p>
            </CodeStudy>
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
                The importer validates each FEN and selects the deepest usable evaluation
                record. Lichess stores the score from White&apos;s point of view. Negating
                Black-to-move records converts it to the same side-to-move convention as
                the PGN teacher path. Seeded filtering makes the ten-million-position
                selection reproducible.
              </p>
            </CodeStudy>
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
              { label: "Stockfish: official source", href: "https://github.com/official-stockfish/Stockfish" },
              { label: "Lichess: open evaluation database", href: "https://database.lichess.org/" },
              { label: "Project code: train/label.py", href: source("train/label.py") },
              { label: "Project code: train/import_evals.py", href: source("train/import_evals.py") },
              { label: "Project code: train/data.py", href: source("train/data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-shards" number="08" title="Prepare the training data">
            <p>
              Convert every FEN into two fixed lists of active feature indexes and one
              int16 centipawn label. Save the data in compressed NPZ shards so training
              does not parse FEN during every epoch.
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
              title="Encode compact fixed-shape training rows"
            >
              <p>
                Each row contains 30 unsigned 16-bit indexes for the side-to-move view
                and 30 for the opposing view. The label is one signed 16-bit centipawn
                value. FEN parsing and feature mapping happen once during preparation.
                Training later reads ready-to-batch numeric arrays.
              </p>
              <p>
                Full buffers are written with <code>np.savez_compressed</code>. The
                manifest records the exact profile, mapping version, dtypes, split counts,
                teacher metadata, and shard names. <code>load_shard</code> rejects wrong
                shapes, dtypes, feature ranges, and score ranges before training uses a
                file.
              </p>
            </CodeStudy>
            <Code>{`python3 train/prep.py \
  data/reference_labels.jsonl data/reference_4x128 \
  --shard-size 250000 --profile 4x128`}</Code>
            <p>
              Create separate shards for each NNUE size. Store dimensions, split
              counts, attribution, and teacher settings in the manifest. Validate
              every shard before training.
            </p>
            <ResourceLinks links={[
              { label: "Project code: train/prep.py", href: source("train/prep.py") },
              { label: "Project code: train/data.py", href: source("train/data.py") },
              { label: "Project tests: train/test_data.py", href: source("train/test_data.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-training" number="09" title="Train the NNUE">
            <p>
              Sum the sparse feature rows for both perspectives. Add the feature bias,
              clip the values, place the side-to-move accumulator first, and send the
              256 values through the output layer.
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
                The embedding table is the feature transformer. Looking up the active
                indexes selects only the rows present in the position. Summing those rows
                and adding one shared bias produces each 128-value accumulator. The
                padding index owns a zero row and has no effect on the sum.
              </p>
              <p>
                Values are clipped to the floating-point equivalent of the runtime range
                from zero through 127. The side-to-move accumulator comes first. The
                opposing accumulator comes second. One linear output produces the
                centipawn prediction used by the loss.
              </p>
            </CodeStudy>
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
                AdamW updates parameters from each batch. The parameter constraint runs
                once the epoch is complete so every saved checkpoint remains representable
                by the integer file format. Validation then measures positions that did
                not update the weights. Only a lower validation loss replaces the saved
                checkpoint. The final test split stays outside this selection loop.
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

          <GuideSection id="guide-export" number="10" title="Export the NNUE for C">
            <p>
              Write the model in the exact order read by the C loader: header, output
              bias, feature bias, output weights, and feature weights. Reject wrong
              dimensions, nonfinite values, unsafe accumulator bias, and saturation.
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
              title="Write one fixed little-endian model layout"
            >
              <p>
                The header records magic, format version, bucket count, features per
                bucket, hidden width, activation clip, both quantization scales,
                perspective count, and final byte size. Feature weights become signed
                8-bit values. Biases and output weights use the explicit little-endian
                signed 16-bit form. The output bias uses signed 32-bit storage.
              </p>
              <p>
                Quantization rounds with fixed scales of 64. Export stops when a value is
                nonfinite or would saturate its integer type. The C loader checks the same
                dimensions, offsets, file size, alignment, endianness, and safe bias range
                before it exposes pointers to the weights.
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
              Run the same positions through the Python integer implementation and
              the C runtime. Require exact scores. The selected model matched on all
              1,000 comparison positions.
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
              title="Require bit-exact Python and C scores"
            >
              <p>
                Python first reads the exported bytes and evaluates with the same integer
                accumulator, clipping, output products, and truncating division as C. The
                C evaluation tool receives the identical FEN list in one process. A single
                unequal score fails the comparison. This catches layout, perspective,
                rounding, and feature-index differences before firmware uses the model.
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

          <GuideSection id="guide-selection" number="11" title="Test the NNUE sizes">
            <p>
              Train every NNUE size with the same data, optimizer, batch size,
              learning rate, epoch count, and seed. Compare validation loss across
              repeated seeds. Play paired games with the same openings and reversed
              colors.
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
                Each candidate receives the same position once as White and once as
                Black. This reduces color and opening bias. The arena sends full FENs to
                each UCI engine and verifies every returned move with
                <code>python-chess</code> before adding it to the game.
              </p>
              <p>
                The Elo estimate describes only the two engines in that match. Its 95
                percent uncertainty comes from the observed win, draw, and loss scores.
                It is not an estimate of human playing strength.
              </p>
            </CodeStudy>
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
              { label: "Project results: profile comparison", href: source("results/profile_comparison.json") },
              { label: "Project results: reference model", href: source("results/reference.json") },
              { label: "Project code: train/arena.py", href: source("train/arena.py") },
              { label: "Project code: train/openings.py", href: source("train/openings.py") },
            ]} />
          </GuideSection>

          <GuideSection id="guide-firmware" number="12" title="Build the ESP32 P4 firmware">
            <p>
              Build with ESP-IDF 6.0.2 for the <code>esp32p4</code> target. The build
              embeds <code>models/reference.nnue</code> in mapped read-only flash. An
              uploaded model uses the dedicated NNUE partition. Neither path copies
              the full model to the heap.
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
                ESP-IDF places the original model bytes in the application image. Linker
                symbols expose the first byte and the byte after the model. Firmware
                passes that address and size to <code>bind_nnue</code>. It does not create
                a generated C array and does not copy the 328480-byte model into heap RAM.
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
              At boot, <code>app_main</code> initializes chess tables, binds the model,
              allocates the 256 KiB transposition table, installs UART, and starts the
              binary command loop. The firmware contains no Wi-Fi, Bluetooth, display,
              filesystem, or web server.
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
                Model storage first looks for a committed upload in the dedicated flash
                partition. A valid uploaded model is memory mapped and bound directly.
                Otherwise the embedded model becomes active. The transposition table is
                the large writable allocation. UART is then installed and the firmware
                waits for framed commands.
              </p>
              <p>
                The single-core setting and 32 KiB task stack come from
                <code>esp/sdkconfig.defaults</code>. The firmware adds no network stack,
                display loop, filesystem, or service that competes with search memory.
              </p>
            </CodeStudy>
            <ResourceLinks links={[
              { label: "Espressif: ESP-IDF setup for ESP32-P4", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/linux-macos-setup-legacy.html" },
              { label: "Espressif: build and flash a project", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/start-project.html" },
              { label: "Espressif: ESP32-P4 UART API", href: "https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-reference/peripherals/uart.html" },
              { label: "Project firmware: esp/main/app.c", href: source("esp/main/app.c") },
              { label: "Project firmware: esp/main/model_storage.c", href: source("esp/main/model_storage.c") },
              { label: "Project firmware: esp/partitions.csv", href: source("esp/partitions.csv") },
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
                The host client opens one explicit serial path in raw mode. It writes a
                complete request and feeds any returned byte chunks into the same framed
                protocol used by the browser. A deadline prevents a disconnected or
                stalled board from waiting forever. The response command must match the
                request with its high bit set.
              </p>
              <p>
                Run <code>info</code> first to verify firmware, model dimensions, model
                CRC, and transposition-table size. Run <code>bench</code> to exercise one
                fixed start-position search. Run <code>search</code> with an explicit FEN
                to verify position transfer and a returned legal move.
              </p>
            </CodeStudy>
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
                First physical ESP32-P4 test setup. Ishan Kumthekar photograph.
              </figcaption>
            </figure>
            <div className="hardware-status">
              <p>
                The host chess core is verified. Python and C integer scores match. The
                firmware builds for ESP32-P4 and the first physical boot was observed.
              </p>
              <p>
                The UART correction still needs a recorded reflash test. Physical search
                speed, power draw, memory headroom, and temperature remain unmeasured.
                Keep those results separate from the existing host benchmarks.
              </p>
            </div>
          </GuideSection>

          <GuideSection id="guide-browser" number="14" title="Connect the browser to the board">
            <p>
              The website does not use an HTTP API. It communicates with the
              microcontroller through Web Serial.
            </p>
            <p>
              The connection works from localhost and from an HTTPS deployment such
              as <code>nnue.ishankumthekar.com</code>. The ESP32-P4 remains connected
              to the visitor's computer. Serial bytes move directly between that
              browser tab and USB. The hosting server does not receive the position or
              control the board.
            </p>
            <p>
              Use a desktop Chromium browser with Web Serial support. Press the
              connect button and select the board in the browser permission prompt.
              Close terminal programs and serial monitors first so the browser can
              open the port.
            </p>
            <p>
              Open the port at 115200 baud with eight data bits, one stop bit, no
              parity, and no flow control. Send a complete FEN before every search.
              The firmware returns a UCI move. The browser checks that move against
              the legal moves before applying it.
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
                The first two bytes are the ASCII marker <code>P4</code>. The next bytes
                carry protocol version and command. A little-endian 16-bit length tells
                the receiver where the payload ends. CRC32 covers version, command,
                length, and payload so damaged frames are rejected before command code
                reads them.
              </p>
              <p>
                <code>FrameDecoder</code> keeps incomplete bytes between reads. It scans
                past boot text until it finds the marker, waits for the complete declared
                length, checks CRC and protocol version, then returns one decoded frame.
                UART and USB reads do not need to align with message boundaries.
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
                <code>requestPort</code> runs only after the visitor presses the connect
                control. The browser permission prompt gives this page access to the one
                selected device. The hello exchange confirms protocol version. Device
                info then confirms ESP32-P4 target, model format 3, four king buckets,
                hidden width 128, model size, and active model state.
              </p>
              <p>
                <code>requestChipSearch</code> sends <code>game.fen()</code> before every
                search. The result parser reads the fixed 29-byte payload. The returned
                text must match UCI syntax and <code>chess.js</code> must accept it as a
                legal move before the board changes.
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
            <figure className="hardware-figure">
              <img
                alt="Browser chess game connected to the ESP32-P4 development board over USB serial"
                decoding="async"
                height="1350"
                loading="lazy"
                src="/images/esp32-p4-browser-game.jpg"
                width="1800"
              />
              <figcaption>
                Completed local browser game with the ESP32-P4 connected over USB
                serial. Ishan Kumthekar photograph.
              </figcaption>
            </figure>
            <ResourceLinks links={[
              { label: "Web Incubator CG: Web Serial specification", href: GUIDE_RESOURCES[5] },
              { label: "Chrome for Developers: Web Serial", href: GUIDE_RESOURCES[6] },
              { label: "GitHub Pages: HTTPS deployment", href: GUIDE_RESOURCES[7] },
              { label: "Project browser: web/src/protocol.ts", href: source("web/src/protocol.ts") },
              { label: "Project browser: web/src/device.ts", href: source("web/src/device.ts") },
              { label: "Project browser: web/src/game.ts", href: source("web/src/game.ts") },
              { label: "Project tests: web/src/site.test.ts", href: source("web/src/site.test.ts") },
              { label: "Project firmware protocol: esp/protocol.h", href: source("esp/protocol.h") },
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
                A replacement network can use new learned weights with no website change
                when it remains model format 3 with four buckets, width 128, and 328480
                bytes. The upload client sends length and CRC first, streams ordered
                chunks, then commits. Firmware maps the completed file, validates the
                header and safe bias range, and writes the validity marker last.
              </p>
              <p>
                A different bucket count or hidden width changes both model layout and C
                compile-time dimensions. It needs a matching core build plus updated
                browser compatibility constants. Uploading bytes alone cannot change the
                compiled architecture.
              </p>
            </CodeStudy>
            <h3>Connect a different microcontroller</h3>
            <p>
              Implement the same hello, device info, position, go, and error messages.
              Accept a complete FEN and return a legal UCI move. Add a target identifier
              in <code>esp/protocol.h</code>, allow it in <code>web/src/device.ts</code>,
              and add protocol fixtures with a fake serial-port test.
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
                The browser game needs only connection state, one complete FEN setter,
                and fixed-depth search. The new target can use any board representation,
                search, or evaluator behind this boundary. It must expose USB serial or a
                UART bridge and implement the same frame header, CRC32, hello, device
                info, position, go, and error messages.
              </p>
              <p>
                Device info needs a distinct target identifier and honest model metadata.
                Position must accept a full legal FEN. Go must return the fixed result with
                a legal UCI move. Add the target identifier to <code>esp/protocol.h</code>
                and browser validation. Reuse the C protocol fixtures and fake Web Serial
                test to prove exact bytes, partial reads, checksum failures, command order,
                legal move handling, and disconnect behavior.
              </p>
            </CodeStudy>
            <p>
              The browser does not depend on the search or NNUE internals. Any engine
              can connect when it implements the serial protocol and returns legal UCI
              moves.
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
