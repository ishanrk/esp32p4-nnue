import { Page, Section, Code } from "./shared";
export function IntegrationGuide() {
  return <Page title="Connect your own engine">
    <p>Your chip can use the same website. It does not need the reference model, a board registration or changes to the website.</p>
    <Section title="Run the complete example">
      <p>The host example uses this project’s real classical chess engine. Classical means it scores material and piece placement instead of using neural network weights. It reports that identity and no model. This checks integration on a computer, not USB hardware.</p>
      <Code>{"cmake -S . -B build -DCMAKE_BUILD_TYPE=Release\ncmake --build build --parallel 2\npython3 esp/conformance.py --host ./build/p4hostdevice"}</Code>
      <p>Conformance means checking that a device follows the interface. This command checks identity, errors, legal moves and terminal positions. A failure names the operation and relevant protocol reference. Python needs the <code>chess</code> package used by the repository tests.</p>
    </Section>
    <Section title="Connect your engine functions">
      <p>Implement <code>get_info</code>, <code>get_capabilities</code>, <code>set_position</code> and <code>search</code> in <code>board_protocol_backend_t</code>. The browser sends bytes. These C callbacks are local functions called by the firmware dispatcher, not addresses called remotely by JavaScript.</p>
      <p><code>set_position</code> receives a temporary, terminated FEN string, at most 127 ASCII bytes. FEN describes one position. Parse into a candidate position and replace the old position only after success. <code>search</code> receives a budget kind and value, then fills a move, score and real statistics.</p>
      <p>Supply <code>read</code>, <code>write</code>, <code>monotonic_ms</code> and <code>yield</code> through <code>chess_serial_io_t</code>. The shared serial adapter keeps partial transfers and parsing out of the engine. The complete main loop is in <code>examples/host_device.c</code>; the actual UART mapping is in <code>esp/main/app.c</code>.</p>
      <p><a href="/docs/INTEGRATION.md">Exact callback types, ownership and failure rules</a>. <a href="/docs/PROTOCOL.md">Every protocol field and checksum rule</a>.</p>
    </Section>
    <Section title="Report only what you support">
      <p>Capabilities command <code>0x05</code> reports the real engine name and supported budgets. Only an unknown command response for that command selects the legacy path. Invalid text, corruption and timeouts are failures, not permission to assume compatibility.</p>
      <p>Model upload is separate from ordinary play. Keep target, format, size, numeric bounds and integrity checks for that operation. This website does not offer an uploader for an arbitrary engine. Neither stop nor full game history is implemented in the current extension.</p>
    </Section>
    <Section title="Connect your physical implementation later">
      <p>Build firmware for the actual board and map its serial input and output callbacks. Reset it, close the monitor, and run the following check with the actual port. Then close the checker and choose Connect board in Play. No website validator edit is needed.</p>
      <Code>{"python3 esp/conformance.py --port PORT"}</Code>
      <p><a href="/docs/BROWSER_CLIENT.md">Use the standalone browser client</a>. Its search call owns both the position and the search, so two callers cannot mix their requests.</p>
    </Section>
  </Page>;
}
