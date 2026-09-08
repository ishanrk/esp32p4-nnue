import { Page, Section, Code } from "./shared";
export function SetupGuide() {
  return <Page title="Set up a board">
    <p>Get a first move using the supplied model. No training run is needed.</p>
    <Section title="1. Check your board and cable">
      <p>This build targets the Waveshare ESP32 P4 Module DEV KIT with 16 MB flash and the chip revision settings in the supplied configuration. Use a USB data cable and desktop Chrome or Edge. Linux is the compiled development environment here. Other host environments have not been checked in this change.</p>
      <figure><img src="/images/esp32-p4-module-dev-kit.jpg" width="1600" height="1200" alt="Reference board with a cable in the bottom left PWR USB TO UART connector" loading="lazy" /><figcaption>Plug into <code>PWR USB TO UART</code>, the bottom left connector with the cable in this photograph. Do not use the adjacent USB connector for this firmware. Photograph by Ishan Kumthekar.</figcaption></figure>
      <p>If no port appears, try another data cable. Check the printed board revision before applying these settings to another board. The <a href="https://docs.waveshare.com/ESP32-P4-Module-DEV-KIT">manufacturer guide</a> identifies its connectors.</p>
    </Section>
    <Section title="2. Build the firmware">
      <p>Install Espressif IDF 6.0.2, its development tools. From the repository root, activate that installation and build. The checked in model is embedded automatically.</p>
      <Code>{'. "$HOME/esp-idf/export.sh"\nidf.py -C esp set-target esp32p4\nidf.py -C esp build'}</Code>
      <p>Expect a binary and flash arguments in <code>esp/build</code>. Compilation has succeeded locally. That is not a physical board test. If the target or model check fails, keep the supplied model and configuration together instead of changing its dimensions.</p>
    </Section>
    <Section title="3. Flash your board">
      <p>Use the connector shown above. Replace <code>PORT</code> with your actual serial port. This command writes firmware, so run it only for the reference board after checking its revision.</p>
      <Code>{"idf.py -C esp -p PORT flash"}</Code>
      <p>The generated flash arguments choose the bootloader, partition and application addresses. Do not guess them or use these settings on an unrelated board. If connection fails, close serial programs and follow the manufacturer instructions for download mode.</p>
    </Section>
    <Section title="4. Close the serial monitor">
      <p>Exit <code>idf.py monitor</code> with <code>Ctrl+]</code>. Close any Python board client too. The browser needs sole access to the port. An occupied port usually means another program still owns it.</p>
    </Section>
    <Section title="5. Connect from Play">
      <p>Press reset on the board, then open <a href="#play">Play</a> and choose Connect board. Choose its port in the browser window. Allow about six seconds for startup checks. If permission is cancelled, choose Connect board again when ready.</p>
    </Section>
    <Section title="6. Check the identity">
      <p>Expect the reference engine name, firmware version and an embedded or uploaded model checksum. An older firmware may say Legacy version 1 engine. If a request times out, reset before reconnecting. Closing the browser port does not stop an active chip search.</p>
    </Section>
    <Section title="7. Make a move">
      <p>Choose White and select e2, then e4. The chip searches and replies. Choose Black to let it move first. Changing sides starts a new game. The board faces your chosen color. Download game record saves the actual moves as PGN, a standard text format for chess games.</p>
      <p><a href="/docs/QUICKSTART.md">Build details and remaining physical checks</a>. <a href="#integration">Using a different engine</a>.</p>
    </Section>
  </Page>;
}
