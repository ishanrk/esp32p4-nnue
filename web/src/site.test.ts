import assert from "node:assert/strict";

import { Chess, DEFAULT_POSITION } from "chess.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { guideAnchorFromHash, siteViewFromHash } from "./app";
import { SerialBoard } from "./device";
import { Guide, GUIDE_RESOURCES, GUIDE_STEPS } from "./guide";
import {
  applyHumanMove,
  applyUciMove,
  describeGameResult,
  orderedSquares,
  requestChipSearch,
  resolveSide,
  type SearchTransport,
} from "./game";
import {
  COMMAND,
  FrameDecoder,
  ProtocolError,
  crc32,
  decodeBoardError,
  decodeDeviceInfo,
  decodeHello,
  decodeSearchResult,
  encodeFrame,
  encodeGoPayload,
  encodePositionPayload,
  type SearchResult,
} from "./protocol";

const HELLO_REQUEST = "5034010100004ed23a98";
const HELLO_RESPONSE = "50340181010001525562d8";
const POSITION_ACK = "503401a0000019e58040";
const POSITION_START_REQUEST =
  "503401203800726e62716b626e722f70707070707070702f382f382f382f382f50505050505050502f524e42514b424e522077204b516b71202d20302031af9fa394";
const GO_DEPTH_FIVE = "50340121050001050000000094289c";
const GO_RESPONSE =
  "503401a11d00046532653400e8ffffff0700d2040000000000001200000001efcdab895be9c951";
const POSITION_REQUIRED_ERROR = "503401ff0200210cc924da9f";
const DEVICE_INFO_RESPONSE =
  "503401821f000101010300040080002003050020030500dca5de280000040005312e312e301d9195dd";

function hex(value: string): Uint8Array {
  assert.equal(value.length % 2, 0);
  return Uint8Array.from(
    value.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function hexString(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concat(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function protocolTests(): void {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(hexString(encodeFrame(COMMAND.hello)), HELLO_REQUEST);
  assert.equal(hexString(encodeFrame(COMMAND.go, encodeGoPayload(1, 5))), GO_DEPTH_FIVE);
  assert.equal(
    hexString(encodeFrame(COMMAND.position, encodePositionPayload(DEFAULT_POSITION))),
    POSITION_START_REQUEST,
  );

  const response = hex(HELLO_RESPONSE);
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.feed(response.slice(0, 4)), []);
  const frames = decoder.feed(concat(response.slice(4), hex(POSITION_ACK)));
  assert.equal(frames.length, 2);
  assert.equal(frames[0].command, COMMAND.hello | 0x80);
  assert.equal(decodeHello(frames[0].payload), 1);
  assert.equal(frames[1].command, COMMAND.position | 0x80);
  assert.equal(frames[1].payload.length, 0);

  const bootDecoder = new FrameDecoder();
  const bootText = new TextEncoder().encode("ESP32-P4 boot\n");
  assert.deepEqual(bootDecoder.feed(concat(bootText, response.slice(0, 4))), []);
  const bootFrames = bootDecoder.feed(
    concat(response.slice(4), hex(POSITION_ACK)),
  );
  assert.equal(bootFrames.length, 2);

  const broken = response.slice();
  broken[broken.length - 1] ^= 1;
  assert.throws(() => new FrameDecoder().feed(broken), ProtocolError);
  assert.throws(
    () => new FrameDecoder().feed(encodeFrame(COMMAND.hello, new Uint8Array(), 2)),
    /unsupported response version/,
  );

  const splitMagic = new FrameDecoder();
  assert.deepEqual(splitMagic.feed(Uint8Array.of(0x50)), []);
  assert.equal(splitMagic.feed(response.slice(1))[0].command, COMMAND.hello | 0x80);

  const oversizedCandidate = Uint8Array.of(0x50, 0x34, 1, 1, 1, 4);
  const recovered = new FrameDecoder().feed(concat(oversizedCandidate, response));
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].command, COMMAND.hello | 0x80);

  const errorFrame = new FrameDecoder().feed(hex(POSITION_REQUIRED_ERROR))[0];
  const boardError = decodeBoardError(errorFrame.payload);
  assert.deepEqual(boardError, {
    command: COMMAND.go,
    code: 12,
    message: "position required",
  });

  const infoFrame = new FrameDecoder().feed(hex(DEVICE_INFO_RESPONSE))[0];
  const info = decodeDeviceInfo(infoFrame.payload);
  assert.equal(info.protocolVersion, 1);
  assert.equal(info.target, 1);
  assert.equal(info.modelState, 1);
  assert.equal(info.modelFormat, 3);
  assert.equal(info.kingBuckets, 4);
  assert.equal(info.hiddenWidth, 128);
  assert.equal(info.activeModelBytes, 328480);
  assert.equal(info.activeModelCrc32, 0x28dea5dc);
  assert.equal(info.firmwareVersion, "1.1.0");

  const resultFrame = new FrameDecoder().feed(hex(GO_RESPONSE))[0];
  const result = decodeSearchResult(resultFrame.payload);
  assert.equal(result.move, "e2e4");
  assert.equal(result.score, -24);
  assert.equal(result.depth, 7);
  assert.equal(result.nodes, 1234n);
  assert.equal(result.elapsedMs, 18);

  const startFen = DEFAULT_POSITION;
  assert.equal(new TextDecoder().decode(encodePositionPayload(startFen)), startFen);
}

function guideTests(): void {
  assert.equal(GUIDE_STEPS.length, 15);
  assert.equal(new Set(GUIDE_STEPS.map((step) => step.id)).size, GUIDE_STEPS.length);
  assert.deepEqual(
    GUIDE_STEPS.map((step) => step.number),
    Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(2, "0")),
  );
  for (const step of GUIDE_STEPS) {
    assert.doesNotMatch(step.title, /\?/);
  }
  assert.ok(GUIDE_RESOURCES.includes("https://www.chessprogramming.org/"));
  assert.ok(GUIDE_RESOURCES.includes("https://github.com/maksimKorzh/bbc"));
  assert.ok(GUIDE_RESOURCES.includes("https://github.com/official-stockfish/nnue-pytorch"));
  assert.ok(GUIDE_RESOURCES.includes("https://docs.waveshare.com/ESP32-P4-Module-DEV-KIT"));
  assert.ok(GUIDE_RESOURCES.includes("https://wicg.github.io/serial/"));

  assert.equal(siteViewFromHash("#play"), "play");
  assert.equal(siteViewFromHash("#play-content"), "play");
  assert.equal(siteViewFromHash("#guide"), "guide");
  assert.equal(siteViewFromHash("#guide-content"), "guide");
  assert.equal(siteViewFromHash("#guide-hardware"), "guide");
  assert.equal(siteViewFromHash("#guidelines"), "play");
  assert.equal(siteViewFromHash("#guide-missing"), "play");
  assert.equal(guideAnchorFromHash("#guide"), null);
  assert.equal(guideAnchorFromHash("#guide-hardware"), "guide-hardware");
  assert.equal(guideAnchorFromHash("#guide-content"), "guide-content");

  const guideMarkup = renderToStaticMarkup(createElement(Guide));
  assert.match(guideMarkup, /id="guide-content"/);
  assert.match(
    guideMarkup,
    /A Small Guide on How to Build Your Own Neural Networks Under Hardware Constraints/,
  );
  assert.match(guideMarkup, /Chess Programming Wiki/);
  assert.match(guideMarkup, /Code Monkey King/);
  assert.match(guideMarkup, /images\/reference\/alpha-beta-tree\.svg/);
  assert.match(guideMarkup, /images\/reference\/neural-network-layers\.svg/);
  for (const step of GUIDE_STEPS) {
    assert.match(guideMarkup, new RegExp(`id="${step.id}"`));
  }
}

class FakeTransport implements SearchTransport {
  positions: string[] = [];
  depths: number[] = [];

  constructor(private readonly result: SearchResult) {}

  async setPosition(fen: string): Promise<void> {
    this.positions.push(fen);
  }

  async searchDepth(depth: number): Promise<SearchResult> {
    this.depths.push(depth);
    return this.result;
  }
}

function searchResult(move: string): SearchResult {
  return {
    move,
    score: 14,
    depth: 5,
    nodes: 11241n,
    elapsedMs: 312,
    modelState: 1,
    modelCrc32: 0x28dea5dc,
  };
}

async function chessTests(): Promise<void> {
  const startingGame = new Chess();
  assert.equal(startingGame.fen(), DEFAULT_POSITION);
  assert.equal(resolveSide("white"), "w");
  assert.equal(resolveSide("black"), "b");
  assert.equal(resolveSide("random", () => 0.2), "w");
  assert.equal(resolveSide("random", () => 0.8), "b");

  const blackSquares = orderedSquares("b");
  assert.equal(blackSquares[0], "h1");
  assert.equal(blackSquares.at(-1), "a8");

  const legalGame = new Chess();
  assert.equal(applyHumanMove(legalGame, "w", "e2", "e4")?.san, "e4");
  const illegalGame = new Chess();
  assert.equal(applyHumanMove(illegalGame, "w", "e2", "e5"), null);
  assert.equal(illegalGame.fen(), DEFAULT_POSITION);

  const promotion = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
  assert.equal(
    applyHumanMove(promotion, "w", "a7", "a8", "n")?.promotion,
    "n",
  );
  assert.equal(promotion.get("a8")?.type, "n");

}

async function integrationTests(): Promise<void> {
  const chipGame = new Chess();
  applyHumanMove(chipGame, "w", "e2", "e4");
  assert.equal(applyUciMove(chipGame, "e7e5")?.san, "e5");

  const invalidChipGame = new Chess();
  applyHumanMove(invalidChipGame, "w", "e2", "e4");
  const beforeInvalid = invalidChipGame.fen();
  assert.equal(applyUciMove(invalidChipGame, "e7e4"), null);
  assert.equal(invalidChipGame.fen(), beforeInvalid);

  const fakeGame = new Chess();
  applyHumanMove(fakeGame, "w", "d2", "d4");
  const expectedFen = fakeGame.fen();
  const fake = new FakeTransport(searchResult("d7d5"));
  const result = await requestChipSearch(fake, fakeGame, 5);
  assert.equal(result?.move, "d7d5");
  assert.equal(applyUciMove(fakeGame, result?.move ?? "")?.san, "d5");
  assert.deepEqual(fake.positions, [expectedFen]);
  assert.deepEqual(fake.depths, [5]);

  const rejectedGame = new Chess();
  applyHumanMove(rejectedGame, "w", "e2", "e4");
  const rejectedFen = rejectedGame.fen();
  const rejected = await requestChipSearch(
    new FakeTransport(searchResult("a1a8")),
    rejectedGame,
    5,
  );
  assert.equal(rejected?.move, "a1a8");
  assert.equal(applyUciMove(rejectedGame, rejected?.move ?? ""), null);
  assert.equal(rejectedGame.fen(), rejectedFen);

  const mate = new Chess();
  for (const move of ["f3", "e5", "g4", "Qh4#"]) mate.move(move);
  assert.equal(mate.isCheckmate(), true);
  assert.deepEqual(describeGameResult(mate, "w"), {
    heading: "checkmate",
    detail: "chip wins",
  });
  assert.equal(applyHumanMove(mate, "w", "a2", "a3"), null);

  const stalemate = new Chess("7k/5Q2/7K/8/8/8/8/8 b - - 0 1");
  assert.deepEqual(describeGameResult(stalemate, "w"), {
    heading: "stalemate",
    detail: "draw",
  });
}

class FakeSerialPort extends EventTarget {
  readonly writes: number[] = [];
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  openedWith: Record<string, unknown> | null = null;
  closed = false;
  private controller!: ReadableStreamDefaultController<Uint8Array>;

  constructor() {
    super();
    this.readable = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
    });
    this.writable = new WritableStream({
      write: (frame) => {
        const command = frame[3];
        this.writes.push(command);
        if (command === COMMAND.go) {
          const payload = new FrameDecoder().feed(hex(GO_RESPONSE))[0].payload.slice();
          new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
            .setUint32(25, 0x28dea5dc, true);
          this.controller.enqueue(encodeFrame(COMMAND.go | 0x80, payload));
          return;
        }
        const response = {
          [COMMAND.hello]: HELLO_RESPONSE,
          [COMMAND.deviceInfo]: DEVICE_INFO_RESPONSE,
          [COMMAND.position]: POSITION_ACK,
        }[command];
        if (!response) throw new Error(`unexpected fake command ${command}`);
        this.controller.enqueue(hex(response));
      },
    });
  }

  async open(options: Record<string, unknown>): Promise<void> {
    this.openedWith = options;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

async function serialTransportTest(): Promise<void> {
  let portRequests = 0;
  const ports: FakeSerialPort[] = [];
  const serial = Object.assign(new EventTarget(), {
    requestPort: async () => {
      portRequests += 1;
      const port = new FakeSerialPort();
      ports.push(port);
      return port;
    },
  });
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serial },
  });

  try {
    const cancelledBoard = new SerialBoard();
    const cancelledConnect = assert.rejects(
      cancelledBoard.connect(),
      /connection was cancelled/,
    );
    await cancelledBoard.disconnect();
    await cancelledConnect;
    assert.equal(portRequests, 0);

    const board = new SerialBoard();
    const info = await board.connect();
    const port = ports[0];
    assert.equal(board.connected, true);
    assert.deepEqual(port.openedWith, {
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    });
    assert.equal(info.target, 1);
    await board.setPosition(DEFAULT_POSITION);
    const result = await board.searchDepth(5);
    assert.equal(result.move, "e2e4");
    assert.deepEqual(port.writes, [
      COMMAND.hello,
      COMMAND.deviceInfo,
      COMMAND.position,
      COMMAND.go,
    ]);
    await board.disconnect();
    assert.equal(board.connected, false);
    assert.equal(port.closed, true);
    assert.equal(portRequests, 1);

    let resolveDisconnect!: (error?: Error) => void;
    const disconnected = new Promise<Error | undefined>((resolve) => {
      resolveDisconnect = resolve;
    });
    const unpluggedBoard = new SerialBoard(resolveDisconnect);
    await unpluggedBoard.connect();
    const unpluggedPort = ports[1];
    unpluggedPort.dispatchEvent(new Event("disconnect"));
    assert.match((await disconnected)?.message ?? "", /disconnected/i);
    assert.equal(unpluggedBoard.connected, false);
    assert.equal(unpluggedPort.closed, true);
    assert.equal(portRequests, 2);
  } finally {
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
}

protocolTests();
guideTests();
await chessTests();
await integrationTests();
await serialTransportTest();

console.log("passed protocol guide chess and serial browser tests");
