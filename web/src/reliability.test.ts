import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { SerialBoard, BoardCommandError } from "./device";
import { SerialChess } from "./client";
import { ChessClientError } from "./errors";
import { COMMAND, FrameDecoder, encodeFrame, decodeSearchResult, decodeCapabilities, encodePositionPayload } from "./protocol";
import { applyUciMove, applyHumanMove, describeGameResult, orderedSquares, gamePgn } from "./game";

const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const bytes = (text: string) => new TextEncoder().encode(text);
const vectors = readFileSync(new URL("../../test/protocol_vectors.tsv", import.meta.url), "utf8").trim().split("\n");
for (const line of vectors) {
  const [name, hex] = line.split("\t");
  const frame = Uint8Array.from(Buffer.from(hex, "hex"));
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.feed(bytes("boot text\n")), []);
  const decoded = [...frame].flatMap(byte => decoder.feed(Uint8Array.of(byte)));
  assert.equal(decoded.length, 1, name);
  assert.deepEqual(encodeFrame(decoded[0].command, decoded[0].payload), frame, name);
}
assert.throws(() => encodePositionPayload(DEFAULT_POSITION + "\0"));
assert.throws(() => new FrameDecoder().feed(Uint8Array.of(80, 52, 1, 1, 1, 4)));
assert.throws(() => decodeSearchResult(new Uint8Array(29)));

/** Deliberate simulated device. Real host integration is tested separately. */
class Port extends EventTarget {
  readable!: ReadableStream<Uint8Array>;
  writable!: WritableStream<Uint8Array>;
  controller!: ReadableStreamDefaultController<Uint8Array>;
  commands: number[] = [];
  positions: string[] = [];
  game = new Chess();
  hold = false;
  legacyCode: number | null = null;
  badCaps = false;
  illegal = false;
  forceTerminal = false;
  closed = false;
  features = 3;
  modelCrc = 0;
  open() {
    this.closed = false;
    this.readable = new ReadableStream({start: c => { this.controller = c; }});
    this.writable = new WritableStream({write: frame => this.respond(frame)});
    return Promise.resolve();
  }
  close() { this.closed = true; return Promise.resolve(); }
  emit(command: number, payload = new Uint8Array()) { this.controller.enqueue(encodeFrame(command, payload)); }
  reply() {
    const move = this.illegal ? "a1a8" : this.game.moves({verbose: true})[0];
    const uci = this.forceTerminal ? "0000" : typeof move === "string" ? move : move ? move.from + move.to + (move.promotion ?? "") : "0000";
    const payload = new Uint8Array(29);
    payload[0] = uci.length; payload.set(bytes(uci), 1);
    new DataView(payload.buffer).setBigUint64(12, 9007199254740993n, true);
    new DataView(payload.buffer).setUint32(25, this.modelCrc, true);
    this.emit(COMMAND.go | 128, payload);
  }
  respond(data: Uint8Array) {
    const frame = new FrameDecoder().feed(data)[0];
    this.commands.push(frame.command);
    switch (frame.command) {
      case COMMAND.hello: this.emit(129, Uint8Array.of(1)); break;
      case COMMAND.deviceInfo: {
        const payload = new Uint8Array(27); payload[0] = 1; payload[25] = 1; payload[26] = 65;
        this.emit(130, payload); break;
      }
      case COMMAND.capabilities: {
        if (this.legacyCode !== null) { this.emit(255, Uint8Array.of(5, this.legacyCode)); break; }
        const payload = Uint8Array.of(1,this.features,128,32,0,0x60,0xea,0,0,6,4,...bytes("CustomHost"));
        if (this.badCaps) payload[11] = 0;
        this.emit(133, payload); break;
      }
      case COMMAND.position: {
        const fen = new TextDecoder().decode(frame.payload);
        this.positions.push(fen); this.game.load(fen); this.emit(160); break;
      }
      case COMMAND.go: if (!this.hold) this.reply(); break;
      default: throw new Error("unexpected request");
    }
  }
}
function setup(port = new Port()) {
  let choices = 0;
  const serial = Object.assign(new EventTarget(), {requestPort: async () => { choices++; return port; }});
  const options = {serial, settleMs: 0, commandTimeoutMs: 50, searchTimeoutMs: 80};
  const board = new SerialBoard(undefined, options);
  return {port, board, options, choices: () => choices};
}
const position = {fen: DEFAULT_POSITION};
const limit = {depth: 1} as const;
const code = (expected: string) => (error: unknown) => error instanceof ChessClientError && error.code === expected;

{
  const {options, port} = setup();
  const client = await SerialChess.connect(options);
  port.hold = true;
  const request = {fen: DEFAULT_POSITION};
  const limits = {moveTimeMs: 20};
  const pending = client.search(request, limits);
  request.fen = "not a position";
  limits.moveTimeMs = 999;
  await delay(); port.reply();
  const result = await pending;
  assert.equal(result.requestedMoveTimeMs, 20);
  await client.disconnect();
}

{
  const {board, port, options} = setup();
  await board.connect();
  port.close = async () => { throw new Error("driver close failure fixture"); };
  await assert.rejects(board.disconnect(), code("DISCONNECTED"));
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
  await assert.rejects(new SerialBoard(undefined, options).connect(), code("BUSY"));
}

{
  const {board, port} = setup();
  await board.connect();
  port.modelCrc = 1;
  await assert.rejects(board.search(position, limit), code("MODEL_CHANGED"));
  await board.disconnect();
  assert.equal(board.sessionId, 0);
}
{
  const port = new Port();
  const {options} = setup(port);
  const board = new SerialBoard(undefined, {...options, settleMs: 20});
  const connection = board.connect();
  await delay(2);
  // Old complete search reply buffered before the new handshake is discarded.
  port.reply();
  await connection;
  await board.search(position, limit);
  await board.disconnect();
}
{
  const {board, port} = setup();
  await board.connect();
  let release!: () => void;
  port.writable = new WritableStream({write: () => new Promise<void>(resolve => {release = resolve;})});
  const search = board.search(position, limit);
  await assert.rejects(search, code("TIMEOUT"));
  await assert.rejects(board.disconnect(), code("DISCONNECTED"));
  release();
  await board.disconnect();
  assert.equal(port.writable.locked, false);
  assert.equal(port.readable.locked, false);
}

{
  const {board, options, port} = setup();
  await board.connect();
  const competitor = new SerialBoard(undefined, options);
  await assert.rejects(competitor.connect(), code("BUSY"));
  assert.equal(port.closed, false);
  await board.search(position, limit);
  await board.disconnect();
}

{
  const {port, board, choices} = setup();
  const connect = board.connect();
  await assert.rejects(board.connect(), code("BUSY")); await connect;
  assert.equal(choices(), 1);
  const session = board.sessionId;
  assert.ok(session > 0);
  assert.equal(board.capabilities?.engineName, "Custom");
  const before = port.commands.length;
  await assert.rejects(board.search(position, {depth: 33}), code("INVALID_BUDGET"));
  await assert.rejects(board.search({fen: "invalid"}, limit), code("INVALID_POSITION"));
  assert.equal(port.commands.length, before);
  const next = new Chess(); next.move("e4");
  const [a,b] = await Promise.all([board.search(position, {depth: 20}), board.search({fen: next.fen()}, {moveTimeMs: 6000})]);
  assert.equal(a.nodes, 9007199254740993n);
  assert.ok(applyUciMove(new Chess(), a.move));
  assert.ok(applyUciMove(next, b.move));
  assert.deepEqual(port.commands.slice(before), [32,33,32,33]);
  await board.disconnect(); await board.disconnect();
  assert.equal(board.sessionId, 0); assert.equal(port.readable.locked, false); assert.equal(port.writable.locked, false);
}
{
  const {port, board} = setup(); await board.connect(); port.hold = true;
  const first = board.search(position, limit);
  const abort = new AbortController();
  const queued = board.search(position, {...limit,signal:abort.signal});
  const third = board.search(position, limit);
  abort.abort(); await assert.rejects(queued, code("CANCELLED"));
  await delay(); port.hold = false; port.reply(); await first; await third;
  assert.equal(port.positions.length, 2); assert.equal(board.connected, true);
  await board.disconnect();
}
{
  const {port, board} = setup(); await board.connect(); port.hold = true;
  const controller = new AbortController();
  const active = board.search(position, {...limit,signal:controller.signal});
  const queued = board.search(position, limit);
  const observed = Promise.allSettled([active,queued]);
  await delay(); controller.abort();
  assert.ok((await observed).every(item => item.status === "rejected"));
  await board.disconnect(); assert.equal(port.closed,true);
  await assert.rejects(board.connect(), code("RECOVERY_REQUIRED"));
}
{
  const {port, board} = setup(); await board.connect(); port.hold = true;
  await assert.rejects(board.search(position, limit), code("TIMEOUT"));
  await board.disconnect(); assert.equal(port.closed, true);
}
{
  const {port, board} = setup(); await board.connect(); port.hold = true;
  const promises = Array.from({length: 4}, () => board.search(position, limit));
  const observed = Promise.allSettled(promises);
  await assert.rejects(board.search(position, limit), code("BUSY"));
  port.dispatchEvent(new Event("disconnect"));
  assert.ok((await observed).every(item => item.status === "rejected"));
  await board.disconnect();
}
for (const errorCode of [4,5]) {
  const port = new Port(); port.legacyCode = errorCode;
  const {board} = setup(port);
  if (errorCode === 4) { await board.connect(); assert.equal(board.capabilities, null); await board.search(position, limit); await board.disconnect(); }
  else await assert.rejects(board.connect(), BoardCommandError);
}
{
  const port = new Port(); port.badCaps = true;
  await assert.rejects(setup(port).board.connect()); assert.equal(port.closed, true);
}
{
  const port = new Port(); port.features = 1;
  const {board} = setup(port); await board.connect();
  await assert.rejects(board.search(position, {moveTimeMs:2}), code("UNSUPPORTED_MODE"));
  await board.disconnect();
}
{
  const {port, options} = setup(); const client = await SerialChess.connect(options);
  const result = await client.search(position, limit); assert.equal(result.outcome, "move");
  assert.ok(result.clientSessionId > 0); assert.ok(result.roundTripMs >= 0);
  const terminal = await client.search({fen:"7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"}, limit);
  assert.equal(terminal.outcome,"checkmate");
  port.forceTerminal = true;
  // Insufficient material ends a browser game but does not mean no legal
  // moves. The v1 marker has the latter, narrower wire meaning.
  await assert.rejects(client.search({fen:"7k/8/8/8/8/8/8/K7 w - - 0 1"},limit), code("PROTOCOL"));
  port.forceTerminal = false;
  port.illegal = true; await assert.rejects(client.search(position,limit), code("PROTOCOL"));
  await client.disconnect();
}
const promotion = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
assert.equal(applyHumanMove(promotion,"w","a7","a8","n")?.promotion,"n");
assert.equal(orderedSquares("b")[0],"h1");
const mate = new Chess(); for(const move of ["f3","e5","g4","Qh4#"]) mate.move(move);
assert.equal(describeGameResult(mate,"w")?.heading,"checkmate");
assert.match(gamePgn(mate), /0-1/);
const repeated = new Chess(); for(const move of ["Nf3","Nf6","Ng1","Ng8","Nf3","Nf6","Ng1","Ng8"]) repeated.move(move);
assert.equal(repeated.isThreefoldRepetition(), true);
assert.equal(new Chess(repeated.fen()).isThreefoldRepetition(), false);
console.log("Shared vectors, queue lifecycle, budgets, custom identity, legality and history checks passed");
