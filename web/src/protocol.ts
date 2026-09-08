import { ChessClientError } from "./errors";
export const PROTOCOL_VERSION = 1;
const PROTOCOL_MAX_PAYLOAD = 1024;
const PROTOCOL_MAX_FEN = 127;
const PROTOCOL_MAX_FIRMWARE_VERSION = 31;

const MAGIC_FIRST = 0x50;
const MAGIC_SECOND = 0x34;
const HEADER_SIZE = 6;
const CRC_SIZE = 4;

export const COMMAND = {
  hello: 0x01,
  deviceInfo: 0x02,
  firmwareInfo: 0x03,
  modelInfo: 0x04,
  capabilities: 0x05,
  modelBegin: 0x10,
  modelChunk: 0x11,
  modelCommit: 0x12,
  position: 0x20,
  go: 0x21,
  bench: 0x22,
  error: 0xff,
} as const;

export const CAPABILITY = {
  searchDepth: 1 << 0,
  searchTime: 1 << 1,
  modelUpload: 1 << 2,
  history: 1 << 3,
  stop: 1 << 4,
} as const;

export const GO_BUDGET = {
  depth: 1,
  timeMs: 2,
} as const;

export type ProtocolFrame = {
  command: number;
  payload: Uint8Array;
};

export type BoardError = {
  command: number;
  code: number;
  message: string;
};

export type DeviceInfo = {
  protocolVersion: number;
  target: number;
  modelState: number;
  modelFormat: number;
  kingBuckets: number;
  hiddenWidth: number;
  maximumModelBytes: number;
  activeModelBytes: number;
  activeModelCrc32: number;
  transpositionTableBytes: number;
  firmwareVersion: string;
};

export type DeviceCapabilities = {
  extensionVersion: number;
  features: number;
  maximumDepth: number;
  maximumTimeMs: number;
  engineName: string;
  firmwareIdentity: string;
};

export type SearchResult = {
  move: string;
  score: number;
  depth: number;
  nodes: bigint;
  elapsedMs: number;
  modelState: number;
  modelCrc32: number;
};

const ERROR_MESSAGES: Readonly<Record<number, string>> = {
  0: "none",
  1: "unsupported protocol version",
  2: "invalid frame length",
  3: "checksum mismatch",
  4: "unknown command",
  5: "invalid payload",
  6: "model too large",
  7: "model chunk out of sequence",
  8: "model upload incomplete",
  9: "model invalid",
  10: "storage failure",
  11: "invalid fen",
  12: "position required",
  13: "The engine could not start a search. Reset the board and check available memory.",
};

export class ProtocolError extends ChessClientError {
  constructor(message: string) {
    super("PROTOCOL", message);
    this.name = "ProtocolError";
  }
}

export function crc32(data: Uint8Array): number {
  let state = 0xffffffff;
  for (const byte of data) {
    state ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(state & 1);
      state = (state >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (state ^ 0xffffffff) >>> 0;
}

export function encodeFrame(
  command: number,
  payload: Uint8Array = new Uint8Array(),
  version = PROTOCOL_VERSION,
): Uint8Array {
  requireByte("command", command);
  requireByte("version", version);
  if (payload.byteLength > PROTOCOL_MAX_PAYLOAD) {
    throw new RangeError("payload exceeds protocol maximum");
  }

  const frame = new Uint8Array(HEADER_SIZE + payload.byteLength + CRC_SIZE);
  const view = dataView(frame);
  frame[0] = MAGIC_FIRST;
  frame[1] = MAGIC_SECOND;
  frame[2] = version;
  frame[3] = command;
  view.setUint16(4, payload.byteLength, true);
  frame.set(payload, HEADER_SIZE);
  const checksumOffset = HEADER_SIZE + payload.byteLength;
  view.setUint32(
    checksumOffset,
    crc32(frame.subarray(2, checksumOffset)),
    true,
  );
  return frame;
}

export class FrameDecoder {
  private buffer = new Uint8Array();

  feed(data: Uint8Array): ProtocolFrame[] {
    this.append(data);
    const frames: ProtocolFrame[] = [];

    while (true) {
      const start = findMagic(this.buffer);
      if (start < 0) {
        this.buffer = this.buffer.at(-1) === MAGIC_FIRST
          ? this.buffer.slice(-1)
          : new Uint8Array();
        return frames;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);
      if (this.buffer.byteLength < HEADER_SIZE) return frames;

      const header = dataView(this.buffer);
      const payloadSize = header.getUint16(4, true);
      if (payloadSize > PROTOCOL_MAX_PAYLOAD) {
        this.reset();
        throw new ProtocolError("response exceeds the maximum frame length");
      }

      const frameSize = HEADER_SIZE + payloadSize + CRC_SIZE;
      if (this.buffer.byteLength < frameSize) return frames;

      const frame = this.buffer.slice(0, frameSize);
      this.buffer = this.buffer.slice(frameSize);
      const checksumOffset = HEADER_SIZE + payloadSize;
      const expectedChecksum = dataView(frame).getUint32(checksumOffset, true);
      const actualChecksum = crc32(frame.subarray(2, checksumOffset));
      if (expectedChecksum !== actualChecksum) {
        throw new ProtocolError("response checksum mismatch");
      }
      if (frame[2] !== PROTOCOL_VERSION) {
        throw new ProtocolError(`unsupported response version ${frame[2]}`);
      }
      frames.push({
        command: frame[3],
        payload: frame.slice(HEADER_SIZE, checksumOffset),
      });
    }
  }

  reset(): void {
    this.buffer = new Uint8Array();
  }

  private append(data: Uint8Array): void {
    if (data.byteLength === 0) return;
    const combined = new Uint8Array(this.buffer.byteLength + data.byteLength);
    combined.set(this.buffer);
    combined.set(data, this.buffer.byteLength);
    this.buffer = combined;
  }
}

export function decodeBoardError(payload: Uint8Array): BoardError {
  requirePayloadSize("board error", payload, 2);
  const code = payload[1];
  return {
    command: payload[0],
    code,
    message: ERROR_MESSAGES[code] ?? `unknown error ${code}`,
  };
}

export function decodeHello(payload: Uint8Array): number {
  requirePayloadSize("hello", payload, 1);
  const version = payload[0];
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError(`unsupported board protocol ${version}`);
  }
  return version;
}

export function decodeDeviceInfo(payload: Uint8Array): DeviceInfo {
  if (payload.byteLength < 26) {
    throw new ProtocolError("malformed device info response");
  }
  const view = dataView(payload);
  const firmwareSize = payload[25];
  if (firmwareSize > PROTOCOL_MAX_FIRMWARE_VERSION) {
    throw new ProtocolError("malformed device version string");
  }
  if (payload.byteLength !== 26 + firmwareSize) {
    throw new ProtocolError("malformed device version string");
  }
  return {
    protocolVersion: payload[0],
    target: payload[1],
    modelState: payload[2],
    modelFormat: view.getUint16(3, true),
    kingBuckets: view.getUint16(5, true),
    hiddenWidth: view.getUint16(7, true),
    maximumModelBytes: view.getUint32(9, true),
    activeModelBytes: view.getUint32(13, true),
    activeModelCrc32: view.getUint32(17, true),
    transpositionTableBytes: view.getUint32(21, true),
    firmwareVersion: decodeAscii(payload.subarray(26), true),
  };
}

export function decodeSearchResult(payload: Uint8Array): SearchResult {
  requirePayloadSize("search", payload, 29);
  const moveSize = payload[0];
  if (moveSize > 5) throw new ProtocolError("malformed search move");
  const move = decodeAscii(payload.subarray(1, 1 + moveSize), true);
  if (!/^(0000|[a-h][1-8][a-h][1-8][qrbn]?)$/.test(move)) {
    throw new ProtocolError("response does not contain a UCI move or terminal marker");
  }
  const view = dataView(payload);
  return {
    move,
    score: view.getInt32(6, true),
    depth: view.getUint16(10, true),
    nodes: view.getBigUint64(12, true),
    elapsedMs: view.getUint32(20, true),
    modelState: payload[24],
    modelCrc32: view.getUint32(25, true),
  };
}

/** Decode optional extension one. A legacy board reports unknown command. */
export function decodeCapabilities(payload: Uint8Array): DeviceCapabilities {
  if (payload.byteLength < 11) {
    throw new ProtocolError("malformed capability response");
  }
  const view = dataView(payload);
  const engineSize = payload[9];
  const firmwareSize = payload[10];
  if (payload[0] !== 1 || engineSize === 0 || firmwareSize === 0 || engineSize > 31 || firmwareSize > 31 ||
      payload.byteLength !== 11 + engineSize + firmwareSize) {
    throw new ProtocolError("malformed capability response");
  }
  const features = view.getUint16(1, true);
  if (((features & CAPABILITY.searchDepth) && view.getUint16(3, true) === 0) ||
      ((features & CAPABILITY.searchTime) && view.getUint32(5, true) === 0)) {
    throw new ProtocolError("a supported search mode needs a positive maximum budget");
  }
  return {
    extensionVersion: payload[0],
    features: view.getUint16(1, true),
    maximumDepth: view.getUint16(3, true),
    maximumTimeMs: view.getUint32(5, true),
    engineName: decodeAscii(payload.subarray(11, 11 + engineSize), true),
    firmwareIdentity: decodeAscii(payload.subarray(11 + engineSize), true),
  };
}

export function encodePositionPayload(fen: string): Uint8Array {
  if (fen.length === 0) throw new RangeError("fen must not be empty");
  const payload = encodeAscii(fen, "fen");
  if (payload.byteLength > PROTOCOL_MAX_FEN) {
    throw new RangeError("fen exceeds protocol maximum");
  }
  return payload;
}

export function encodeGoPayload(
  budgetType: (typeof GO_BUDGET)[keyof typeof GO_BUDGET],
  budget: number,
  maximum = budgetType === GO_BUDGET.depth ? 12 : 5_000,
): Uint8Array {
  if (budgetType !== GO_BUDGET.depth && budgetType !== GO_BUDGET.timeMs) {
    throw new RangeError("unknown search budget type");
  }
  if (!Number.isInteger(budget) || budget < 1 || budget > maximum || budget > 0xffffffff) {
    throw new RangeError("search budget is outside the protocol range");
  }
  const payload = new Uint8Array(5);
  payload[0] = budgetType;
  dataView(payload).setUint32(1, budget, true);
  return payload;
}

export function modelStateName(state: number): string {
  if (state === 0) return "none";
  if (state === 1) return "embedded";
  if (state === 2) return "uploaded";
  return `unknown-${state}`;
}

function dataView(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function requireByte(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an unsigned byte`);
  }
}

function requirePayloadSize(
  name: string,
  payload: Uint8Array,
  expected: number,
): void {
  if (payload.byteLength !== expected) {
    throw new ProtocolError(`malformed ${name} response`);
  }
}

function findMagic(data: Uint8Array): number {
  for (let index = 0; index + 1 < data.byteLength; index += 1) {
    if (data[index] === MAGIC_FIRST && data[index + 1] === MAGIC_SECOND) {
      return index;
    }
  }
  return -1;
}

function encodeAscii(text: string, name: string): Uint8Array {
  const encoded = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) throw new RangeError(`${name} must contain printable ASCII`);
    encoded[index] = code;
  }
  return encoded;
}

function decodeAscii(data: Uint8Array, strict: boolean): string {
  let decoded = "";
  for (const byte of data) {
    if (byte < 0x20 || byte > 0x7e) {
      if (strict) throw new ProtocolError("malformed ascii response");
      decoded += "\ufffd";
    } else {
      decoded += String.fromCharCode(byte);
    }
  }
  return decoded;
}
