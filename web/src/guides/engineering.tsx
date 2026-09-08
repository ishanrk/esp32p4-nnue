import { Page, Section, Code } from "./shared";
export function HowItWorks() {
  return <Page title="How it works">
    <p>The browser displays the game. The connected chip chooses its own move.</p>
    <Section title="Follow one move">
      <p>Select e2 and e4. <code>applyHumanMove</code> asks chess.js to check legality and update the game. It produces this FEN. Letters describe pieces, digits count empty squares, and the remaining fields record whose turn it is, castling rights and move counters.</p>
      <Code>{"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"}</Code>
      <p><code>SerialBoard.search</code> holds the connection for the whole transaction. It sends Position, waits for an empty acknowledgement, then sends Go. <code>board_protocol_feed</code> checks framing and the checksum before calling the engine. The reference callback invokes <code>search_position</code>.</p>
      <p>During search, <code>make_move</code> changes pieces, rule state and the neural network sums. <code>undo_move</code> restores the previous position after a branch. A reply might be e7e5, but that is an illustration, not a promised engine choice. <code>applyUciMove</code> checks the actual reply against the current browser game. Session and game checks reject old results.</p>
      <p>The classical host conformance run returned b8c6 from this position at depth one. This is a verified host example, not a physical board measurement. The executable inference trace checks the actual reference model: e2e4 changes the first White accumulator entry from 234 to 200 and the first Black entry from 234 to 277. Full refresh agrees, and undo restores the whole position.</p>
    </Section>
    <Section title="Rules and board representation">
      <p>A bitboard is a 64 bit integer with one bit per square. Piece bitboards make occupancy and attack checks inexpensive. Moves pack their source, destination, promotion and flags into an integer. The engine checks king safety after making a candidate move. Tests cover castling through check, en passant exposing a king and promotion choices.</p>
      <p>A Zobrist hash combines constants for pieces and rule state into a position key. The transposition table stores earlier search results under those keys. A key collision is possible; this is a search cache, not proof of game identity. Move counting tests called perft check legal move generation without relying on evaluation scores.</p>
    </Section>
    <Section title="Search and budgets">
      <p>Iterative deepening searches one depth, then a deeper one, retaining a completed result. Alpha beta search skips branches that cannot improve the current bound. Principal variation search first checks most alternatives with a narrow score window. Quiescence search continues tactical captures to avoid evaluating a position in the middle of an exchange.</p>
      <p>Move ordering tries promising moves sooner. The table distinguishes exact scores from upper and lower bounds. Mate scores are adjusted for distance when stored and retrieved. Time checks and yielding happen at polling points, so a requested budget can be exceeded. Device elapsed time and browser waiting time use different clocks.</p>
      <figure><img src="/images/reference/alpha-beta-tree.svg" width="1600" height="800" loading="lazy" alt="Search tree showing branches skipped after alpha beta bounds make them unnecessary" /><figcaption>Alpha beta illustration by Antonsusi, based on Sgop. Public domain. <a href="https://commons.wikimedia.org/wiki/File:Alpha_beta.svg">Original illustration</a>.</figcaption></figure>
    </Section>
    <Section title="Incremental neural evaluation">
      <p>NNUE means efficiently updatable neural network. It scores a position using learned weights. Each perspective has an accumulator, an array of running sums. Most moves subtract a piece’s old feature row and add its new row. Features encode piece type, square and the king’s view.</p>
      <Code>{"old accumulator = [10, 20]\nold piece row = [3, -2]\nnew piece row = [-1, 5]\nnew accumulator = [10 - 3 - 1, 20 - (-2) + 5] = [6, 27]"}</Code>
      <p>This tiny example explains the arithmetic, not actual model weights. A king move can change the feature group or horizontal mirror for every piece in that perspective. <code>refresh_nnue_perspective</code> then rebuilds its sums. Other views can still be updated incrementally. Undo must restore both views as well as the chess position.</p>
    </Section>
    <Section title="Integer export and safety">
      <p>The reference model uses four king groups and 128 hidden values. Export scales learned values by 64 and rounds them into integer arrays. Feature weights occupy signed bytes. The two accumulator arrays use signed 16 bit values, clipped from zero to 127 before output multiplication. The output is accumulated in 64 bits and divided by 4096, truncating toward zero.</p>
      <p>There are at most 30 active nonking pieces. Numeric validation reserves enough accumulator range for every active feature, including extreme weights. Raw integer parity compares the exported computation with C. Search separately clamps evaluation scores below its mate score range. Equal raw scores do not prove good chess play.</p>
    </Section>
    <Section title="Model ownership and recovery">
      <p>The embedded model belongs to the firmware image. An uploaded model is mapped from flash, so the evaluator borrows those bytes until it is switched away. Before erasing uploaded storage, firmware binds the embedded fallback and releases the old mapping. It validates the new bytes and writes validity metadata last.</p>
      <p>An interrupted upload can lose the previous uploaded image. Recovery means a valid embedded fallback or valid new model, not preservation of both uploads. <code>synchronize_evaluator</code> refreshes accumulators and clears cached search scores when the evaluator generation changes. Software fault tests do not replace power interruption tests.</p>
    </Section>
    <Section title="History and cancellation limits">
      <p>FEN does not include the sequence of earlier positions. Its halfmove counter is not repetition history. The browser can adjudicate the game it recorded, while a search started from FEN has only its supplied position and subsequent search path. Full game history is not advertised.</p>
      <p>Version 1 has no stop command or wire request identifier. Cancelling active work abandons it and closes the port. The chip can continue searching. Reset before reconnecting after an abandoned session. Cancelling a queued request sends nothing and leaves unrelated work alone.</p>
    </Section>
    <p><a href="#results">Measurements and training evidence</a>. <a href="/docs/PROTOCOL.md">Protocol reference</a>. <a href="/THIRD_PARTY_LICENSES.txt">Asset sources and licenses</a>.</p>
    <p>Learning references retained from the original project include <a href="https://github.com/maksimKorzh/bbc">Code Monkey King</a>, <a href="https://www.chessprogramming.org/">Chess Programming Wiki</a> and <a href="https://github.com/official-stockfish/nnue-pytorch">the Stockfish neural network trainer</a>. See <a href="/docs/LICENSE_STATUS.md">source licensing and provenance</a>.</p>
  </Page>;
}
export function RecordedGame() {
  return <Page title="Recorded game">
    <p>No complete game recording is included in this checkout. These existing photographs document the setup. They are not a live connection and do not validate the new firmware.</p>
    <figure><img src="/images/esp32-p4-browser-game.jpg" width="1800" height="1350" loading="lazy" alt="Earlier browser game beside the reference board" /><figcaption>Earlier browser game photograph by Ishan Kumthekar.</figcaption></figure>
    <figure><img src="/images/esp32-p4-test-setup.jpg" width="1800" height="1350" loading="lazy" alt="Reference board connected beside a laptop" /><figcaption>Earlier physical setup photograph by Ishan Kumthekar.</figcaption></figure>
    <p>A complete recording should show the connector, firmware identity, first move and game result without cuts that hide reconnects. Export its PGN and record the firmware hash. Capture is deferred until hardware testing. <a href="#play">Return to live Play</a>.</p>
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
      <p>The reference manifest reports about 25.4 million integer evaluations per second on an Intel Core i7 13700H. That number is not ESP32 P4 throughput. Historical fixed depth matches compare earlier engines and do not establish current strength at equal thinking time. Physical profile selection remains provisional.</p>
    </Section>
    <Section title="Training claims need context">
      <p>The historical test mean absolute error is 4529.96 centipawns. A centipawn is one hundredth of a pawn. Training selected checkpoints using a transformed loss, not that raw error metric. A new seeded sample of 20000 test positions measured about 4570 centipawns overall and 243 for labels below magnitude 30000. Labels at magnitude 30000 contributed about 95.5 percent of absolute error in that sample.</p>
      <p>Those large labels include encoded mates and extreme scores. The shards do not preserve the original mate flags, so the smaller figure is not a proven nonmate metric. It is also not a playing strength estimate.</p>
      <p>The imported data uses seeded position splits, not whole game separation. Samples contained matching feature inputs across splits. Feature grouping identifies equivalent network inputs, but it cannot reconstruct missing game provenance or prove all leakage has been removed.</p>
      <p><a href="/docs/MEASUREMENTS.md">Reproduce measurements and recovery checks</a>. <a href="/docs/WORK_STATUS.md">Current verification record</a>.</p>
    </Section>
  </Page>;
}
