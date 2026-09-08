export type ChessErrorCode = "UNSUPPORTED_BROWSER" | "SELECTION_CANCELLED" |
  "CONNECTION_FAILED" | "DISCONNECTED" | "BUSY" | "CANCELLED" | "TIMEOUT" |
  "INVALID_POSITION" | "INVALID_BUDGET" | "UNSUPPORTED_MODE" | "PROTOCOL" |
  "DEVICE_REJECTED" | "MODEL_CHANGED" | "INVALID_MODEL" | "RECOVERY_REQUIRED";

export class ChessClientError extends Error {
  constructor(readonly code: ChessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChessClientError";
  }
}
