# Serial chess client candidate

This local archive exports SerialChess, ChessClientError and TypeScript types.
It is not a published registry package. Build from the repository with
`node web/scripts/build-client.mjs`, then run `npm pack ./sdk --pack-destination ./build`.

Import SerialChess from `@ishanrk/serial-chess` after installing that local
archive in a browser application. Call connect from a button, then search with
one FEN and one depth or time budget. Disconnect when finished.

Compatibility: framing version 1, optional capabilities schema 1. Unknown command
for capabilities alone selects the legacy path. Changes to the meaning of an
existing wire field require a new schema. Breaking JavaScript changes require a
new major version after a stable release. This candidate has no stability promise.

History and cooperative stop are absent. Active cancellation closes the port but
does not stop the chip. Reset before reconnecting. No reference model uploader
is exposed by this client. See the repository browser client and protocol guides
for queue limits, deadlines, ownership and score semantics.

First party licensing is undecided. Do not publish this candidate or describe
it as freely reusable until the owner resolves the terms and attribution.
