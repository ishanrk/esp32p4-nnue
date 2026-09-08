import { Page, Section, Code, Source } from "./shared";
export function HowItWorks() {
  return <Page title="How it works">
    <p>I wrote this engine in C to explore how much chess I could fit on an ESP32 P4. This guide follows the code from moving a pawn to searching for a reply. You do not need to know neural networks to start. The board, the rules and the search come first.</p>
    <p>I use two ways to score positions: a small classical evaluator and a neural evaluator called NNUE. Both use the same move generator and search. That separation lets me test the chess rules without needing a trained model.</p>
    <nav className="reading-links" aria-label="Engine guide contents"><a href="#guide-move">Follow a move</a><a href="#guide-rules">Board and rules</a><a href="#guide-search">Search</a><a href="#guide-inference">Neural evaluation</a><a href="#guide-files">Read the source</a></nav>
    <Section title="Start with e2e4" id="guide-move">
      <p>When you move the king’s pawn two squares, the browser checks that the move is legal and describes the new position to the engine.</p>
      <p>Select e2 and e4. <code>applyHumanMove</code> asks chess.js to check legality and update the game. It produces this FEN. Letters describe pieces, digits count empty squares, and the remaining fields record whose turn it is, castling rights and move counters.</p>
      <Code>{"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"}</Code>
      <p><code>SerialBoard.search</code> holds the connection for the whole transaction. It sends Position, waits for an empty acknowledgement, then sends Go. <code>board_protocol_feed</code> checks framing and the checksum before calling the engine. The reference callback invokes <code>search_position</code>.</p>
      <p>During search, <code>make_move</code> changes pieces, rule state and the neural network sums. <code>undo_move</code> restores the previous position after a branch. The search chooses a reply, then <code>applyUciMove</code> checks it against the current browser game. Session and game checks reject old results.</p>
      <p>The classical host conformance run returned b8c6 from this position at depth one on the development computer. The executable inference trace checks the actual reference model: e2e4 changes the first White accumulator entry from 234 to 200 and the first Black entry from 234 to 277. Full refresh agrees, and undo restores the whole position.</p>
      <figure className="setup-playing"><img src="/images/esp32-p4-test-setup.jpg" width="1800" height="1350" loading="lazy" alt="My ESP32 P4 connected beside the laptop used to test the engine" /><figcaption>My earlier test setup, with the board connected to the laptop.</figcaption></figure>
    </Section>
    <Section title="How I represent the board" id="guide-rules">
      <p>In <Source path="src/ch.h">ch.h</Source>, <code>position_t</code> holds the board and the rule state. Squares are numbered from a1 at 0 to h8 at 63. That makes e2 square 12 and e4 square 28. The <code>board</code> array answers what piece occupies one square. The piece bitboards answer where all pieces of one kind are.</p>
      <Code>{"e2 = 1 * 8 + 4 = 12\ne4 = 3 * 8 + 4 = 28\n\nOne bit at e2: UINT64_C(1) << 12\nOne bit at e4: UINT64_C(1) << 28"}</Code>
      <p>The 64 bit constant matters. Shifting an ordinary 32 bit integer cannot safely represent every square. With a bitboard, intersecting attacks and occupancy becomes an integer AND operation. I still keep the square array because checking a particular destination is simpler with a direct lookup.</p>
      <p>A bitboard is a 64 bit integer with one bit per square. Piece bitboards make occupancy and attack checks inexpensive. Moves pack their source, destination, promotion and flags into an integer. The engine checks king safety after making a candidate move. Tests cover castling through check, en passant exposing a king and promotion choices.</p>
      <p>A Zobrist hash combines constants for pieces and rule state into a position key. The transposition table caches earlier search results under those keys. Hash collisions remain possible. Move counting tests called perft check legal move generation independently of evaluation scores.</p>
      <p>Read <Source path="src/movegen.c">movegen.c</Source> for attack generation and <Source path="src/position.c">position.c</Source> for the state changes. Each candidate needs a king safety check. <code>make_move</code> rejects a move that leaves its own king in check.</p>
      <h3>Making and undoing a move</h3>
      <p>Search explores many possible futures from the same position. Each branch needs to start with the same pieces and rule state. I use an <code>undo_t</code> record to save the information needed to put the position back.</p>
      <p>For e2e4, the engine moves the pawn, updates occupancy and the hash, resets the halfmove clock, changes the side to move and updates the neural accumulators. Other moves need extra work. Castling moves a rook too. En passant removes a pawn from a different square than the destination. Promotion changes the piece type. Undo has to reverse all of that, including rule history.</p>
      <p>Perft counts legal move sequences to a chosen depth. From the initial position, depths one, two and three give 20, 400 and 8902. That is a useful first check before asking whether an evaluator plays good chess.</p>
    </Section>
    <Section title="Scoring positions and searching moves">
      <p>An evaluator gives one position a score. Search uses those scores to compare possible sequences of moves. A good looking position after my move can be terrible after the opponent’s reply, so I need to examine those replies before choosing a move.</p>
      <p>The classical path in <Source path="src/evaluate.c">evaluate.c</Source> starts with material values: pawn 100, knight 320, bishop 330, rook 500 and queen 900. It adds small piece placement terms. One hundred points is a pawn, so the usual unit is a centipawn.</p>
      <p>The returned score is from the side to move’s perspective. If a position is good for White, its score is positive when White is to move and negative when Black is to move. Search uses that convention to express both sides with the same function.</p>
    </Section>
    <Section title="How alpha beta avoids unnecessary work" id="guide-search">
      <p>Start with minimax: I choose the move with the best outcome assuming my opponent chooses the reply that is worst for me. The negamax form in this engine uses a sign change each time the side changes. That is why the recursive call in <Source path="src/search.c">search.c</Source> begins with a minus sign.</p>
      <p>Suppose move A guarantees a score of 30. While checking move B, I find an opponent reply that holds me to 10. I can stop checking the remaining replies to B. The opponent can already force something worse than A, so B cannot be my best choice. That is the idea behind alpha beta pruning.</p>
      <p>Alpha records the best lower bound found so far. Beta is the limit at which this branch is already good enough for the caller to reject an alternative. When alpha reaches beta, the caller has enough information to make its decision. The result then describes a bound on the score.</p>
      <p>Here is the first legal move’s recursive call in <code>principal_variation_search</code>. Changing signs also reverses the score window. After the call, <code>undo_move</code> restores the parent position before another move is tried.</p>
      <Code>{"score = -principal_variation_search(\n    context, position, depth - 1, -beta, -alpha, ply + 1);"}</Code>
      <p>Iterative deepening searches one depth, then a deeper one, retaining a completed result. Alpha beta search skips branches that cannot improve the current bound. Principal variation search first checks most alternatives with a narrow score window. Quiescence search continues tactical captures to avoid evaluating a position in the middle of an exchange.</p>
      <p>Move ordering tries promising moves sooner. The table distinguishes exact scores from upper and lower bounds. Mate scores are adjusted for distance when stored and retrieved. Time checks and yielding happen at polling points, so a requested budget can be exceeded. Device elapsed time and browser waiting time use different clocks.</p>
      <figure><img src="/images/reference/alpha-beta-tree.svg" width="1600" height="800" loading="lazy" alt="Search tree showing branches skipped after alpha beta bounds make them unnecessary" /><figcaption>Alpha beta illustration by Antonsusi, based on Sgop. Public domain. <a href="https://commons.wikimedia.org/wiki/File:Alpha_beta.svg">Original illustration</a>.</figcaption></figure>
      <h3>Searching a little deeper each time</h3>
      <p>I use iterative deepening so the engine has a completed answer before attempting more work. It searches depth one, then two, and continues until a limit is reached. A time limit can interrupt a deeper iteration, so completed depth and requested depth are not always equal.</p>
      <p>The transposition table move is tried early. Captures, killer moves and history scores help order the others. Better ordering makes useful cutoffs happen sooner. Principal variation search tests most alternatives with a narrow window first, then searches again if an alternative looks better. Late quiet moves can also be searched at reduced depth and checked again if they improve the bound.</p>
      <h3>Following capture sequences with quiescence search</h3>
      <p>Imagine the search stops just after a rook captures a pawn that is defended by another pawn. An immediate material score can look like a gain, even though the rook will be lost next. <code>quiescence_search</code> continues tactical moves at the nominal leaf. If the king is in check, it searches legal evasions.</p>
      <p>This helps stabilize the scores at the leaves of the search. The depth, time budget and move ordering determine which lines the engine can examine.</p>
    </Section>
    <Section title="What NNUE changes" id="guide-inference">
      <p>The classical evaluator uses rules I can write down directly. The neural evaluator scores positions with weights learned from labeled examples. Both use the same legal move generation and alpha beta search. In <code>evaluate</code>, the engine selects the neural path when a model is loaded.</p>
      <p>NNUE means efficiently updatable neural network. It scores a position using learned weights. Each perspective has an accumulator, an array of running sums. Most moves subtract a piece’s old feature row and add its new row. Features encode piece type, square and the king’s view.</p>
      <Code>{"old accumulator = [10, 20]\nold piece row = [3, -2]\nnew piece row = [-1, 5]\nnew accumulator = [10 - 3 - 1, 20 - (-2) + 5] = [6, 27]"}</Code>
      <p>I chose small numbers here to make the arithmetic easy to follow. A king move can change the feature group or horizontal mirror for every piece in that perspective. <code>refresh_nnue_perspective</code> then rebuilds its sums. Other views can still be updated incrementally. Undo must restore both views as well as the chess position.</p>
      <h3>From a piece to a row of weights</h3>
      <p><Source path="src/nnue.c">nnue.c</Source> computes each feature index from the king group, piece type, relative color and square. There are five nonking piece types for each color, giving 640 features per king group. The reference model has four groups and 128 values in each row.</p>
      <p>For White’s king on e1, the view is mirrored horizontally. The White pawn on e2 maps to feature 1931, and the pawn on e4 maps to 1947. The update subtracts row 1931 and adds row 1947 to White’s accumulator. Black has its own perspective and its own update.</p>
      <p>That is where the saving comes from. Instead of rebuilding every sum from all the pieces after an ordinary move, the engine changes only the affected rows. But if a king move changes the group or mirror, even stationary pieces get different feature indices. A full refresh is then necessary for that perspective.</p>
      <p>The executable <Source path="examples/inference_trace.c">inference trace</Source> compares incremental results with a full rebuild using the real model. It also checks that undo restores the previous position. I keep both paths testable because a wrong accumulator can still produce plausible looking moves.</p>
    </Section>
    <Section title="Integer export and safety">
      <p>The reference model uses four king groups and 128 hidden values. Export scales learned values by 64 and rounds them into integer arrays. Feature weights occupy signed bytes. The two accumulator arrays use signed 16 bit values, clipped from zero to 127 before output multiplication. The output is accumulated in 64 bits and divided by 4096, truncating toward zero.</p>
      <p>There are at most 30 active nonking pieces. Numeric validation reserves enough accumulator range for every active feature, including extreme weights. Raw integer parity compares the exported computation with C. Search separately clamps evaluation scores below its mate score range. Equal raw scores do not prove good chess play.</p>
      <p>I keep these as separate checks: can the file be loaded safely, does C reproduce the exported arithmetic, and does the engine play well? Passing one does not answer the others. The model header and numeric bounds are validated before the evaluator borrows any model memory.</p>
    </Section>
    <Section title="What the training result tells me">
      <p>The model learns from positions paired with evaluation labels. The historical test mean absolute error was about 4530 centipawns. That measures the distance between predictions and labels. The training loss uses transformed scores. Playing strength needs separate game comparisons.</p>
      <p>In a later sample of 20000 test positions, labels with magnitude 30000 contributed about 95.5 percent of the total absolute error. Error for labels below that magnitude was about 243 centipawns. Those large labels include encoded mates and extreme scores. Because the stored data lost the original mate flags, I cannot call the smaller figure a measured nonmate error.</p>
      <p>The data was split by seeded positions. Positions from related games can cross those split boundaries, and equivalent feature inputs were found across splits. I keep the error measurements separate from claims about generalization and playing strength. <a href="#results">Results and evidence</a> explains the measurement context.</p>
    </Section>
    <Section title="Model ownership and recovery">
      <p>The embedded model belongs to the firmware image. An uploaded model is mapped from flash, so the evaluator borrows those bytes until it is switched away. Before erasing uploaded storage, firmware binds the embedded fallback and releases the old mapping. It validates the new bytes and writes validity metadata last.</p>
      <p>An interrupted upload can lose the previous uploaded image. Recovery selects a valid embedded fallback or a valid new model. <code>synchronize_evaluator</code> refreshes accumulators and clears cached search scores when the evaluator generation changes. Physical power interruption tests remain pending alongside the completed software fault tests.</p>
    </Section>
    <Section title="History and cancellation limits">
      <p>FEN describes one position, including its halfmove counter. Repetition detection also needs the sequence of earlier positions. The browser can adjudicate the game it recorded, while a search started from FEN has only its supplied position and subsequent search path. Full game history input remains unsupported.</p>
      <p>Version 1 has no stop command or wire request identifier. Cancelling active work abandons it and closes the port. The chip can continue searching. Reset before reconnecting after an abandoned session. Cancelling a queued request sends nothing and leaves unrelated work alone.</p>
    </Section>
    <Section title="Where I would start reading the source" id="guide-files">
      <p>Follow this order if you want to work through the implementation. Start with the data types and one make and undo sequence. The search is much easier to read once those state changes make sense.</p>
      <ol><li><Source path="src/ch.h">ch.h</Source> defines positions, moves, undo records, search limits and model constants.</li><li><Source path="src/position.c">position.c</Source> parses FEN and changes and restores positions.</li><li><Source path="src/movegen.c">movegen.c</Source> generates moves and checks attacks.</li><li><Source path="src/evaluate.c">evaluate.c</Source> shows the classical score and the neural evaluator selection.</li><li><Source path="src/search.c">search.c</Source> puts move generation, evaluation and recursion together.</li><li><Source path="src/nnue.c">nnue.c</Source> loads weights, maps features and updates accumulators.</li><li><Source path="esp/main/app.c">app.c</Source> connects that engine to the board’s serial loop.</li><li><Source path="web/src/game.ts">game.ts</Source> and <Source path="web/src/app.tsx">the browser application</Source> validate replies and display the game.</li></ol>
      <p>To build and run the host tests from the repository folder:</p>
      <Code>{"cmake -S . -B build -DCMAKE_BUILD_TYPE=Release\ncmake --build build --parallel 2\nctest --test-dir build --output-on-failure"}</Code>
      <p>To connect a different engine, continue with <a href="#integration">the firmware callback guide</a>. To try this one on my reference board, follow <a href="#setup">the numbered setup steps</a>.</p>
    </Section>
    <p>Resources I refer to here include <a href="https://github.com/maksimKorzh/bbc">Code Monkey King</a>, <a href="https://www.chessprogramming.org/">Chess Programming Wiki</a> and <a href="https://github.com/official-stockfish/nnue-pytorch">the Stockfish neural network trainer</a>. Their work has its own authorship and licenses. <a href="/THIRD_PARTY_LICENSES.txt">Asset sources and license notices</a> are preserved. The project’s own code license still needs an owner decision before I can offer a general reuse license.</p>
  </Page>;
}
export function Results() {
  return <Page title="Results and evidence">
    <Section title="What ran where">
      <table><thead><tr><th>Evidence</th><th>What it establishes</th></tr></thead><tbody>
        <tr><td>Host engine and protocol tests</td><td>Real search and byte exchanges on this computer. Not USB hardware.</td></tr>
        <tr><td>ESP IDF 6.0.2 compilation</td><td>The reference firmware compiles. Flashing and physical runtime are deferred.</td></tr>
        <tr><td>Browser simulated serial tests</td><td>Client behavior under controlled replies and failures. Not cable reliability.</td></tr>
        <tr><td>Historical photographs</td><td>Earlier reference setup. Not measurements of this change.</td></tr>
      </tbody></table>
    </Section>
    <Section title="Historical performance">
      <p>The reference manifest reports about 25.4 million integer evaluations per second on an Intel Core i7 13700H. ESP32 P4 throughput measurements remain pending. Historical fixed depth matches compare earlier engines. Current strength at equal thinking time needs a new comparison. Physical profile selection remains provisional.</p>
    </Section>
    <Section title="Training claims need context">
      <p>The historical test mean absolute error is 4529.96 centipawns. A centipawn is one hundredth of a pawn. Training selected checkpoints using a transformed loss. A new seeded sample of 20000 test positions measured about 4570 centipawns overall and 243 for labels below magnitude 30000. Labels at magnitude 30000 contributed about 95.5 percent of absolute error in that sample.</p>
      <p>Those large labels include encoded mates and extreme scores. The original mate flags are missing from the shards, so the smaller figure describes only that score range. A reliable nonmate metric needs those flags. Playing strength needs game comparisons.</p>
      <p>The imported data uses seeded position splits. Samples contained matching feature inputs across splits. Feature grouping identifies equivalent network inputs. Missing game provenance limits how thoroughly related positions can be separated.</p>
      <p>The <Source path="models/reference.json">model manifest</Source> preserves the historical numbers. <Source path="esp/measure.py">The board measurement harness</Source> records search time separately from client round trip time. Hardware measurements still need to be run on the board.</p>
    </Section>
  </Page>;
}
