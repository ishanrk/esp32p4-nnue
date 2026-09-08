# Connect another engine

Start with `examples/host_device.c`. It is a complete executable using the real
portable chess core, not a constant best move fixture. With no arguments it
uses classical evaluation and reports target zero with no model descriptor.
With `--model models/reference.nnue` it reports the actual loaded model.
Neither mode runs on a microcontroller.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 2
python3 -m pip install chess
python3 esp/conformance.py --host ./build/p4hostdevice
python3 esp/conformance.py --host ./build/p4hostdevice --model models/reference.nnue
```

The C implementation is split into engine callbacks, protocol dispatcher
and platform input and output. Include `protocol.h` and `serial_adapter.h`.
Link `esp/protocol.c` and `esp/serial_adapter.c`. There is no need to copy CRC
code or change the website. First party redistribution terms remain undecided;
see [licensing status](LICENSE_STATUS.md).

## Engine callback table

These are the implemented signatures in `board_protocol_backend_t`, not
proposed future functions. All run on the single protocol loop execution
context. The context pointer is owned by the caller and must remain valid until
polling stops. Callback pointers are copied, not the pointed engine state.

```c
void (*get_info)(void *context, board_device_info_t *info);
void (*get_capabilities)(void *context, board_device_capabilities_t *capabilities);
board_protocol_error_t (*set_position)(void *context, const char *fen);
board_protocol_error_t (*search)(void *context, uint8_t budget_type,
                                 uint32_t budget, board_search_result_t *result);
```

### Information callbacks

Fill the supplied zero initialized output structure before returning. Output
storage belongs to the dispatcher and may not be retained. Names are printable
ASCII, terminated in the 32 byte arrays, at most 31 visible bytes.
Use real firmware and engine identities. No neural model descriptor is needed
for a classical engine. Capabilities list only implemented budget modes and
their positive maximum values. Unknown optional flags do not grant operations.

These callbacks are quick, nonblocking observations. They cannot return an error
in this v1 adapter table. Initialization must finish successfully before the
protocol loop begins. If initialization fails, do not expose a ready loop.
The reference implementation is `get_device_info` and
`get_device_capabilities` in `esp/main/app.c`; host equivalents are in
`examples/host_device.c`.

### Position callback

The dispatcher checks a length of 1 through 127 and printable ASCII, copies
the payload into a local 128 byte buffer and adds a terminating zero.
The pointer is borrowed only for the callback. Parse or copy it before return.
The existing signature is terminated rather than length carrying; use
bounded parsing, never retain that temporary pointer.

Return `BOARD_ERROR_NONE` on success or `BOARD_ERROR_POSITION_INVALID`
for invalid FEN. Success replaces position and starts a fresh search history.
Failure leaves the old accepted position usable. The host `set_position`
and firmware `set_protocol_position` first parse into a candidate
`position_t`, then assign it. Map an existing engine FEN parser to this
candidate and commit pattern. Do not apply a partially parsed position.

### Search callback

Budget kind 1 is depth; kind 2 is milliseconds. The dispatcher validates the
value against the reported capability before calling. Populate all result
fields from actual search data. Output is borrowed and only valid during the
call. Return zero on success, `BOARD_ERROR_POSITION_REQUIRED` if no position
is accepted, or another defined error code for failure.
The reference adapters return `BOARD_ERROR_ENGINE_UNAVAILABLE` if search
context allocation fails. They do not turn allocation failure into a terminal
move. The root remains usable and a later search can succeed.

This callback may block up to the documented engine search bound. It must
preserve the accepted root position, including rule state and accumulators,
after exploring moves. The reference `search_protocol_position` uses
`search_position` with a maximum recursion of 12, scheduler polling and a
5000 millisecond cap on depth searches. The host `search` maps the same
engine limits. A different engine maps its own timed or depth search here.

Return a legal UCI move, with promotion suffix when needed, or `0000` for
no legal move. The result score perspective is the input side to move.
See [exact result offsets](PROTOCOL.md). Error results must leave the root
usable or require a documented reset; never report success with invented data.

### Initialization and reset

Engine initialization and destruction are local lifecycle operations, not wire
commands. In the complete host example, `initialize_chess`, optional
`load_nnue` and bounded table allocation occur before adapter initialization.
Cleanup frees the table and model after the loop. Firmware initializes embedded
storage and a 256 KiB table before accepting serial traffic.

`chess_serial_adapter_reset` clears parser and pending bytes only. It must be
called while polling is stopped, not concurrently with search. Resetting the
engine position or evaluator is separately owned by the engine author. There is
no reset command in protocol v1. Neither stop nor game history callbacks are
published because those extensions are not implemented.

## Platform callback table

```c
int (*read)(void *context, uint8_t *dst, size_t capacity, size_t *count);
int (*write)(void *context, const uint8_t *src, size_t length, size_t *count);
uint64_t (*monotonic_ms)(void *context);
void (*yield)(void *context);
```

Install these in `chess_serial_io_t`. Read writes at most capacity bytes,
then reports the actual count. Write consumes at most length bytes and reports
the actual count. Both pointers are borrowed for the call only. Neither callback
may retain a buffer. Success is zero, including a zero count when no progress
is available. Read returns 1 for orderly EOF; negative one means failure.
A write failure is fatal to the serial session.

Clock values are nondecreasing milliseconds from a monotonic clock, not wall
dates. Yield gives the scheduler a chance to run instead of busy spinning.
Keep IO callbacks nonblocking or bounded. The host POSIX read blocks waiting
for input, acceptable for its dedicated loop; it reads available bytes rather
than waiting to fill 256 bytes. UART reads wait one scheduler tick. Platform
writes must not block beyond their own platform bound; the adapter deadline
cannot interrupt a blocked callback.

The adapter owns a 256 byte receive buffer, a 1034 byte response buffer and
the fixed protocol parser. It allocates nothing from received lengths. It feeds
bytes until a response is ready, then drains that response completely before
dispatching more input. Partial writes retain the offset. No progress yields;
an unfinished response fails after 1000 milliseconds. A failure returns to the
caller for cleanup, not an endless retry.

Host mappings are `serial_read`, `serial_write`, `monotonic_ms` and
`platform_yield`. ESP mappings are `read_uart_chunk`,
`write_protocol_bytes`, `serial_clock` and `serial_yield`.
USB boot text is discarded during startup. Do not interleave logs with a
binary response. Use a separate console or disable runtime protocol port logs.

## Main loop and build

Optional memory telemetry uses
`void (*get_telemetry)(void *context, board_telemetry_t *telemetry)`.
The dispatcher zero initializes the borrowed output. Fill real byte counts and
their availability bits synchronously, without retaining the pointer. This
callback cannot fail; leave unavailable fields unmarked. Firmware maps it to
`get_telemetry` in `esp/main/app.c`. The host example omits it. The command
layout is separately versioned in the protocol reference. It is not needed to play.

The complete main loop, including callbacks and cleanup, is compiled from
`examples/host_device.c`. The essential binding is:

```c
chess_serial_adapter_t adapter;
if (chess_serial_adapter_init(&adapter, &backend, &io)) return 1;
int status;
while ((status = chess_serial_adapter_poll(&adapter)) == 0) {}
```

This excerpt requires the `backend` and `io` tables defined by the complete
example. The example has no missing function bodies. Cross compilation for a
new board is the developer's platform responsibility, not a generic firmware
flash promise. Reference ESP IDF integration is compiled in
`esp/main/CMakeLists.txt`.

After mapping the callbacks to the real board, reset and run
`python3 esp/conformance.py --port PORT`. Close the checker. Open Play,
select Connect board and inspect the reported engine identity. The same
application accepts compatible identities without a source whitelist change.

## Compatibility evidence

| Configuration | Current evidence | Not established |
| :--- | :--- | :--- |
| Reference ESP32 P4 firmware | IDF 6.0.2 compilation | New physical flashing or gameplay |
| Host classical engine | Interactive real search conformance | USB timing and wiring |
| Host reference NNUE | Executable model loading and protocol route | Physical NNUE throughput |
| Legacy v1 response fixture | Browser fallback regression test | Every historical firmware image |
| Arbitrary microcontroller | Contract and integration instructions | Compatibility until its adapter is tested |
| Browser without Web Serial | Reading and photographs remain available | Live chip connection |

A host run is useful evidence about bytes and engine behavior. It cannot prove
USB permissions, power recovery or physical memory availability.
