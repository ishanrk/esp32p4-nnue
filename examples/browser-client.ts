import { SerialChess } from "../web/src/client";

async function playOneReply(currentFen: string): Promise<void> {
  const board = await SerialChess.connect();
  try {
    const result = await board.search(
      { fen: currentFen },
      { moveTimeMs: 2000 },
    );
    console.log(result.move, result.deviceElapsedMs);
  } finally {
    await board.disconnect();
  }
}

const button = document.querySelector<HTMLButtonElement>("#connect");
button?.addEventListener("click", async () => {
  button.disabled = true;
  const status = document.querySelector<HTMLElement>("#status")!;
  try {
    await playOneReply("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    status.textContent = "Reply received. See the browser console for the move and device time.";
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Connection failed"; }
  finally { button.disabled = false; }
});
