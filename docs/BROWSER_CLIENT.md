# Browser client

The source entry is `web/src/client.ts`. It does not import React.
The local package is prepared by `node web/scripts/build-client.mjs`.
The package is not published. Do not use a registry installation command.

```sh
node web/scripts/build-client.mjs
npm pack ./sdk --pack-destination ./build
```

Install the resulting archive in a separate application using its local path.
Import `SerialChess` from `@ishanrk/serial-chess`. The package requires
`chess.js` for FEN and result legality checks. Licensing is unresolved.

```ts
import { SerialChess } from "@ishanrk/serial-chess";

const button = document.querySelector<HTMLButtonElement>("#connect")!;
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const board = await SerialChess.connect();
    try {
      const result = await board.search(
        { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
        { moveTimeMs: 2000 },
      );
      console.log(board.capabilities, result);
    } finally {
      await board.disconnect();
    }
  } finally {
    button.disabled = false;
  }
});
```

For the repository source example, run `npm run dev` in `web` and open
`http://localhost:5173/client-example.html`. This page has its own button
and imports no React internals. Call connect from a user action so the browser
may open its permission chooser.

## Ownership

Each client owns one port, parser, reader and transaction queue. One request
runs and at most three wait. A fifth is rejected as BUSY. Search validates
FEN and the selected budget before sending Position, waits for its
acknowledgement, then sends Go and decodes the result under the same owner.
Legacy separate setPosition and searchDepth methods are low level operations,
not an atomic public search. Applications should use SerialChess.search.

Use exactly one of `{depth}` or `{moveTimeMs}`. The type excludes both
at once. Budgets are positive integers bounded by negotiated capabilities.
The legacy fallback uses reference depth 12 and time 5000 limits, explicitly
client knowledge rather than a capability supplied by old firmware.

An AbortSignal can cancel a queued request without sending bytes. Cancelling
active v1 work closes the port and invalidates its session. It does not stop
the chip. Disconnect rejects queued promises and the current request.
Repeated disconnect is safe. Dispose the client on page or component cleanup.
If native driver cleanup remains pending for two seconds, disconnect rejects
with `DISCONNECTED` and a recovery message. The underlying cleanup continues,
and that client remains closed to new work. This does not pretend an operating
system lock was released. Close the tab and reset before retrying a stuck driver.
If the driver rejects closing, the client reports `DISCONNECTED` and retains
its port reservation. A second client cannot take over that uncertain stream
within the same module instance. Close the tab to discard that owner.

Reset after timeout or active cancellation. Reconnect discards startup bytes
for 5500 milliseconds before a bounded handshake. Set `resetConfirmed: true`
only after physically resetting a previously abandoned board. This is a
required user action, not a software assertion that the device has stopped.
A full page reload cannot identify buffered old work by a wire nonce, because
v1 has none. Reset first even when opening a new page.

## Results and clocks

The result contains move, explicit outcome, completed depth, score,
scorePerspective, bigint nodes, deviceElapsedMs, roundTripMs,
requestedMoveTimeMs when requested, clientSessionId and clientJobId.
The two IDs are local, never claimed to be in a wire reply.
A terminal marker is checked against the supplied position and requires no
legal moves. It distinguishes checkmate and stalemate, not a negotiated draw
claim. Insufficient material and repetition remain browser game adjudication.
The client validates moves. The application must still check its own current
game and generation before applying the result.

Device elapsed time is the firmware search clock. Round trip duration currently
includes queue waiting, position exchange and search reply, measured by the
browser monotonic clock. A time budget is a request, not a deadline guarantee.
Command wait is 5 seconds. Search wait is at least 10 seconds and, for longer
custom timed budgets, budget plus 5 seconds. Depth waits are 10 seconds.
Missing generic telemetry, heap sizes and explicit mate distance are not
invented. There is no percentage progress.

## Errors and limitations

ChessClientError carries a stable code and an actionable message. Codes cover
unsupported browser, selection cancellation, connection failure, disconnection,
busy queue, cancellation, timeout, invalid position, invalid budget,
unsupported mode, protocol error, changed model and recovery required.
The public client wraps device rejection as `DEVICE_REJECTED`, with the
underlying BoardCommandError in its cause. That cause carries the wire command
and numeric code. ProtocolError is a ChessClientError with code `PROTOCOL`;
never treat malformed bytes as legacy fallback.

FEN contains the halfmove counter, not complete repetition history. A new Chess
object from FEN does not know earlier occurrences. Keep the browser game for
adjudication. Neither history input nor cooperative stop is advertised.

Play compatibility does not require reference model dimensions. The browser
currently exposes no model uploader. Close the browser connection before using
the strictly checked reference firmware upload path through Python. There is
no concurrent model activation on the browser owned port. A changed model CRC
in a search reply invalidates the session.
