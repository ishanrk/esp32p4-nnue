# Licensing and provenance

No top level license for first party source has been selected. The local client
archive uses `UNLICENSED` and is a private release candidate. Do not describe it
as freely reusable or publish it until the owner chooses terms and reviews the
provenance of contributions. A package manifest does not grant permission.

Existing notices are preserved in `web/public/THIRD_PARTY_LICENSES.txt`, the
piece image notices, reference illustration source notes and font notices.
The piece assets include Apache 2.0 notices. The fonts retain their OFL text.
The Lichess imported evaluation data is recorded as CC0 in the model manifest.
Those terms do not automatically license the chess core or model weights.

The original guide cites Code Monkey King, the Chess Programming Wiki and the
Stockfish NNUE trainer as learning references. This is not a completed source
authorship audit or evidence that all code was independently authored. Keep
those references and review adaptations before selecting a source license.

Learning references retained from the original guide are
[Code Monkey King](https://github.com/maksimKorzh/bbc),
[Chess Programming Wiki](https://www.chessprogramming.org/) and
[the Stockfish neural network trainer](https://github.com/official-stockfish/nnue-pytorch).
The browser uses React under MIT terms and chess.js under BSD 2 Clause terms.
Their installed package notices remain authoritative. Build dependencies such
as Vite and TypeScript have their own notices and are not relicensed by this
project. The client archive depends on chess.js instead of embedding its code.

The changes in this working tree include AI assisted code and documentation.
Tests support particular behaviors, not an authorship claim. No third party
license text was rewritten to satisfy the public copy punctuation rules.
