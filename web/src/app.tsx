import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

import { Chessboard } from "./board";
import { SerialBoard, isWebSerialSupported } from "./device";
import {
  applyHumanMove,
  applyUciMove,
  describeGameResult,
  gamePgn,
  legalMovesFrom,
  moveHistory,
  requestChipSearch,
  resolveSide,
  type SideChoice,
} from "./game";
import { modelStateName, type DeviceInfo, type SearchResult } from "./protocol";

const SEARCH_TIME_MS = 2_000;
const SIDE_CHOICES: Array<{ value: SideChoice; label: string }> = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "random", label: "Random" },
];
const PROMOTIONS: Array<{ value: PieceSymbol; label: string }> = [
  { value: "q", label: "Queen" },
  { value: "r", label: "Rook" },
  { value: "b", label: "Bishop" },
  { value: "n", label: "Knight" },
];

type ConnectionState = "disconnected" | "connecting" | "connected" | "disconnecting";
type PromotionChoice = { from: Square; to: Square };
export type SiteView = "play" | "setup" | "integration" | "how" | "results";

const Guide = lazy(async () => import("./guide").then((module) => ({ default: module.Guide })));

export function App() {
  const gameRef = useRef(new Chess());
  const boardRef = useRef<SerialBoard | null>(null);
  const gameToken = useRef(0);
  const activeSearch = useRef<string | null>(null);
  const promotionReturnFocus = useRef<Square | null>(null);
  const [, renderGame] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [sideChoice, setSideChoice] = useState<SideChoice>("white");
  const [humanColor, setHumanColor] = useState<Color>("w");
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<Pick<Move, "from" | "to"> | null>(null);
  const [promotion, setPromotion] = useState<PromotionChoice | null>(null);
  const [thinking, setThinking] = useState(false);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [activity, setActivity] = useState("board not connected");
  const errorFocusPending = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorFocusPending.current && statusRef.current) {
      errorFocusPending.current = false;
      statusRef.current.focus();
    }
  }, [activity]);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [siteHash, setSiteHash] = useState(() => window.location.hash);
  const siteView = siteViewFromHash(siteHash);
  const serialSupported = isWebSerialSupported();
  const serialReady = serialSupported && window.isSecureContext;
  const game = gameRef.current;
  const legalTargets = new Set(
    selected ? legalMovesFrom(game, selected).map((move) => move.to) : [],
  );
  const gameResult = describeGameResult(game, humanColor);
  const boardOrientation = connection === "connected"
    ? humanColor
    : sideChoice === "black" ? "b" : "w";
  const boardDisabled = connection !== "connected" || thinking || blocked || promotion !== null ||
    game.isGameOver() || game.turn() !== humanColor;

  useEffect(() => {
    return () => {
      gameToken.current += 1;
      const board = boardRef.current;
      boardRef.current = null;
      void board?.disconnect().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    function updateSiteHash(): void {
      setSiteHash(window.location.hash);
    }
    window.addEventListener("hashchange", updateSiteHash);
    return () => window.removeEventListener("hashchange", updateSiteHash);
  }, []);

  useEffect(() => {
    document.title = siteView === "play"
      ? "Play | ESP32 P4 NNUE"
      : `${siteView === "setup" ? "Set up a board" : siteView === "integration" ? "Connect your own engine" : siteView === "results" ? "Results" : "How it works"} | ESP32 P4 NNUE`;
    window.scrollTo(0, 0);
  }, [siteView]);

  useEffect(() => {
    if (!thinking) {
      setThinkingElapsedMs(0);
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      setThinkingElapsedMs(Math.round(performance.now() - started));
    }, 100);
    return () => window.clearInterval(timer);
  }, [thinking]);

  useEffect(() => {
    if (promotion || thinking || !promotionReturnFocus.current) return;
    const square = promotionReturnFocus.current;
    requestAnimationFrame(() => {
      const button = document.querySelector<HTMLButtonElement>(`[data-square="${square}"]`);
      button?.focus();
      if (document.activeElement === button) promotionReturnFocus.current = null;
    });
  }, [promotion, thinking]);

  function refreshGame(): void {
    renderGame((revision) => revision + 1);
  }

  function handleUnexpectedDisconnect(board: SerialBoard, error?: Error): void {
    if (boardRef.current !== board) return;
    errorFocusPending.current = Boolean(error);
    gameToken.current += 1;
    boardRef.current = null;
    setConnection("disconnected");
    setDeviceInfo(null);
    setThinking(false);
    setSelected(null);
    setPromotion(null);
    setActivity(error?.message || "board disconnected");
  }

  async function connectBoard(): Promise<void> {
    if (!serialReady || connection !== "disconnected" || boardRef.current) return;
    setConnection("connecting");
    setActivity("connecting");
    setBlocked(false);
    const board = new SerialBoard((error) => handleUnexpectedDisconnect(board, error), { resetConfirmed });
    setResetConfirmed(false);
    boardRef.current = board;
    try {
      const info = await board.connect();
      if (boardRef.current !== board) return;
      setDeviceInfo(info);
      setConnection("connected");
      startGame(board);
    } catch (error) {
      if (boardRef.current !== board) return;
      boardRef.current = null;
      errorFocusPending.current = true;
      setConnection("disconnected");
      setDeviceInfo(null);
      setActivity(errorMessage(error, "could not connect board"));
      await board.disconnect().catch(() => undefined);
    }
  }

  async function disconnectBoard(): Promise<void> {
    const board = boardRef.current;
    if (!board) return;
    gameToken.current += 1;
    boardRef.current = null;
    setConnection("disconnecting");
    setDeviceInfo(null);
    setThinking(false);
    setSelected(null);
    setPromotion(null);
    setActivity("disconnecting");
    try {
      await board.disconnect();
      setActivity("board disconnected");
    } catch (error) {
      errorFocusPending.current = true;
      setActivity(errorMessage(error, "The serial driver could not close. Close this tab before reconnecting."));
    } finally {
      setConnection("disconnected");
    }
  }

  function startGame(board: SerialBoard | null = boardRef.current, choice = sideChoice): void {
    const token = gameToken.current + 1;
    gameToken.current = token;
    const nextGame = new Chess();
    const nextHumanColor = resolveSide(choice);
    gameRef.current = nextGame;
    setHumanColor(nextHumanColor);
    setSelected(null);
    setLastMove(null);
    setPromotion(null);
    setSearchResult(null);
    setBlocked(false);
    setActivity(nextHumanColor === "w" ? "your move" : "chip thinking");
    refreshGame();
    if (board && nextHumanColor === "b") {
      void playChipTurn(nextGame, board, token);
    }
  }

  async function playChipTurn(
    activeGame: Chess,
    board: SerialBoard,
    token: number,
  ): Promise<void> {
    if (activeGame.isGameOver()) return;
    const session = board.sessionId;
    const positionIdentity = activeGame.fen();
    const job = `${session}:${token}:${positionIdentity}`;
    if (activeSearch.current === job) return;
    activeSearch.current = job;
    setThinking(true);
    setSelected(null);
    setActivity("chip thinking");
    try {
      const caps = board.capabilities;
      const result = caps && !(caps.features & 2)
        ? await board.search({fen: positionIdentity}, {depth: Math.min(5, caps.maximumDepth)})
        : await requestChipSearch(board, activeGame, Math.min(SEARCH_TIME_MS, caps?.maximumTimeMs ?? SEARCH_TIME_MS));
      if (token !== gameToken.current || board !== boardRef.current || session !== board.sessionId || activeGame.fen() !== positionIdentity) return;
      if (!result) return;
      const move = applyUciMove(activeGame, result.move);
      if (!move) {
        errorFocusPending.current = true;
        setBlocked(true);
        setActivity("The engine returned an illegal move. The position was not changed. Reconnect to try again.");
        return;
      }
      setLastMove({ from: move.from, to: move.to });
      setSearchResult(result);
      setActivity(`chip played ${result.move}`);
      refreshGame();
    } catch (error) {
      if (token !== gameToken.current) return;
      errorFocusPending.current = true;
      setBlocked(true);
      setActivity(errorMessage(error, "board request failed"));
    } finally {
      if (activeSearch.current === job) activeSearch.current = null;
      if (token === gameToken.current) setThinking(false);
    }
  }

  function chooseSquare(square: Square): void {
    if (boardDisabled) return;
    const piece = game.get(square);
    if (!selected) {
      if (piece?.color === humanColor) setSelected(square);
      return;
    }

    const candidates = legalMovesFrom(game, selected).filter(
      (move) => move.to === square,
    );
    if (candidates.length > 0) {
      if (candidates.some((move) => move.isPromotion())) {
        setPromotion({ from: selected, to: square });
      } else {
        finishHumanMove(selected, square);
      }
      return;
    }

    setSelected(piece?.color === humanColor ? square : null);
  }

  function finishHumanMove(
    from: Square,
    to: Square,
    promotionPiece?: PieceSymbol,
  ): void {
    if (promotionPiece) promotionReturnFocus.current = from;
    const move = applyHumanMove(game, humanColor, from, to, promotionPiece);
    setPromotion(null);
    setSelected(null);
    if (!move) return;
    setLastMove({ from: move.from, to: move.to });
    setSearchResult(null);
    refreshGame();
    if (game.isGameOver()) return;
    const board = boardRef.current;
    if (board) void playChipTurn(game, board, gameToken.current);
  }

  function handlePromotionKeys(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelPromotion();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function cancelPromotion(): void {
    if (promotion) promotionReturnFocus.current = promotion.from;
    setPromotion(null);
  }

  const statusHeading = gameResult?.heading ?? activity;
  const statusDetail = gameResult?.detail ?? (
    blocked ? "start a new game or reconnect" :
    connection === "connected" && game.inCheck() && !thinking ? "check" : ""
  );

  return (
    <div className="site-shell">
      <a
        className="skip-link"
        href={siteView === "play" ? "#play-content" : "#guide-content"}
        onClick={event => { event.preventDefault(); document.querySelector<HTMLElement>("main")?.focus(); }}
      >
        skip to content
      </a>
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {siteView === "play" ? "play view" : "guide view"}
      </span>
      <header className="site-header">
        <nav aria-label="Main navigation" className="nav-inner">
          <a aria-label="ESP32 P4 NNUE play" className="wordmark" href="#play">
            <span aria-hidden="true" className="wordmark-initials">P4</span>
            <span>ESP32 P4 NNUE</span>
          </a>
          <div className="nav-links">
            <a aria-current={siteView === "play" ? "page" : undefined} href="#play">Play</a>
            <a aria-current={siteView === "setup" ? "page" : undefined} href="#setup">Set up a board</a>
            <a aria-current={siteView === "integration" ? "page" : undefined} href="#integration">Connect your own engine</a>
            <a aria-current={siteView === "how" ? "page" : undefined} href="#how-it-works">How it works</a>
            <a href="https://github.com/ishanrk/esp32p4-nnue">Source</a>
          </div>
        </nav>
      </header>

      {siteView !== "play" ? <Suspense fallback={<main className="guide-page" id="guide-content"><p>Loading guide</p></main>}><Guide view={siteView} /></Suspense> : (
        <main className="play-page" id="play-content" tabIndex={-1}>
          <span aria-hidden="true" className="view-anchor" id="play" />
          <section className="play-intro" aria-labelledby="page-title">
            <div className="play-intro-copy">
              <h1 id="page-title">ESP32 P4 chess engine</h1>
              <p>
                I built this chess engine to run on an ESP32 P4. Connect your board to play, or read the guides to follow the code.
              </p>
            </div>
          </section>

          <section className="play-area" aria-label="Hardware chess game">
            <div className="board-column">
              <div className="board-frame">
                <Chessboard
                  disabled={boardDisabled}
                  game={game}
                  lastMove={lastMove}
                  legalTargets={legalTargets}
                  onSquare={chooseSquare}
                  orientation={boardOrientation}
                  selected={selected}
                />
                {thinking && (
                  <div className="thinking-label" aria-hidden="true">
                    Thinking: {(thinkingElapsedMs / 1000).toFixed(1)} seconds elapsed
                  </div>
                )}
                {gameResult && (
                  <div aria-live="polite" className="game-result-layer">
                    <div className="game-result-message">
                      <strong>{gameResult.heading}</strong>
                      <span>{gameResult.detail}</span>
                    </div>
                  </div>
                )}
                {promotion && (
                  <div
                    aria-label="Choose promotion piece"
                    aria-modal="true"
                    className="promotion-layer"
                    onKeyDown={handlePromotionKeys}
                    role="dialog"
                  >
                    <div className="promotion-picker">
                      <strong>promote to</strong>
                      <div className="promotion-options">
                        {PROMOTIONS.map((option, index) => (
                          <button
                            autoFocus={index === 0}
                            className="action-button"
                            key={option.value}
                            onClick={() => finishHumanMove(
                              promotion.from,
                              promotion.to,
                              option.value,
                            )}
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        onClick={cancelPromotion}
                        type="button"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="game-controls" aria-label="Game controls">
              <header className="controls-heading">
                <div>
                  <strong>Board connection</strong>
                  <small>USB data cable, compatible firmware, desktop Chrome or Edge</small>
                </div>
              </header>

              <div className="connection-row">
                <button
                  className={`connect-button ${connection === "connected" ? "is-connected" : ""}`}
                  aria-label={connection === "connected" ? "disconnect board" : undefined}
                  disabled={!serialReady || connection === "connecting" || connection === "disconnecting"}
                  onClick={() => connection === "connected" ? void disconnectBoard() : void connectBoard()}
                  title={connection === "connected" ? "disconnect board" : undefined}
                  type="button"
                >
                  {connection === "connecting" ? "connecting" :
                    connection === "disconnecting" ? "disconnecting" :
                    connection === "connected" ? "Disconnect board" : "Connect board"}
                </button>
                {!serialReady && (
                  <p className="support-note">Use Chrome or Edge on a secure page to connect a board</p>
                )}
              </div>
              <p className="journey-links"><a href="#setup">Set up your board</a><a href="#how-it-works">Read the engine guide</a><a href="#results">Results</a></p>
              {thinking && <p>{boardRef.current?.capabilities && !(boardRef.current.capabilities.features & 2)
                ? `Requested depth ${Math.min(5, boardRef.current.capabilities.maximumDepth)}`
                : `Requested ${Math.min(SEARCH_TIME_MS, boardRef.current?.capabilities?.maximumTimeMs ?? SEARCH_TIME_MS) / 1000} seconds. This is a search budget, not an exact completion time.`}</p>}
              <details className="troubleshooting"><summary>Troubleshooting</summary>
                <p>Close any serial monitor. After a timeout or abandoned search, press the board reset button before connecting again. Startup waits briefly to discard old replies and boot messages.</p>
                <label><input type="checkbox" checked={resetConfirmed} onChange={event => setResetConfirmed(event.target.checked)} /> I reset the board before this connection</label>
                <p>The connection uses 115200 baud, a serial transfer speed. No personal port identifiers are exported.</p>
              </details>

              <fieldset
                className="side-selector"
                disabled={thinking || connection === "connecting" || connection === "disconnecting"}
              >
                <legend>choose a side</legend>
                <div className="side-options">
                  {SIDE_CHOICES.map((option) => (
                    <button
                      aria-pressed={sideChoice === option.value}
                      className="side-button"
                      key={option.value}
                      onClick={() => { setSideChoice(option.value); if (connection === "connected") startGame(boardRef.current, option.value); }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {connection === "connected" && (
                  <span className="resolved-side">
                    playing {humanColor === "w" ? "white" : "black"}
                  </span>
                )}
              </fieldset>

              <div ref={statusRef} tabIndex={-1} aria-atomic="true" aria-live="polite" className="game-status">
                <div>
                  <strong>{statusHeading}</strong>
                  {statusDetail && <span>{statusDetail}</span>}
                </div>
              </div>

              {searchResult && (
                <dl className="engine-response">
                  <div><dt>depth</dt><dd>{searchResult.depth}</dd></div>
                  <div><dt>time</dt><dd>{searchResult.elapsedMs.toLocaleString()} ms</dd></div>
                  <div><dt>nodes</dt><dd>{searchResult.nodes.toLocaleString()}</dd></div>
                </dl>
              )}

              <button
                className="action-button new-game-button"
                disabled={connection !== "connected" || thinking}
                onClick={() => startGame()}
                type="button"
              >
                new game
              </button>

              <button
                className="text-button"
                disabled={game.history().length === 0}
                onClick={() => downloadPgn(game)}
                type="button"
              >
                Download game record
              </button>

              <MoveHistory game={game} />

              {deviceInfo && (
                <p className="device-line">
                  <span>{boardRef.current?.capabilities?.engineName || "Legacy version 1 engine"}</span>
                  <span>Firmware: {boardRef.current?.capabilities?.firmwareIdentity} {deviceInfo.firmwareVersion}</span>
                  <span>Ready to play</span>
                  {deviceInfo.modelState !== 0 && <span>{modelStateName(deviceInfo.modelState)} model, checksum <code>{deviceInfo.activeModelCrc32.toString(16).padStart(8,"0")}</code></span>}
                </p>
              )}
            </aside>
          </section>
        </main>
      )}

      <footer className="site-footer">
        <span>Ishan Kumthekar</span>
        <div>
          <a href="/THIRD_PARTY_LICENSES.txt">Asset credits and licenses</a>
          <a href="https://github.com/ishanrk/esp32p4-nnue">source</a>
          <a href="https://ishankumthekar.com">ishankumthekar.com</a>
        </div>
      </footer>
    </div>
  );
}

function MoveHistory({ game }: { game: Chess }) {
  const rows = moveHistory(game);
  if (rows.length === 0) return null;
  return (
    <div className="move-history">
      <span className="move-history-label">moves</span>
        <ol aria-label="Move history">
          {rows.map((row) => (
            <li key={row.move}>
              <span>{row.move}.</span>
              <span>{row.white}</span>
              <span>{row.black ?? ""}</span>
            </li>
          ))}
        </ol>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function downloadPgn(game: Chess): void {
  const file = new Blob([gamePgn(game)], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "esp32-p4-game.pgn";
  link.click();
  URL.revokeObjectURL(url);
}

export function siteViewFromHash(hash: string): SiteView {
  if (hash === "#setup" || hash === "#guide" || hash === "#guide-content" || hash === "#guide-hardware") return "setup";
  if (hash === "#integration" || hash === "#guide-browser") return "integration";
  if (hash === "#recorded") return "setup";
  if (hash === "#results") return "results";
  if (hash.startsWith("#guide-")) return "how";
  if (hash === "#how-it-works") return "how";
  return "play";
}
