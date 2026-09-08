# Delivery evidence

This work is uncommitted on `test-api`, based on
`9d823254cf00a44a9ae13f1ab7f07ab3b24dad84`. Existing changes were preserved.
The local release manifest records the dirty tree and a source digest over
tracked and new delivered files. The base commit does not contain these edits.
No board was accessed, flashed or measured. Nothing was deployed or published.

The audit dated 7 September 2026 describes the historical base revision.
Its results are not the new results below. CNAME names the public hostname,
not its deployed commit. Vite builds `web/src/main.tsx` into `web/dist`.
CI checks the source but does not establish the public site's deployed revision.

## Completion checklist

Numbers match the sixteen completion criteria in the brief. Physical gaps are
deliberately not marked passed.

| Item | Status | Files and acceptance evidence |
| :--- | :--- | :--- |
| 1. Play journey | Implemented and tested | `app.tsx`, `styles.css`, Chromium at 1366 by 768 with board and Connect board visible |
| 2. Reference setup | Implemented with named verification gap | `guides/setup.tsx`, `QUICKSTART.md`, actual IDF image and flashing arguments. Physical flashing and first move deferred |
| 3. Developer integration | Implemented and tested | `serial_adapter.h`, `protocol.h`, `examples/host_device.c`, `INTEGRATION.md`, compiled host and ESP bindings |
| 4. Honest custom identity | Implemented and tested | Target zero classical engine with no model, legal exchange through unchanged production app using controlled host pipe bridge |
| 5. Legacy v1 | Implemented and tested | Matching unknown capability response falls back; other errors and malformed responses do not. Existing framing preserved |
| 6. Atomic search | Implemented and tested | `device.ts`, `queue.ts`, `client.ts`, concurrent callers, captured input, bounded queue, local session and job identities |
| 7. Recovery and lifecycle | Implemented with named verification gap | Abort, timeout, late bytes, reset requirement, disconnect, model identity and history tests. Physical driver and cable behavior deferred |
| 8. Strict upload | Implemented and tested | Python reference checks and independent C storage validation. No browser uploader. Custom play does not require reference dimensions |
| 9. Shared vectors | Implemented and tested | Eleven vectors in `test/protocol_vectors.tsv`, consumed by C, TypeScript and Python |
| 10. Examples and conformance | Implemented and tested | Classical and NNUE host conformance, standalone browser page, actual archive consumer and operation specific failures |
| 11. Public guide | Implemented and tested | Four destinations, lazy modules, useful old hash aliases, move and inference explanation, no editorial quotas |
| 12. Public copy | Implemented and tested | Markdown and rendered route checks preserve code, paths, negative values and legal text |
| 13. Evidence labels | Implemented and tested | Host, controlled fixtures, firmware compilation, historical photographs and deferred physical work are distinguished |
| 14. Measurement and recovery | Implemented with named verification gap | Actual storage faults, twelve observations for each of two host modes, optional telemetry and interruption procedure. Physical measurements deferred |
| 15. Local study documentation | Implemented and tested | Thirteen chapters, function walkthroughs, reconciled file inventory, hashes, memory derivation, glossary, questions and solved exercises. Local links and artifact exclusions checked |
| 16. Package preparation | Implemented and tested | Versioned local SDK and adapter archives, exports and declarations verified. Publication blocked by missing owner license and contribution review decision |

## Requirements and historical findings

| Scope | Delivered change or preserved behavior |
| :--- | :--- |
| Brief 1 and 2 | Direct browser serial retained. No accounts, keys, registration, cloud search or silent browser engine. Current tree recorded without reset or deployment claim |
| Audit 1 and 9, brief 3 and 4 | Compact Play, nearby setup and recorded route, reading sections, original palette, fonts, photographs and attributed illustration |
| Audit 2 and 3, brief 5 | Play admission separate from identity and reference model upload. Custom target passes; numeric, dimension, byte count, capacity and CRC checks remain |
| Audit 4 and 5, brief 6 | BoardTransport preserved. React independent SerialChess owns Position and Go atomically, with one active and three waiting operations |
| Audit 6, brief 7 and 9 | No invented Stop or wire IDs. Active cancel abandons and closes; queued cancel sends nothing. Reset after abandonment, startup drain and bounded handshake, no dirty stream retry |
| Audit 7 and 8, brief 4 and 9 | FEN history limits tested. Browser adjudication and legal move validation preserved. Session, game and FEN guards, both colors, promotion, terminal states and real PGN export |
| Brief 7 and 8 | Exact callback tables, units, lifetimes, errors, initialization and local reset in `INTEGRATION.md`. Exact command offsets, CRC, fallback and telemetry in `PROTOCOL.md` |
| Brief 10 | Seven steps using embedded model, connector photograph, pinned IDF build, actual flash addresses and candidate hashes. No training needed |
| Audit 10 and 11, brief 11 | Section, code box and pronoun quotas removed. Assets, SVG, routing and build gates retained. Guide loads separately, with comparable production builds |
| Audit 12, brief 12 | Historical i7 rates remain host rates. New host runs record hashes, clocks, nodes, depth, repeats and overshoot. Firmware counters report actual availability, not installed RAM as peak usage |
| Audit 13, brief 12 | Bounded existing data diagnostic reports magnitude groups, phase proxy, sign and feature overlaps. Exact checkpoint reexport verified. Missing mate and game provenance not invented |
| Audit 14, brief 12 | Actual storage source tested with erase, chunk, metadata, marker, mapping and activation faults. Valid fallback is the recovery objective, not preservation of erased old upload |
| Audit 15, brief 13 | No source license selected. Legal notices and learning references retained. Candidate is private and UNLICENSED, not claimed freely reusable |
| Brief 13 and 14 | Host matrix, sanitizer, Python, browser, package and firmware checks. Private inventory covers tracked and new paths; outputs use explicit allowlists |
| Brief 15 and 16 | Local artifacts, commands and coverage reconciled. Historical references locate current equivalents, not instructions to restore old code |

## New verification results

Environment: Node 24.12.0, npm 11.6.2, Python 3.10.12, GCC 11.4.0,
CMake 3.22.1, Clang 14.0.0, ESP IDF 6.0.2, Vite 8.2.2, Playwright 1.58.2.
Reference model: 328480 bytes, SHA256
`c406ffd526ac62f2f7d8a12b40e4ab6522928bcdc0e58cc99dc5928a646eb2f0`.
ESP IDF was available. An earlier private checkpoint claiming otherwise was corrected.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DP4_NNUE_PROFILE=4x128
cmake --build build -j4
ctest --test-dir build --output-on-failure
for profile in 8x64 8x96 16x48; do
  cmake -S . -B build-final-$profile -DCMAKE_BUILD_TYPE=Release -DP4_NNUE_PROFILE=$profile
  cmake --build build-final-$profile -j3
  ctest --test-dir build-final-$profile --output-on-failure
done
```

All 16 reference tests passed: allocation failure, rules, protocol, vectors,
partial IO, actual storage faults, inference trace, UCI, Python client, host
device, features, data, integer parity, arena, error analysis and training smoke.
All 13 tests passed for each other profile. Storage, reference trace and UCI
fixtures are profile specific. No available local Python suite was skipped.

```sh
cmake -S . -B build-final-san-nopie -DCMAKE_C_COMPILER=/home/ishan/.local/bin/clang -DCMAKE_BUILD_TYPE=Debug -DP4_SAN=ON -DCMAKE_C_FLAGS=-fno-pie -DCMAKE_EXE_LINKER_FLAGS=-no-pie
cmake --build build-final-san-nopie -j4
ctest --test-dir build-final-san-nopie --output-on-failure
source /home/ishan/esp-idf/export.sh
idf.py -C esp build
python3 esp/conformance.py --host build/p4hostdevice
python3 esp/conformance.py --host build/p4hostdevice --model models/reference.nnue
./build/p4trace models/reference.nnue
```

All 16 address and undefined sanitizer tests passed with these flags. Earlier
PIE runs intermittently exited before diagnostic output and are not marked
passed. `/usr/bin/clang-14` was unavailable; the actual compiler path above worked.
Firmware compilation succeeded, producing an application image of `0x7e780`
bytes. Image size is not peak RAM. Both host conformance modes passed legal
start, e4, promotion, castling, mate and stalemate exchanges. The actual model
trace matched refresh and restored the whole position on undo.

```sh
cd web
npm run check
npm test
npm run build
CHROMIUM_PATH=/home/ishan/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome node scripts/browser-check.mjs
```

Type checking, protocol and game tests, production assets and browser checks
passed. Browser checks exercised host search through the production app, both
colors, a labeled legal promotion fixture, chooser cancellation, error and
promotion focus, standalone client, route assets, laptop and narrow layouts,
computed text contrast, reduced motion and 200 percent CSS zoom. Native toolbar zoom and a screen reader
were not manually tested. Screenshots are actual local captures. Before images
show the start of the resumed pass, not the historical deployed audit site.

Rebuilding historical source in a disposable directory using the same Vite
production mode yielded 101.56 kB gzip initial JavaScript. The new Play and
shared device chunks total about 83.5 kB gzip; the guide is a separate lazy
chunk. This modest improvement does not establish a severe earlier performance defect.

Run these from the repository root for local candidates:

```sh
node web/scripts/build-client.mjs
npm pack ./sdk --pack-destination ./build
node web/scripts/check-package.mjs
python3 tools/prepare_release.py
```

The package consumer installs the actual archive, compiles its NodeNext example
and checks runtime exports, notices and exclusions. The adapter archive contains
shared source and the real host example. The firmware archive contains explicit
build outputs and flashing arguments. Its manifest records the exact source
digest and hashes. Host measurement, bounded error diagnostic and equal budget
arena commands and observations are in [measurements](MEASUREMENTS.md).

## Remaining prerequisites

Physical USB permissions, connector behavior, flashing, cable removal, power
interruption, runtime heap, stack, watchdog observations and complete game capture
are deferred by instruction. Their software harnesses and procedures are delivered.
A new board needs its own platform implementation and conformance run. Host
conformance does not prove physical compatibility.

Publication requires an owner license and contribution provenance decision,
then a separate publication instruction. Historical shards lack original mate
flags and game provenance, so a proven pure nonmate metric and whole game split
separation cannot be recovered from those inputs. No expensive retraining or
long strength tournament was launched to obscure that limitation.
