import { Chess } from "chess.js";
import { SerialBoard, BoardCommandError, type SearchOptions, type ConnectionOptions } from "./device";
import { ChessClientError } from "./errors";
import type { DeviceCapabilities, DeviceInfo, SearchResult } from "./protocol";

export type ChessSearch = {
  move: string;
  score: number;
  depth: number;
  nodes: bigint;
  deviceElapsedMs: number;
  /** This id is created by the browser. It is not present in v1 replies. */
  clientJobId: number;
  /** Locally generated connection identity. Not a wire request identifier. */
  clientSessionId: number;
  outcome: "move" | "checkmate" | "stalemate";
  scorePerspective: "sideToMove";
  /** Includes queue waiting, position acknowledgement and search exchange. */
  roundTripMs: number;
  requestedMoveTimeMs?: number;
};

/**
 * Small browser client that owns one Web Serial connection. It is deliberately
 * independent of React so another page can use the same protocol safely.
 */
export class SerialChess {
  private nextJobId = 1;

  private constructor(private readonly board: SerialBoard, readonly info: DeviceInfo) {}

  static async connect(options: ConnectionOptions = {}): Promise<SerialChess> {
    const board = new SerialBoard(undefined, options);
    const info = await board.connect().catch(rethrowDeviceError);
    return new SerialChess(board, info);
  }

  get capabilities(): DeviceCapabilities | null {
    return this.board.capabilities;
  }

  async search(
    request: { fen: string },
    options: SearchOptions,
  ): Promise<ChessSearch> {
    const fen = request.fen;
    const requestedMoveTimeMs = options.moveTimeMs;
    const clientJobId = this.nextJobId++;
    const clientSessionId = this.board.sessionId;
    const started = performance.now();
    const result = await this.board.search({fen}, options).catch(rethrowDeviceError);
    if (!this.board.connected || clientSessionId !== this.board.sessionId) {
      throw new ChessClientError("DISCONNECTED", "The result belongs to a closed connection.");
    }
    const game = new Chess(fen);
    let outcome: ChessSearch["outcome"] = "move";
    if (result.move === "0000") {
      if (game.moves().length) throw new ChessClientError("PROTOCOL", "The engine returned no move while legal moves exist.");
      outcome = game.isCheckmate() ? "checkmate" : "stalemate";
    } else {
      try { game.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4), promotion: result.move[4] }); }
      catch (cause) { throw new ChessClientError("PROTOCOL", "The engine returned an illegal move.", { cause }); }
    }
    return {
      move: result.move,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      deviceElapsedMs: result.elapsedMs,
      clientJobId,
      clientSessionId,
      outcome,
      scorePerspective: "sideToMove",
      roundTripMs: performance.now() - started,
      requestedMoveTimeMs,
    };
  }

  disconnect(): Promise<void> {
    return this.board.disconnect();
  }
}

export type { SearchOptions, SearchResult };
export { ChessClientError } from "./errors";
export type { ChessErrorCode } from "./errors";

function rethrowDeviceError(error: unknown): never {
  if (error instanceof BoardCommandError) {
    throw new ChessClientError("DEVICE_REJECTED", error.message, {cause: error});
  }
  throw error;
}
