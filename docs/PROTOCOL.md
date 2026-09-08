# Serial chess protocol

This is the local release candidate contract. It is not a claim that the hosted
website has been deployed from this working tree. The implementation is
`esp/protocol.c`; browser and Python decoders use the same golden vectors in
`test/protocol_vectors.tsv`.

## Framing version 1

All multibyte integers use little endian byte order. There are no request IDs,
unsolicited events, stop commands or history commands. Only one request may be
in flight. A successful response sets bit 7 of the command.

| Frame offset | Width | Meaning |
| :--- | :--- | :--- |
| 0 | 2 bytes | Magic `50 34`, ASCII P4 |
| 2 | u8 | Framing version, 1 |
| 3 | u8 | Command |
| 4 | u16 | Payload length, 0 through 1024 |
| 6 | length bytes | Payload |
| 6 + length | u32 | CRC of bytes starting at offset 2 through the last payload byte |

The complete frame is at most 1034 bytes. CRC is CRC32 ISO HDLC: normal
polynomial `0x04c11db7`, reflected implementation polynomial `0xedb88320`,
initial register `0xffffffff`, reflected input and output, final XOR
`0xffffffff`. Store the checksum little endian. ASCII `123456789` checks to
`0xcbf43926`. This detects corruption, not identity, authorization or attacks.

```text
Hello request:  5034010100004ed23a98
Hello response: 50340181010001525562d8
Position ack:   503401a0000019e58040
Go depth five:  50340121050001050000000094289c
```

## Commands

Offsets below are relative to the payload. An empty acknowledgement has length
zero. ASCII means printable bytes from 32 through 126. Counted text has no
terminating zero on the wire. Callback strings have a terminating zero in C.

| Command | Request | Success response |
| :--- | :--- | :--- |
| `01` Hello | Empty | One byte, protocol 1 |
| `02` Device info | Empty | Device descriptor below |
| `03` Firmware info | Empty | u8 text length at 0, 0 through 31 ASCII bytes at 1 |
| `04` Model info | Empty | 19 byte model descriptor below |
| `05` Capabilities | Empty | Separately versioned extension below |
| `06` Memory telemetry | Empty | Optional 22 byte schema below |
| `10` Model begin | u32 byte size at 0, u32 complete model CRC at 4 | Empty acknowledgement |
| `11` Model chunk | u32 byte offset at 0, 1 through 1020 data bytes at 4 | Empty acknowledgement |
| `12` Model commit | Empty | Empty acknowledgement |
| `20` Position | 1 through 127 ASCII FEN bytes | Empty acknowledgement |
| `21` Go | u8 budget kind at 0, u32 budget at 1 | 29 byte search result |
| `22` Bench | Empty | 29 byte result; reference benchmark starts at the initial position |
| `ff` Error | Never a client request | Failed command u8 at 0, error code u8 at 1 |

Go kind 1 is depth in plies, kind 2 is time in milliseconds. A ply is one move
by one side. Reference firmware supports depth 1 through 12 and time 1 through
5000. Depth and Bench also have a 5000 millisecond cap. Other engines advertise
their own limits. The dispatcher enforces advertised limits when the capability
callback exists. Without it the original reference limits apply.

Position failure must leave the previous accepted position usable. FEN includes
piece placement, active color, castling rights, en passant target, halfmove
clock and fullmove number. It does not contain game repetition history.
The parser rejects embedded zero bytes and nonprintable input. The engine
callback must additionally check the FEN and chess position.

### Device descriptor

| Offset | Type | Field |
| :--- | :--- | :--- |
| 0 | u8 | Protocol version |
| 1 | u8 | Target: 0 unspecified, 1 reference ESP32 P4 |
| 2 | u8 | Model state: 0 none, 1 embedded, 2 uploaded |
| 3 | u16 | Model format, 3 for reference; 0 if no descriptor |
| 5 | u16 | King groups |
| 7 | u16 | Hidden width |
| 9 | u32 | Maximum model bytes accepted |
| 13 | u32 | Active model bytes |
| 17 | u32 | CRC of active model |
| 21 | u32 | Transposition table bytes |
| 25 | u8 | Firmware text length, at most 31 |
| 26 | counted ASCII | Firmware version |

Total length is exactly 26 plus text length. No model is required for a
classical engine. A custom engine must not claim target 1 or reference
dimensions merely to connect. The target byte is not the general play gate.
Legacy metadata cannot provide an engine name; clients label it as legacy
rather than invent one. Model state zero with unknown legacy identity does not
prove that no classical evaluator exists. A Position and Go exchange checks
whether that device is usable.

### Model descriptor

Length 19. State u8 at 0; active bytes u32 at 1; active CRC u32 at 5;
capacity u32 at 9; format u16 at 13; groups u16 at 15; hidden width u16 at 17.

### Search result

| Offset | Type | Field |
| :--- | :--- | :--- |
| 0 | u8 | Move length, 4 or 5 |
| 1 | 5 byte field | ASCII UCI move, unused bytes zero in reference encoder |
| 6 | i32 | Score from the side to move in the accepted position |
| 10 | u16 | Last completed depth in plies |
| 12 | u64 | Visited nodes |
| 20 | u32 | Device elapsed milliseconds |
| 24 | u8 | Model state |
| 25 | u32 | Model CRC |

UCI move examples are `e2e4` and `a7a8n`. Promotion suffixes are
`q r b n`. `0000` is the explicit terminal marker when no legal move exists.
A client must reject that marker for an ordinary playable position.
The browser validates a returned move against its current game before applying
it. Protocol validation alone cannot prove chess legality.

Scores are nominal centipawns, one hundredth of a pawn, from the input side to
move. Reference search reserves values near positive or negative 30000 for mate,
with distance in plies. Raw neural predictions are clamped to 29000 for search.
There is no separate generic mate flag or mate distance field on this wire;
clients must not interpret an arbitrary custom engine score as a reference mate.
A zero score, depth, node count or elapsed time must be a real reported value,
not a client substitute for unavailable telemetry. u64 nodes use bigint in
TypeScript and arbitrary precision integers in Python. Browser round trip
duration and locally generated session and job IDs are not in this reply.

### Capabilities extension 1

Framing remains version 1. The new command is 05; its own schema version is
the first payload byte. Original firmware returns `ff 05 04` as its response
command and two payload bytes. Fall back only for that matched unknown command
error. Do not fall back on timeout, CRC error, bad text or other errors.

| Offset | Type | Field |
| :--- | :--- | :--- |
| 0 | u8 | Extension version, 1 |
| 1 | u16 | Feature flags |
| 3 | u16 | Maximum depth |
| 5 | u32 | Maximum time in milliseconds |
| 9 | u8 | Engine name length, 1 through 31 |
| 10 | u8 | Firmware identity length, 1 through 31 |
| 11 | counted ASCII | Engine name then firmware identity |

Total is exactly 11 plus both lengths. Flags bit 0 means depth, bit 1 time,
bit 2 reference model upload is available in the firmware. Bits 3 and 4 are
reserved for history and stop; neither operation is implemented. All other
bits are unknown optional information. Ignore unknown bits without enabling
operations. At least one search bit must be set, with a positive maximum.
Identity names are firmware assertions, not authenticated identities.

Upload requires a known uploader and a separately validated model descriptor.
A feature flag alone does not authorize a reference model upload.

### Errors

| Code | Meaning and action |
| :--- | :--- |
| 1 | Wrong framing version. Use supported firmware |
| 2 | Excessive frame length. Correct the length encoder |
| 3 | Bad checksum. Check bytes and CRC coverage |
| 4 | Unknown command. Use only negotiated operations |
| 5 | Invalid payload or unavailable callback. Check layout and budgets |
| 6 | Model too large. Check declared capacity |
| 7 | Wrong chunk sequence. Start a new upload from offset zero |
| 8 | Incomplete upload. Send every byte before commit |
| 9 | Invalid model. Check header, dimensions and numeric bounds |
| 10 | Storage failure. Reset and verify embedded fallback |
| 11 | Invalid FEN. Correct the position |
| 12 | Position required. Send Position and wait for its acknowledgement |
| 13 | Engine unavailable. Search allocation failed. Reset and check available memory |

Code zero is reserved for success inside callbacks and is not an error reply.
Code 13 is an additive error used by this revision. Older error values and
result layouts retain their meanings. Legacy clients may show an unknown error
for it rather than treating a resource failure as a terminal position.
Unknown commands yield error 4. Known commands with invalid lengths yield
error 5. CRC is checked before version. The C parser uses fixed storage and
resynchronizes on magic after noise or a rejected frame. It waits for the rest
of a truncated frame until reset; it has no wire nonce or automatic flush command.

## Ownership, recovery and model storage

Memory telemetry schema 1 has u8 version at 0, u8 availability mask at 1,
then five u32 byte counts at offsets 2, 6, 10, 14 and 18: internal free heap,
internal minimum free heap, PSRAM free heap, PSRAM minimum free heap and
the minimum unused stack of the protocol task. Mask bits 0 through 4 mark
available values. Missing PSRAM is unavailable, not an invented zero measurement.
Unknown command for 06 means telemetry is absent, without changing play support.
These are whole allocator and task observations, not isolated peak engine memory.
The firmware uses IDF byte units for the stack high water mark. Watchdog events
are recorded separately by the operator; no counter is invented here.

Read and write one connection from one logical owner. The portable serial loop
buffers partial output and finishes it before dispatching another request.
A callback executing synchronously cannot process a stop request while blocked
inside search. Reference search periodically yields to the scheduler, not to a
parallel protocol receiver.

After timeout or active cancellation, abandon the stream. Do not retry a search
automatically. Reset the board before reconnecting, discard startup bytes, then
perform Hello, Device info and optional Capabilities in order. The browser
discards input for 5500 milliseconds before the handshake. The reset requirement
is important for custom engines whose old work may exceed reference budgets.
A fresh parser, port reopen or quiet interval alone does not prove the old
device job ended. OS virtual ports are not proof of physical reset behavior.

Upload uses the exact 328480 byte reference model, target 1, format 3,
four groups, hidden width 128, clip 127, scales 64, two perspectives and checked
integer bounds. Offset chunks start at zero without gaps. Whole model CRC and
numeric checks remain required. Firmware borrows mapped bytes until activation
changes. It selects embedded fallback before erasing the old uploaded image,
then writes metadata and the validity marker last. Old uploaded bytes need not
survive interruption. Evaluator generation changes refresh accumulators and
clear transposition scores. Browser play exposes no arbitrary model uploader;
close its connection before using the Python uploader.
