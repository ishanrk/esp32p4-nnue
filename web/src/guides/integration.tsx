import { Page, Section, Code, Source } from "./shared";
export function IntegrationGuide() {
  return <Page title="Connect your own engine">
    <p>I kept the serial interface separate from the chess engine so you can connect your own implementation to the same website. You write the functions that describe your engine, accept a position and search it. The shared C adapter handles the incoming bytes and replies.</p>
    <p>You do not need my neural network, a particular board identity or changes to the website. Start with the working example below, then replace its engine and serial functions with yours.</p>
    <Section title="1. Run the complete example">
      <p>Use a Linux terminal in the repository folder, with a C compiler, CMake and Python installed. Create a Python environment for the checker first. This keeps its dependencies separate from your system Python.</p>
      <Code>{"python3 -m venv build/connection-env\n. build/connection-env/bin/activate\npython3 -m pip install chess==1.11.2 pyserial==3.5"}</Code>
      <p>The host example uses this project’s real classical chess engine. Classical means it scores material and piece placement instead of using neural network weights. It reports that identity and no model. This checks integration on a computer, not USB hardware.</p>
      <Code>{"cmake -S . -B build -DCMAKE_BUILD_TYPE=Release\ncmake --build build --parallel 2\npython3 esp/conformance.py --host ./build/p4hostdevice"}</Code>
      <p>Conformance means checking that a device follows the interface. This command checks identity, errors, legal moves and terminal positions. A failure names the operation. The <code>chess</code> dependency checks legality and <code>pyserial</code> opens your board’s port when you get to step 6.</p>
    </Section>
    <Section title="2. Implement the engine callbacks">
      <p>Implement <code>get_info</code>, <code>get_capabilities</code>, <code>set_position</code> and <code>search</code> in <code>board_protocol_backend_t</code>. The browser sends bytes. These C callbacks are local functions called by the firmware dispatcher, not addresses called remotely by JavaScript.</p>
      <p><code>set_position</code> receives a temporary, terminated FEN string, at most 127 ASCII bytes. FEN describes one position. Parse into a candidate position and replace the old position only after success. <code>search</code> receives a budget kind and value, then fills a move, score and real statistics.</p>
      <p>Supply <code>read</code>, <code>write</code>, <code>monotonic_ms</code> and <code>yield</code> through <code>chess_serial_io_t</code>. The shared serial adapter keeps partial transfers and parsing out of the engine. The complete main loop is in <code>examples/host_device.c</code>; the actual UART mapping is in <code>esp/main/app.c</code>.</p>
      <p>These are the exact types from <Source path="esp/protocol.h">the protocol header</Source>. The <code>context</code> pointer is your engine state. Keep it alive while the dispatcher runs.</p>
      <Code>{"void (*get_info)(void *context, board_device_info_t *info);\nvoid (*get_capabilities)(void *context,\n                         board_device_capabilities_t *capabilities);\nboard_protocol_error_t (*set_position)(void *context, const char *fen);\nboard_protocol_error_t (*search)(void *context, uint8_t budget_type,\n                                 uint32_t budget,\n                                 board_search_result_t *result);"}</Code>
      <h3>get_info describes your firmware</h3>
      <p>Clear the output structure, then fill in your firmware version and actual transposition table size in bytes. A classical engine uses <code>BOARD_TARGET_UNKNOWN</code> and <code>BOARD_MODEL_NONE</code>, with zero model sizes and dimensions. Do not copy the reference identity to get connected. Zero model metadata does not mean the engine is unavailable.</p>
      <p><code>firmware_version</code> is a terminated printable ASCII string of at most 31 characters. This callback has no error return. Initialize your engine before starting the dispatcher. The output pointer is borrowed only during this call.</p>
      <h3>get_capabilities names the engine and sets its limits</h3>
      <p>Fill <code>engine_name</code> and <code>firmware_identity</code> with your own terminated names, each at most 31 printable ASCII characters. Set <code>features</code> to <code>BOARD_CAPABILITY_SEARCH_DEPTH</code>, <code>BOARD_CAPABILITY_SEARCH_TIME</code>, or both.</p>
      <p>Set <code>maximum_depth</code> in plies and <code>maximum_time_ms</code> in milliseconds. A ply is one move by one side. The reference limits are 12 plies and 5000 milliseconds, but yours can differ. Implement this callback for a new engine so the browser can display an honest identity. It is optional only for legacy compatibility.</p>
      <h3>set_position parses the incoming FEN</h3>
      <p>The dispatcher already bounds the input to 127 printable ASCII characters and adds the terminating zero. It cannot validate your engine’s position representation for you. Parse into temporary storage and preserve the old position if parsing fails. Here is the actual callback from the complete host example.</p>
      <Code>{"static board_protocol_error_t set_position(void *argument, const char *fen) {\n    host_device_t *device = argument;\n    position_t candidate;\n    if (!set_position_fen(&candidate, fen)) return BOARD_ERROR_POSITION_INVALID;\n    device->position = candidate;\n    device->position_valid = true;\n    return BOARD_ERROR_NONE;\n}"}</Code>
      <p>Map your FEN parser to this pattern. Do not keep the borrowed string pointer after returning. A fresh FEN resets search history. It includes the halfmove counter, but not the earlier positions needed for full game repetition history.</p>
      <h3>search returns the move and real statistics</h3>
      <p><code>budget_type</code> is <code>BOARD_GO_DEPTH</code> or <code>BOARD_GO_TIME_MS</code>. The dispatcher checks the positive budget against your advertised limits. The example converts it into <code>search_limits_t</code>, then calls <code>search_position</code>. Your callback should call your own search routine.</p>
      <table><thead><tr><th>Result field</th><th>Value to supply</th></tr></thead><tbody>
        <tr><td><code>best_move[6]</code></td><td>A terminated UCI move such as <code>e7e5</code> or <code>a7a8q</code>. Use <code>0000</code> only if there is no legal move.</td></tr>
        <tr><td><code>score</code></td><td>Signed 32 bit centipawns, positive for the side to move. The reference reserves its mate score range separately.</td></tr>
        <tr><td><code>depth</code></td><td>Unsigned 16 bit completed depth in plies.</td></tr>
        <tr><td><code>nodes</code></td><td>Unsigned 64 bit actual node count. The browser preserves it as bigint.</td></tr>
        <tr><td><code>elapsed_ms</code></td><td>Unsigned 32 bit search duration from the device clock, in milliseconds.</td></tr>
        <tr><td><code>model_state</code>, <code>model_crc32</code></td><td>The active model descriptor, or zero for an engine without a model.</td></tr>
      </tbody></table>
      <p>Return <code>BOARD_ERROR_NONE</code> on success, <code>BOARD_ERROR_POSITION_REQUIRED</code> if no position was accepted, or <code>BOARD_ERROR_ENGINE_UNAVAILABLE</code> if search cannot run. An allocation failure is not a terminal position. Fill the borrowed result before returning and leave the accepted root position usable.</p>
      <p>This search is synchronous. It needs its own budget checks and yielding. A stop callback in the same blocked loop could not interrupt it, so this adapter does not offer a wire stop command.</p>
    </Section>
    <Section title="3. Supply serial input, output and a clock">
      <p>The platform callback types are in <Source path="esp/serial_adapter.h">the serial adapter header</Source>. Map these to your board’s driver. The host example uses standard input and output, while <Source path="esp/main/app.c">the reference firmware</Source> uses UART.</p>
      <Code>{"int (*read)(void *context, uint8_t *dst, size_t capacity, size_t *count);\nint (*write)(void *context, const uint8_t *src, size_t length, size_t *count);\nuint64_t (*monotonic_ms)(void *context);\nvoid (*yield)(void *context);"}</Code>
      <p>Read copies at most <code>capacity</code> bytes into <code>dst</code>. Write consumes at most <code>length</code> bytes from <code>src</code>. Set <code>*count</code> to the amount actually transferred. Return 0 for success, including no progress, 1 for an orderly end of the connection, or negative 1 for an input or output failure. Buffer pointers are borrowed for the call only.</p>
      <p>Partial transfers are expected. The adapter keeps unfinished bytes and calls yield when it cannot make progress. Use bounded driver calls, a monotonic millisecond clock and a yield function that lets other tasks run. A stalled response write fails after 1000 milliseconds. Keep debug output off the binary serial stream.</p>
      <p>The adapter uses a 256 byte input buffer and fixed frame buffers. It does not allocate from a received length. You can reuse its parser and CRC implementation unchanged.</p>
    </Section>
    <Section title="4. Attach the callbacks and poll">
      <p>This excerpt is from <Source path="examples/host_device.c">the complete executable example</Source>. Its earlier initialization creates <code>device</code> and allocates the search table. Initialize your own engine and check allocation failures before attaching these callbacks.</p>
      <Code>{"board_protocol_backend_t backend = {\n    .context = &device, .get_info = get_info,\n    .get_capabilities = get_capabilities, .set_position = set_position,\n    .search = search,\n};\nchess_serial_io_t io = {.read = serial_read, .write = serial_write,\n    .monotonic_ms = monotonic_ms, .yield = platform_yield};\nchess_serial_adapter_t adapter;\nif (chess_serial_adapter_init(&adapter, &backend, &io)) return 1;\nint status;\nwhile ((status = chess_serial_adapter_poll(&adapter)) == 0) {}"}</Code>
      <p>Only one task should poll this instance. Keep the adapter and context objects alive until polling stops, then release the engine’s allocations. <code>chess_serial_adapter_reset</code> clears local adapter state. It is not a browser command and does not reset your engine.</p>
    </Section>
    <Section title="5. Report only what you support">
      <p>Capabilities command <code>0x05</code> reports the real engine name and supported budgets. Only an unknown command response for that command selects the legacy path. Invalid text, corruption and timeouts are failures, not permission to assume compatibility.</p>
      <p>Model upload is separate from ordinary play. Keep target, format, size, numeric bounds and integrity checks for that operation. This website does not offer an uploader for an arbitrary engine. Neither stop nor full game history is implemented in the current extension.</p>
    </Section>
    <Section title="6. Check your board and open Play">
      <p>Build firmware for the actual board and map its serial input and output callbacks. Reset it, close the monitor, and run the following check with the actual port. Then close the checker and choose Connect board in Play. No website validator edit is needed.</p>
      <Code>{"python3 esp/conformance.py --port PORT"}</Code>
      <p>For a separate browser page, use <Source path="examples/browser-client.ts">the complete TypeScript example</Source>. It imports the local client, not a published registry package. Call <code>SerialChess.connect()</code> from a button click. Its search call owns both the position and the search, so two callers cannot mix their requests. Check every returned move against your game before applying it.</p>
      <p>Canceling queued work sends nothing. Canceling active work or timing out closes the connection, but the device may still be searching. Reset before reconnecting after an abandoned operation. Call <code>board.disconnect()</code> when you finish. Repeated disconnect calls are safe.</p>
    </Section>
    <Section title="How the messages reach those functions">
      <table><thead><tr><th>Browser operation</th><th>Wire command</th><th>Local callback</th></tr></thead><tbody>
        <tr><td>Hello</td><td><code>0x01</code></td><td>The dispatcher replies with protocol version 1.</td></tr>
        <tr><td>Device information</td><td><code>0x02</code></td><td><code>get_info</code></td></tr>
        <tr><td>Names and limits</td><td><code>0x05</code></td><td><code>get_capabilities</code></td></tr>
        <tr><td>Position</td><td><code>0x20</code></td><td><code>set_position</code>, followed by an empty acknowledgement.</td></tr>
        <tr><td>Search</td><td><code>0x21</code></td><td><code>search</code>, followed by the encoded result.</td></tr>
      </tbody></table>
      <p>Every frame contains magic bytes <code>50 34</code>, version, command, a little endian unsigned 16 bit payload length, the payload and a little endian CRC32. Payloads are bounded to 1024 bytes. Successful response commands set bit 7. Errors use <code>0xff</code>, followed by the failed command and error code.</p>
      <p>The checksum covers version through payload. The shared implementation uses CRC32 ISO HDLC with reflected polynomial <code>0xedb88320</code>, initial value and final XOR <code>0xffffffff</code>. ASCII <code>123456789</code> checks to <code>0xcbf43926</code>. CRC detects corruption, not authentication.</p>
      <p>You can trace each encoded field in <Source path="esp/protocol.c">the shared dispatcher</Source> against <Source path="test/protocol_vectors.tsv">the byte vectors used by C, TypeScript and Python tests</Source>. There is no need to copy a second parser into your engine.</p>
    </Section>
  </Page>;
}
