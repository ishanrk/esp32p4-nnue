import { Page, Section, Code, Source } from "./shared";
export function SetupGuide() {
  return <Page title="Set up a board">
    <p>I included the trained model in the firmware so you can run the engine without training a network or uploading weights. These steps take you from the board on your desk to a move in the browser.</p>
    <p>You need the Waveshare ESP32 P4 Module DEV KIT with 16 MB flash, a USB data cable, and desktop Chrome or Edge. The build commands below are for Linux. If you have already flashed this firmware, start at step 5.</p>
    <Section title="1. Get the project">
      <p>Open a terminal and download the repository. Keep this terminal open for the next three steps.</p>
      <Code>{"git clone https://github.com/ishanrk/esp32p4-nnue.git\ncd esp32p4-nnue"}</Code>
      <p>You should now be inside the project folder, with <code>src</code>, <code>esp</code> and <code>models</code> in it. If you already have a copy, open that folder instead.</p>
    </Section>
    <Section title="2. Install and activate the build tools">
      <p>The firmware builds with ESP IDF 6.0.2. That is Espressif’s compiler and firmware build environment. Install its Linux prerequisites using the <a href="https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32p4/get-started/index.html">Espressif setup instructions</a>, then run these commands. Skip the first two commands if you already installed that version at this location.</p>
      <Code>{'git clone --recursive --branch v6.0.2 https://github.com/espressif/esp-idf.git "$HOME/esp-idf"\n"$HOME/esp-idf/install.sh" esp32p4\n. "$HOME/esp-idf/export.sh"'}</Code>
      <p>Run <code>idf.py --version</code>. It should report 6.0.2. If the command is missing, run the last line again in the same terminal. Do not overwrite an existing IDF installation with the clone command.</p>
    </Section>
    <Section title="3. Build the firmware with the included model">
      <p>From the project folder, select the ESP32 P4 target and build.</p>
      <Code>{"idf.py -C esp set-target esp32p4\nidf.py -C esp build"}</Code>
      <p>Wait for <code>Project build complete</code>. The output is <code>esp/build/esp32p4_nnue.bin</code>. The build includes <code>models/reference.nnue</code> automatically. You do not need a separate model upload.</p>
      <p>If you have customized an existing <code>esp/sdkconfig</code>, save it before changing the target. For a fresh build, use the supplied settings. They select 16 MB flash and chip revisions 1.0 through 1.99.</p>
    </Section>
    <Section title="4. Plug into this connector and flash">
      <div className="setup-connector">
        <div><p>Use <code>PWR USB TO UART</code>, the bottom left connector with the cable in my photo. The adjacent connector marked <code>USB</code> is not the serial connection used by this firmware.</p>
          <p>On Linux, look for the board under <code>/dev/ttyUSB*</code> or <code>/dev/ttyACM*</code>. Unplug it and compare the list if you are unsure which port belongs to the board.</p>
          <Code>{"ls /dev/ttyUSB* /dev/ttyACM*"}</Code>
          <p>For example, if it appears as <code>/dev/ttyUSB0</code>, flash it with:</p>
          <Code>{"idf.py -C esp -p /dev/ttyUSB0 flash"}</Code>
        </div>
        <figure><img src="/images/esp32-p4-module-dev-kit.jpg" width="1600" height="1200" alt="My Waveshare board with a cable in the bottom left PWR USB TO UART connector" loading="lazy" /><figcaption>My board and the connector I use. Photograph by Ishan Kumthekar.</figcaption></figure>
      </div>
      <p>Replace the example port with yours. The command writes the bootloader, partitions and application at the generated addresses. Wait for the write to finish. If the port does not appear, check the connector and try a different data cable. If flashing cannot connect, close serial programs and follow the <a href="https://docs.waveshare.com/ESP32-P4-Module-DEV-KIT">board’s download mode instructions</a>.</p>
    </Section>
    <Section title="5. Close the terminal connection and reset">
      <p>Leave the cable plugged in. Close any serial monitor or Python client using that port. If you opened <code>idf.py monitor</code>, press <code>Ctrl+]</code> to exit it. Then press the board’s reset button.</p>
      <p>The browser needs the port to itself. If it says the port is busy later, come back to this step and close the other program.</p>
    </Section>
    <Section title="6. Open Play and choose your port">
      <p>Open <a href="#play">Play</a> in desktop Chrome or Edge. Click <strong>Connect board</strong>, select your board’s port, and confirm the browser’s chooser.</p>
      <p>Give it about six seconds. You should see the engine name and firmware version. The included model should already be active. If you cancelled the chooser, click Connect board again. If a request times out, reset the board before reconnecting.</p>
    </Section>
    <Section title="7. Play your first move">
      <p>Choose <strong>White</strong>. Click the pawn on e2, then click e4. Wait for the engine to reply. To play Black instead, choose <strong>Black</strong> and the engine will make the opening move.</p>
      <p>Changing sides starts a new game. Download game record saves your moves as PGN, a text format that other chess programs can read.</p>
      <figure className="setup-playing"><img src="/images/esp32-p4-browser-game.jpg" width="1800" height="1350" loading="lazy" alt="My earlier browser chess game running beside the ESP32 P4 board" /><figcaption>An earlier game with my board and this website. This photo shows the setup, not a test of the latest firmware. Photograph by Ishan Kumthekar.</figcaption></figure>
      <p>If you want to follow what happens after e2e4, continue with <a href="#how-it-works">my engine walkthrough</a>. For another board or engine, use <a href="#integration">Connect your own engine</a>.</p>
    </Section>
    <details className="guide-notes"><summary>Build settings and verification notes</summary><p>The current firmware compiles with IDF 6.0.2. Flashing and testing this revision on the board are still pending. The photos are from earlier work.</p><p>The generated flash arguments use bootloader address <code>0x2000</code>, partition table address <code>0x8000</code>, and application address <code>0x10000</code>. Let the flashing command read its generated arguments. These settings are specific to this board, not every ESP32 P4 module.</p><p>See the actual <Source path="esp/sdkconfig.defaults">firmware defaults</Source>, <Source path="esp/partitions.csv">partition layout</Source> and <Source path="esp/main/app.c">firmware entry point</Source>. Closing a browser connection does not stop a search already running in v1 firmware, which is why I require reset after a timeout.</p></details>
  </Page>;
}
