import {
  COMMAND,
  FrameDecoder,
  GO_BUDGET,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeBoardError,
  decodeDeviceInfo,
  decodeHello,
  decodeSearchResult,
  encodeFrame,
  encodeGoPayload,
  encodePositionPayload,
  type DeviceInfo,
  type ProtocolFrame,
  type SearchResult,
} from "./protocol";

const BAUD_RATE = 115_200;
const RESPONSE_FLAG = 0x80;
const EXPECTED_TARGET = 1;
const EXPECTED_MODEL_FORMAT = 3;
const EXPECTED_KING_BUCKETS = 4;
const EXPECTED_HIDDEN_WIDTH = 128;
const EXPECTED_MODEL_BYTES = 328_480;
const MODEL_EMBEDDED = 1;
const MODEL_UPLOADED = 2;
const COMMAND_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 60_000;

type SerialOpenOptions = {
  baudRate: number;
  dataBits: 8;
  stopBits: 1;
  parity: "none";
  flowControl: "none";
};

type SerialPortApi = EventTarget & {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: SerialOpenOptions): Promise<void>;
  close(): Promise<void>;
};

type SerialApi = EventTarget & {
  requestPort(): Promise<SerialPortApi>;
};

type PendingResponse = {
  command: number;
  expectedCommand: number;
  resolve(frame: ProtocolFrame): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

type ConnectionState = "closed" | "opening" | "ready" | "closing";

type BoardDisconnectHandler = (error?: Error) => void;

export interface BoardTransport {
  readonly connected: boolean;
  connect(): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  setPosition(fen: string): Promise<void>;
  searchDepth(depth: number): Promise<SearchResult>;
}

export class SerialBoard implements BoardTransport {
  private readonly decoder = new FrameDecoder();
  private readonly onDisconnect: BoardDisconnectHandler;
  private operationTail: Promise<void> = Promise.resolve();
  private state: ConnectionState = "closed";
  private serial: SerialApi | null = null;
  private port: SerialPortApi | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private openTask: Promise<void> | null = null;
  private readerTask: Promise<void> | null = null;
  private writeTask: Promise<void> | null = null;
  private closeTask: Promise<void> | null = null;
  private pending: PendingResponse | null = null;
  private info: DeviceInfo | null = null;

  constructor(onDisconnect: BoardDisconnectHandler = () => undefined) {
    this.onDisconnect = onDisconnect;
  }

  get connected(): boolean {
    return this.state === "ready";
  }

  connect(): Promise<DeviceInfo> {
    if (this.state !== "closed") {
      return Promise.reject(new Error("Board is already connected"));
    }
    this.state = "opening";
    return this.enqueue(() => this.connectNow());
  }

  disconnect(): Promise<void> {
    return this.shutdown(null);
  }

  setPosition(fen: string): Promise<void> {
    return this.enqueue(async () => {
      this.requireReady();
      const response = await this.exchange(
        COMMAND.position,
        encodePositionPayload(fen),
        COMMAND_TIMEOUT_MS,
      );
      if (response.payload.byteLength !== 0) {
        throw new ProtocolError("malformed position response");
      }
    });
  }

  searchDepth(depth: number): Promise<SearchResult> {
    return this.enqueue(async () => {
      this.requireReady();
      const response = await this.exchange(
        COMMAND.go,
        encodeGoPayload(GO_BUDGET.depth, depth),
        SEARCH_TIMEOUT_MS,
      );
      const result = decodeSearchResult(response.payload);
      this.validateSearchModel(result);
      return result;
    });
  }

  private async connectNow(): Promise<DeviceInfo> {
    if (this.state !== "opening") {
      throw new Error("Board connection was cancelled");
    }

    let serial: SerialApi;
    try {
      serial = browserSerial();
    } catch (cause) {
      this.state = "closed";
      throw asError(cause, "Could not access Web Serial");
    }
    this.serial = serial;

    let port: SerialPortApi;
    try {
      port = await serial.requestPort();
    } catch (cause) {
      this.state = "closed";
      this.serial = null;
      throw connectionError(cause);
    }

    if (this.state !== "opening") {
      throw new Error("Board connection was cancelled");
    }

    this.port = port;
    try {
      const openTask = port.open({
        baudRate: BAUD_RATE,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      this.openTask = openTask;
      await openTask;
      this.openTask = null;
      if (this.state !== "opening") {
        throw new Error("Board connection was cancelled");
      }
      if (!port.readable || !port.writable) {
        throw new Error("Board serial streams are unavailable");
      }

      this.decoder.reset();
      port.addEventListener("disconnect", this.handleSerialDisconnect);
      this.readerTask = this.readResponses(port);

      const hello = await this.exchange(
        COMMAND.hello,
        new Uint8Array(),
        COMMAND_TIMEOUT_MS,
      );
      decodeHello(hello.payload);

      const deviceResponse = await this.exchange(
        COMMAND.deviceInfo,
        new Uint8Array(),
        COMMAND_TIMEOUT_MS,
      );
      const info = decodeDeviceInfo(deviceResponse.payload);
      validateDeviceInfo(info);
      this.info = info;
      this.state = "ready";
      return info;
    } catch (cause) {
      const error = asError(cause, "Could not connect to the board");
      await this.shutdown(null);
      throw error;
    }
  }

  private async exchange(
    command: number,
    payload: Uint8Array,
    timeoutMs: number,
  ): Promise<ProtocolFrame> {
    if (this.state !== "opening" && this.state !== "ready") {
      throw new Error("Board is not connected");
    }
    if (this.pending) throw new Error("Another board command is active");

    const writable = this.port?.writable;
    if (!writable) throw new Error("Board serial output is unavailable");

    let resolveResponse!: (frame: ProtocolFrame) => void;
    let rejectResponse!: (error: Error) => void;
    const response = new Promise<ProtocolFrame>((resolve, reject) => {
      resolveResponse = resolve;
      rejectResponse = reject;
    });
    const timeout = setTimeout(() => {
      void this.shutdown(new Error("Board response timed out"));
    }, timeoutMs);
    this.pending = {
      command,
      expectedCommand: command | RESPONSE_FLAG,
      resolve: resolveResponse,
      reject: rejectResponse,
      timer: timeout,
    };

    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    let writeTask: Promise<void> | null = null;
    try {
      writer = writable.getWriter();
      this.writer = writer;
      writeTask = writer.write(encodeFrame(command, payload));
      this.writeTask = writeTask;
      await writeTask;
    } catch (cause) {
      void this.shutdown(asError(cause, "Could not write to the board"));
    } finally {
      writer?.releaseLock();
      if (this.writer === writer) this.writer = null;
      if (this.writeTask === writeTask) this.writeTask = null;
    }
    return response;
  }

  private async readResponses(port: SerialPortApi): Promise<void> {
    try {
      const readable = port.readable;
      if (!readable) throw new Error("Board serial input is unavailable");
      const reader = readable.getReader();
      this.reader = reader;

      while (this.port === port && this.state !== "closing") {
        const { done, value } = await reader.read();
        if (done) throw new Error("Board disconnected");
        if (!value || value.byteLength === 0) continue;
        for (const frame of this.decoder.feed(value)) {
          this.acceptResponse(frame);
        }
      }
    } catch (cause) {
      if (this.port === port && this.state !== "closing") {
        void this.shutdown(asError(cause, "Board disconnected"));
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private acceptResponse(frame: ProtocolFrame): void {
    const pending = this.pending;
    if (!pending) throw new ProtocolError("Unexpected response from board");

    if (frame.command === COMMAND.error) {
      const boardError = decodeBoardError(frame.payload);
      if (boardError.command !== pending.command) {
        throw new ProtocolError("Board error did not match the request");
      }
      this.rejectPending(
        new Error(`Board rejected the command: ${boardError.message}`),
      );
      return;
    }

    if (frame.command !== pending.expectedCommand) {
      throw new ProtocolError("Board response did not match the request");
    }
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(frame);
  }

  private validateSearchModel(result: SearchResult): void {
    const info = this.info;
    if (!info) throw new Error("Board metadata is unavailable");
    if (
      result.modelState !== info.modelState ||
      result.modelCrc32 !== info.activeModelCrc32
    ) {
      throw new Error("Board model changed during the game");
    }
  }

  private requireReady(): void {
    if (this.state !== "ready") throw new Error("Board is not connected");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private rejectPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private shutdown(reason: Error | null): Promise<void> {
    if (this.state === "closed") return Promise.resolve();
    if (this.state === "closing" && this.closeTask) return this.closeTask;

    this.state = "closing";
    this.info = null;
    this.rejectPending(reason ?? new Error("Board disconnected"));

    const serial = this.serial;
    const port = this.port;
    const reader = this.reader;
    const writer = this.writer;
    const openTask = this.openTask;
    const readerTask = this.readerTask;
    const writeTask = this.writeTask;
    port?.removeEventListener("disconnect", this.handleSerialDisconnect);

    const task = this.finishShutdown(
      serial,
      port,
      reader,
      writer,
      openTask,
      readerTask,
      writeTask,
      reason,
    );
    this.closeTask = task;
    return task;
  }

  private async finishShutdown(
    serial: SerialApi | null,
    port: SerialPortApi | null,
    reader: ReadableStreamDefaultReader<Uint8Array> | null,
    writer: WritableStreamDefaultWriter<Uint8Array> | null,
    openTask: Promise<void> | null,
    readerTask: Promise<void> | null,
    writeTask: Promise<void> | null,
    reason: Error | null,
  ): Promise<void> {
    try {
      await openTask?.catch(() => undefined);
      await writer?.abort(reason ?? undefined).catch(() => undefined);
      await writeTask?.catch(() => undefined);
      await reader?.cancel().catch(() => undefined);
      await readerTask?.catch(() => undefined);
      await port?.close().catch(() => undefined);
    } finally {
      if (this.serial === serial) this.serial = null;
      if (this.port === port) this.port = null;
      if (this.openTask === openTask) this.openTask = null;
      if (this.readerTask === readerTask) this.readerTask = null;
      if (this.writer === writer) this.writer = null;
      if (this.writeTask === writeTask) this.writeTask = null;
      this.decoder.reset();
      this.state = "closed";
      this.closeTask = null;
      if (reason) {
        try {
          this.onDisconnect(reason);
        } catch {}
      }
    }
  }

  private readonly handleSerialDisconnect = (event: Event): void => {
    if (event.target !== this.port) return;
    if (this.state !== "closed" && this.state !== "closing") {
      void this.shutdown(new Error("Board disconnected"));
    }
  };
}

export function isWebSerialSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { serial?: SerialApi }).serial);
}

function browserSerial(): SerialApi {
  if (!isWebSerialSupported()) throw new Error("Web Serial requires Chrome or Edge");
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  if (!serial) throw new Error("Web Serial requires Chrome or Edge");
  return serial;
}

function validateDeviceInfo(info: DeviceInfo): void {
  if (info.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error("Board protocol is incompatible");
  }
  if (info.target !== EXPECTED_TARGET) {
    throw new Error("Connected device is not an ESP32-P4 board");
  }
  if (info.modelFormat !== EXPECTED_MODEL_FORMAT) {
    throw new Error("Board NNUE format is incompatible");
  }
  if (
    info.kingBuckets !== EXPECTED_KING_BUCKETS ||
    info.hiddenWidth !== EXPECTED_HIDDEN_WIDTH
  ) {
    throw new Error("Board NNUE architecture is incompatible");
  }
  if (
    info.modelState !== MODEL_EMBEDDED &&
    info.modelState !== MODEL_UPLOADED
  ) {
    throw new Error("Board has no active NNUE model");
  }
  if (
    info.activeModelBytes !== EXPECTED_MODEL_BYTES ||
    info.maximumModelBytes < EXPECTED_MODEL_BYTES
  ) {
    throw new Error("Board NNUE model size is incompatible");
  }
}

function connectionError(cause: unknown): Error {
  const named = cause as { name?: unknown };
  if (named?.name === "NotFoundError") {
    return new Error("No serial port selected");
  }
  if (named?.name === "SecurityError") {
    return new Error("Web Serial needs a secure Chrome or Edge page");
  }
  return asError(cause, "Could not open the board serial port");
}

function asError(cause: unknown, fallback: string): Error {
  if (cause instanceof Error && cause.message) return cause;
  return new Error(fallback);
}
