import { ChessClientError } from "./errors";

type Entry = { run(): Promise<void>; reject(error: Error): void; cleanup(): void };

/** One active transaction and at most three waiting transactions. */
export class TransactionQueue {
  private waiting: Entry[] = [];
  private active: Entry | null = null;
  private closed = false;

  constructor(private readonly abandon: (error: Error) => void) {}

  submit<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(new ChessClientError("DISCONNECTED", "Connect the board before sending a request."));
    if (signal?.aborted) return Promise.reject(new ChessClientError("CANCELLED", "The queued request was cancelled. Nothing was sent."));
    if (this.waiting.length + Number(Boolean(this.active)) >= 4) {
      return Promise.reject(new ChessClientError("BUSY", "The request queue is full. Wait for a search to finish."));
    }
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        const active = this.active === entry;
        const error = new ChessClientError("CANCELLED", active
          ? "The request was abandoned and the port closed. The chip may still be searching."
          : "The queued request was cancelled. Nothing was sent.");
        this.waiting = this.waiting.filter(item => item !== entry);
        entry.cleanup();
        reject(error);
        if (active) this.abandon(error);
      };
      const entry: Entry = {
        reject,
        cleanup: () => signal?.removeEventListener("abort", abort),
        run: async () => { try { resolve(await operation()); } catch (error) { reject(error); } },
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.waiting.push(entry);
      this.pump();
    });
  }

  close(error: Error): void {
    this.closed = true;
    for (const entry of [...this.waiting, ...(this.active ? [this.active] : [])]) {
      entry.cleanup();
      entry.reject(error);
    }
    this.waiting = [];
  }

  private pump(): void {
    if (this.active || this.closed) return;
    const entry = this.waiting.shift();
    if (!entry) return;
    this.active = entry;
    void entry.run().finally(() => {
      entry.cleanup();
      this.active = null;
      this.pump();
    });
  }
}
