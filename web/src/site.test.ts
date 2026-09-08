import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import "./reliability.test";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Guide } from "./guide";
import { SerialBoard } from "./device";
import { applyHumanMove, applyUciMove, gamePgn, requestChipSearch, type SearchTransport } from "./game";
import {
  COMMAND, FrameDecoder, ProtocolError, crc32, decodeCapabilities,
  decodeSearchResult, encodeFrame, encodeGoPayload, encodePositionPayload,
  type SearchResult,
} from "./protocol";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)?.map((item) => Number.parseInt(item, 16)) ?? []);
}

function result(move: string): SearchResult {
  return { move, score: 14, depth: 5, nodes: 11241n, elapsedMs: 312, modelState: 1, modelCrc32: 0x28dea5dc };
}

function protocolTests(): void {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(encodeFrame(COMMAND.hello).length, 10);
  assert.equal(encodePositionPayload(DEFAULT_POSITION).byteLength, 56);
  assert.equal(encodeGoPayload(2, 2000)[0], 2);
  assert.throws(() => encodeGoPayload(2, 5001), RangeError);
  const corrupt = encodeFrame(COMMAND.hello | 0x80, Uint8Array.of(1));
  corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => new FrameDecoder().feed(corrupt), ProtocolError);
  const capabilities = decodeCapabilities(Uint8Array.of(
    1, 3, 0, 12, 0, 0x88, 0x13, 0, 0, 6, 4,
    ...new TextEncoder().encode("Custom"), ...new TextEncoder().encode("Host"),
  ));
  assert.equal(capabilities.engineName, "Custom");
  assert.equal(capabilities.maximumTimeMs, 5000);
}

class FakeTransport implements SearchTransport {
  readonly positions: string[] = [];
  async search(request: { fen: string }, options: { moveTimeMs: number }): Promise<SearchResult> {
    this.positions.push(request.fen);
    assert.equal(options.moveTimeMs, 2000);
    return result("e7e5");
  }
}

async function gameTests(): Promise<void> {
  const game = new Chess();
  assert.equal(applyHumanMove(game, "w", "e2", "e4")?.san, "e4");
  const transport = new FakeTransport();
  const reply = await requestChipSearch(transport, game, 2000);
  assert.equal(reply?.move, "e7e5");
  assert.equal(applyUciMove(game, reply?.move ?? "")?.san, "e5");
  assert.match(gamePgn(game), /\[Result "\*"\]/);
  assert.equal(transport.positions.length, 1);
  assert.equal(applyUciMove(game, "a1a8"), null);
}

class FakePort extends EventTarget {
  readonly commands: number[] = [];
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  closed = false;
  private controller!: ReadableStreamDefaultController<Uint8Array>;

  constructor(private readonly legacy = false) {
    super();
    this.readable = new ReadableStream({ start: (controller) => { this.controller = controller; } });
    this.writable = new WritableStream({ write: (bytes: Uint8Array) => this.respond(bytes) });
  }

  async open(): Promise<void> {}
  async close(): Promise<void> { this.closed = true; }

  private respond(bytes: Uint8Array): void {
    const frame = new FrameDecoder().feed(bytes)[0];
    this.commands.push(frame.command);
    if (frame.command === COMMAND.hello) return this.enqueue(COMMAND.hello | 0x80, Uint8Array.of(1));
    if (frame.command === COMMAND.deviceInfo) {
      const info = new Uint8Array(29);
      info[0] = 1; info[25] = 3; info.set(new TextEncoder().encode("1.2"), 26);
      return this.enqueue(COMMAND.deviceInfo | 0x80, info);
    }
    if (frame.command === COMMAND.capabilities) {
      if (this.legacy) return this.enqueue(COMMAND.error, Uint8Array.of(COMMAND.capabilities, 4));
      return this.enqueue(COMMAND.capabilities | 0x80, Uint8Array.of(
        1, 3, 0, 12, 0, 0x88, 0x13, 0, 0, 6, 4,
        ...new TextEncoder().encode("Custom"), ...new TextEncoder().encode("Host"),
      ));
    }
    if (frame.command === COMMAND.position) return this.enqueue(COMMAND.position | 0x80, new Uint8Array());
    if (frame.command === COMMAND.go) {
      const payload = new Uint8Array(29);
      payload[0] = 4; payload.set(new TextEncoder().encode("e7e5"), 1);
      new DataView(payload.buffer).setUint32(25, 0, true);
      return this.enqueue(COMMAND.go | 0x80, payload);
    }
    throw new Error("unexpected command");
  }

  private enqueue(command: number, payload: Uint8Array): void {
    this.controller.enqueue(encodeFrame(command, payload));
  }
}

async function serialTests(): Promise<void> {
  const port = new FakePort();
  const serial = Object.assign(new EventTarget(), { requestPort: async () => port });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serial } });
  try {
    const board = new SerialBoard(undefined, {settleMs: 0});
    await board.connect();
    assert.equal(board.capabilities?.engineName, "Custom");
    const response = await board.search({ fen: DEFAULT_POSITION }, { moveTimeMs: 2000 });
    assert.equal(response.move, "e7e5");
    assert.deepEqual(port.commands, [COMMAND.hello, COMMAND.deviceInfo, COMMAND.capabilities, COMMAND.position, COMMAND.go]);
    await board.disconnect();
    assert.equal(port.closed, true);

    const legacyPort = new FakePort(true);
    Object.assign(serial, { requestPort: async () => legacyPort });
    const legacyBoard = new SerialBoard(undefined, {settleMs: 0});
    await legacyBoard.connect();
    assert.equal(legacyBoard.capabilities, null);
    await legacyBoard.disconnect();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
}

function publicCopyTests(): void {
  const setup = renderToStaticMarkup(createElement(Guide, { view: "setup" }));
  const integration = renderToStaticMarkup(createElement(Guide, { view: "integration" }));
  const how = renderToStaticMarkup(createElement(Guide, { view: "how" }));
  assert.match(setup, /Set up a board/);
  assert.match(setup, /Connect board/);
  assert.match(integration, /same website/);
  assert.match(integration, /model upload/i);
  assert.match(how, /principal_variation_search/);
  assert.match(how, /undo_move/);
  assert.match(how, /refresh_nnue_perspective/);
  assert.match(setup, /esp32-p4-browser-game.jpg/);
  assert.match(how, /esp32-p4-test-setup.jpg/);
  const stepNumbers = [...setup.matchAll(/<h2>(\d+)\./g)].map(match => Number(match[1]));
  assert.ok(stepNumbers.length > 0);
  assert.deepEqual(stepNumbers, stepNumbers.map((_, index) => index + 1));
  const root = resolve(import.meta.dirname, "../..");
  for (const markup of [setup, integration, how, renderToStaticMarkup(createElement(Guide, {view:"results"}))]) {
    assert.doesNotMatch(markup, /href="[^"]*\.md(?:[?#][^"]*)?"/);
    for (const match of markup.matchAll(/href="https:\/\/github.com\/ishanrk\/esp32p4-nnue\/blob\/main\/([^"]+)"/g)) {
      assert.ok(existsSync(resolve(root, match[1])), `source link exists: ${match[1]}`);
    }
  }
  // Published callback and loop excerpts must continue to match the compiled example.
  const hostSource = readFileSync(resolve(root, "examples/host_device.c"), "utf8").replace(/\s+/g, " ");
  const decodeText = (text: string) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  for (const block of integration.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)) {
    const code = decodeText(block[1]);
    if (code.startsWith("static board_protocol_error_t set_position") || code.startsWith("board_protocol_backend_t backend")) {
      assert.ok(hostSource.includes(code.replace(/\s+/g, " ")), "guide excerpt matches executable host example");
    }
  }
}

protocolTests();
await gameTests();
await serialTests();
publicCopyTests();
console.log("passed protocol, client, game, and public copy tests");
