import { validateFen } from "chess.js";
import { TransactionQueue } from "./queue";
import { ChessClientError } from "./errors";
import {
  COMMAND,
  CAPABILITY,
  FrameDecoder,
  GO_BUDGET,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeBoardError,
  decodeCapabilities,
  decodeDeviceInfo,
  decodeHello,
  decodeSearchResult,
  encodeFrame,
  encodeGoPayload,
  encodePositionPayload,
  type DeviceInfo,
  type DeviceCapabilities,
  type ProtocolFrame,
  type SearchResult,
} from "./protocol";

const BAUD_RATE = 115_200;
const RESPONSE_FLAG = 0x80;
const COMMAND_TIMEOUT_MS = 5_000;
const SEARCH_TIMEOUT_MS = 10_000;

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

export type SerialApi = EventTarget & {
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
  searchTime(moveTimeMs: number): Promise<SearchResult>;
}

export type SearchOptions = ({ moveTimeMs: number; depth?: never } |
  { depth: number; moveTimeMs?: never }) & { signal?: AbortSignal };

export type ConnectionOptions = {
  /** Injected byte streams are for host tests, not evidence of USB operation. */
  serial?: SerialApi;
  settleMs?: number;
  commandTimeoutMs?: number;
  searchTimeoutMs?: number;
  resetConfirmed?: boolean;
};

let nextSession = 1;
const dirtyPorts = new WeakSet<SerialPortApi>();
const ownedPorts = new WeakSet<SerialPortApi>();

export class BoardCommandError extends Error {
  constructor(readonly command: number, readonly code: number, message: string) {
    super(message);
    this.name = "BoardCommandError";
  }
}

export class SerialBoard implements BoardTransport {
  private readonly decoder = new FrameDecoder();
  private readonly onDisconnect: BoardDisconnectHandler;
  private queue = new TransactionQueue(error => { void this.shutdown(error); });
  private state: ConnectionState = "closed";
  private serial: SerialApi | null = null;
  private port: SerialPortApi | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private openTask: Promise<void> | null = null;
  private portOpened = false;
  private readerTask: Promise<void> | null = null;
  private writeTask: Promise<void> | null = null;
  private closeTask: Promise<void> | null = null;
  private pending: PendingResponse | null = null;
  private info: DeviceInfo | null = null;
  private capabilityInfo: DeviceCapabilities | null = null;
  private draining = false;
  private session = 0;
  private readonly options: ConnectionOptions;

  constructor(onDisconnect: BoardDisconnectHandler = () => undefined, options: ConnectionOptions = {}) {
    this.onDisconnect = onDisconnect;
    this.options = options;
  }

  get sessionId(): number { return this.session; }

  get connected(): boolean {
    return this.state === "ready";
  }

  /** Null means a legacy v1 board answered the extension with unknown command. */
  get capabilities(): DeviceCapabilities | null {
    return this.capabilityInfo;
  }

  connect(): Promise<DeviceInfo> {
    if (this.state !== "closed") {
      return Promise.reject(new ChessClientError("BUSY", "A connection is already open or being selected."));
    }
    this.state = "opening";
    this.session = nextSession++;
    this.queue = new TransactionQueue(error => { void this.shutdown(error); });
    return this.connectNow();
  }

  disconnect(): Promise<void> {
    const closing = this.shutdown(null);
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new ChessClientError("DISCONNECTED",
        "The serial driver has not released the port. Close this browser tab and reset the board before reconnecting.")), 2000);
      closing.then(() => { clearTimeout(deadline); resolve(); }, error => { clearTimeout(deadline); reject(error); });
    });
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
    return this.searchBudget(GO_BUDGET.depth, depth);
  }


  searchTime(moveTimeMs: number): Promise<SearchResult> {
    return this.searchBudget(GO_BUDGET.timeMs, moveTimeMs);
  }

  /**
   * Own one position plus search transaction. This is the public operation for
   * application code because separate calls can otherwise be interleaved.
   */
  search({ fen }: { fen: string }, options: SearchOptions): Promise<SearchResult> {
    const hasTime = options.moveTimeMs !== undefined;
    const hasDepth = options.depth !== undefined;
    if (hasTime === hasDepth) {
      return Promise.reject(new ChessClientError("INVALID_BUDGET", "Choose a time budget or a depth, not both."));
    }
    const budgetType = hasTime ? GO_BUDGET.timeMs : GO_BUDGET.depth;
    const budget = hasTime ? options.moveTimeMs! : options.depth!;
    return this.enqueueAbortable(async () => {
      this.requireReady();
      this.validateBudget(budgetType, budget);
      try {
        encodePositionPayload(fen);
        if (!validateFen(fen).ok) throw new Error("invalid FEN");
      } catch (cause) {
        throw new ChessClientError("INVALID_POSITION", "Send a complete valid FEN position.", { cause });
      }
      await this.setPositionNow(fen);
      return this.searchBudgetNow(budgetType, budget);
    }, options.signal);
  }


  private searchBudget(budgetType: 1 | 2, budget: number): Promise<SearchResult> {
    return this.enqueue(async () => {
      this.requireReady();
      return this.searchBudgetNow(budgetType, budget);
    });
  }

  private async setPositionNow(fen: string): Promise<void> {
    const response = await this.exchange(
      COMMAND.position,
      encodePositionPayload(fen),
      COMMAND_TIMEOUT_MS,
    );
    if (response.payload.byteLength !== 0) {
      throw new ProtocolError("malformed position response");
    }
  }

  private async searchBudgetNow(
    budgetType: 1 | 2,
    budget: number,
  ): Promise<SearchResult> {
    this.validateBudget(budgetType, budget);
    const response = await this.exchange(
      COMMAND.go,
      encodeGoPayload(budgetType, budget, budgetType === GO_BUDGET.depth
        ? this.capabilityInfo?.maximumDepth : this.capabilityInfo?.maximumTimeMs),
      this.options.searchTimeoutMs ?? (budgetType === GO_BUDGET.timeMs ? Math.max(SEARCH_TIMEOUT_MS, budget + 5000) : SEARCH_TIMEOUT_MS),
    );
    const result = decodeSearchResult(response.payload);
    this.validateSearchModel(result);
    return result;
  }

  private async connectNow(): Promise<DeviceInfo> {
    if (this.state !== "opening") {
      throw new Error("Board connection was cancelled");
    }

    let serial: SerialApi;
    try {
      serial = this.options.serial ?? browserSerial();
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

    if (ownedPorts.has(port)) {
      this.state = "closed";
      this.serial = null;
      throw new ChessClientError("BUSY", "This port already has a client owner. Disconnect that client first.");
    }
    ownedPorts.add(port);
    this.port = port;
    try {
      if (dirtyPorts.has(port) && !this.options.resetConfirmed) {
        throw new ChessClientError("RECOVERY_REQUIRED", "Reset the board before reconnecting. Its previous search may still be running.");
      }
      const openTask = port.open({
        baudRate: BAUD_RATE,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      this.openTask = openTask;
      try { await openTask; this.portOpened = true; }
      catch (cause) { throw connectionError(cause); }
      this.openTask = null;
      if (this.state !== "opening") {
        throw new Error("Board connection was cancelled");
      }
      if (!port.readable || !port.writable) {
        throw new Error("Board serial streams are unavailable");
      }

      this.decoder.reset();
      port.addEventListener("disconnect", this.handleSerialDisconnect);
      this.draining = true;
      this.readerTask = this.readResponses(port);

      // v1 has no nonce. Discard boot logs and buffered replies before Hello.
      // Reset is required for an abandoned session, including custom engines
      // whose previous search bound cannot be inferred from reference limits.
      await new Promise(resolve => setTimeout(resolve, this.options.settleMs ?? 5500));
      if (this.state !== "opening") throw new ChessClientError("DISCONNECTED", "Connection closed during startup.");
      this.decoder.reset();
      this.draining = false;

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
      this.capabilityInfo = await this.readCapabilities();
      dirtyPorts.delete(port);
      this.state = "ready";
      return info;
    } catch (cause) {
      const error = asError(cause, "Could not connect to the board");
      await this.disconnect().catch(() => undefined);
      throw error;
    }
  }

  private async readCapabilities(): Promise<DeviceCapabilities | null> {
    try {
      const response = await this.exchange(
        COMMAND.capabilities,
        new Uint8Array(),
        COMMAND_TIMEOUT_MS,
      );
      const capabilities = decodeCapabilities(response.payload);
      if ((capabilities.features & (CAPABILITY.searchDepth | CAPABILITY.searchTime)) === 0) {
        throw new ProtocolError("board capabilities do not include search");
      }
      return capabilities;
    } catch (error) {
      if (error instanceof BoardCommandError && error.code === 4 &&
          error.command === COMMAND.capabilities) {
        return null;
      }
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
      void this.shutdown(new ChessClientError("TIMEOUT", "The board did not finish the request in time. Reset it before reconnecting. Closing the port does not stop its search."));
    }, timeoutMs === COMMAND_TIMEOUT_MS ? this.options.commandTimeoutMs ?? timeoutMs : timeoutMs);
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
      await Promise.race([writeTask, response.then(() => undefined)]);
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
        if (this.draining) continue;
        for (const frame of this.decoder.feed(value)) {
          this.acceptResponse(frame);
        }
      }
    } catch (cause) {
      if (this.port === port && this.state !== "closing") {
        void this.shutdown(cause instanceof ProtocolError ? cause : new ChessClientError("DISCONNECTED", "The board connection closed. Check the USB data cable and close other serial programs.", {cause}));
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
      this.rejectPending(new BoardCommandError(
        boardError.command,
        boardError.code,
        `Board rejected the command: ${boardError.message}`,
      ));
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
      throw new ChessClientError("MODEL_CHANGED", "The active model changed. Start a new connection and game.");
    }
  }

  private validateBudget(budgetType: 1 | 2, budget: number): void {
    const capabilities = this.capabilityInfo;
    const supported = budgetType === GO_BUDGET.depth
      ? CAPABILITY.searchDepth : CAPABILITY.searchTime;
    const maximum = budgetType === GO_BUDGET.depth
      ? capabilities?.maximumDepth ?? 12 : capabilities?.maximumTimeMs ?? 5000;
    if (capabilities && !(capabilities.features & supported)) {
      throw new ChessClientError("UNSUPPORTED_MODE", "This engine does not support the selected search mode.");
    }
    if (!Number.isInteger(budget) || budget < 1 || budget > maximum) {
      throw new ChessClientError("INVALID_BUDGET", `Choose a whole number from 1 to ${maximum} for this search mode.`);
    }
  }

  private requireReady(): void {
    if (this.state !== "ready") throw new ChessClientError("DISCONNECTED", "Connect the board before sending a request.");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return this.enqueueAbortable(operation);
  }

  private enqueueAbortable<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const session = this.session;
    return this.queue.submit(async () => {
      if (session !== this.session) throw new ChessClientError("DISCONNECTED", "This request belongs to a closed session.");
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ProtocolError || (error instanceof ChessClientError && error.code === "MODEL_CHANGED")) {
          void this.shutdown(error);
        }
        throw error;
      }
    }, signal);
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
    if (this.port && this.pending) dirtyPorts.add(this.port);
    this.session = 0;
    this.queue.close(reason ?? new ChessClientError("DISCONNECTED", "The connection was closed."));
    this.info = null;
    this.capabilityInfo = null;
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
    // Shutdown also runs from event handlers. Observe failure here while
    // preserving the rejecting promise for callers of disconnect.
    void task.catch(() => undefined);
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
      await Promise.all([
        writer?.abort(reason ?? undefined).catch(() => undefined),
        writeTask?.catch(() => undefined),
        reader?.cancel().catch(() => undefined),
        readerTask?.catch(() => undefined),
      ]);
      if (this.portOpened && port) {
        try { await port.close(); }
        catch (cause) {
          // Keep the module ownership reservation: a failed close is not
          // evidence that another client can safely take over this port.
          throw new ChessClientError("DISCONNECTED", "The serial driver could not close the port. Close this browser tab before reconnecting.", { cause });
        }
      }
      if (port) ownedPorts.delete(port);
    } finally {
      if (this.serial === serial) this.serial = null;
      if (this.port === port) this.port = null;
      this.portOpened = false;
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
      void this.shutdown(new ChessClientError("DISCONNECTED", "The board connection closed. Check the USB data cable."));
    }
  };
}

export function isWebSerialSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { serial?: SerialApi }).serial);
}

function browserSerial(): SerialApi {
  if (!isWebSerialSupported() || (typeof window !== "undefined" && !window.isSecureContext)) {
    throw new ChessClientError("UNSUPPORTED_BROWSER", "Open this page using HTTPS or localhost in desktop Chrome or Edge. You can still read the guides and watch the recording here.");
  }
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  if (!serial) throw new Error("Web Serial requires Chrome or Edge");
  return serial;
}

function validateDeviceInfo(info: DeviceInfo): void {
  if (info.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError("Board protocol is incompatible. Install firmware supporting protocol version 1.");
  }
}

function connectionError(cause: unknown): Error {
  const named = cause as { name?: unknown };
  if (named?.name === "NotFoundError") {
    return new ChessClientError("SELECTION_CANCELLED", "No port was selected. Choose Connect board when you are ready.");
  }
  if (named?.name === "SecurityError") {
    return new ChessClientError("CONNECTION_FAILED", "The browser denied serial access. Open the site directly using HTTPS and check its permissions.", { cause });
  }
  return new ChessClientError("CONNECTION_FAILED", "Could not open the port. Close any serial monitor and check the USB data cable.", { cause });
}

function asError(cause: unknown, fallback: string): Error {
  if (cause instanceof Error && cause.message) return cause;
  return new Error(fallback);
}
