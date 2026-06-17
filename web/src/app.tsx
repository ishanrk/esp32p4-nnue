import {
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
  legalMovesFrom,
  moveHistory,
  requestChipSearch,
  resolveSide,
  type SideChoice,
} from "./game";
import { modelStateName, type DeviceInfo, type SearchResult } from "./protocol";

const SEARCH_DEPTH = 5;
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

export function App() {
  const gameRef = useRef(new Chess());
  const boardRef = useRef<SerialBoard | null>(null);
  const gameToken = useRef(0);
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
  const [blocked, setBlocked] = useState(false);
  const [activity, setActivity] = useState("connect board");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const serialSupported = isWebSerialSupported();
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
      void boardRef.current?.disconnect();
    };
  }, []);

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
    if (!serialSupported || connection !== "disconnected") return;
    setConnection("connecting");
    setActivity("connecting...");
    setBlocked(false);
    const board = new SerialBoard((error) => handleUnexpectedDisconnect(board, error));
    boardRef.current = board;
    try {
      const info = await board.connect();
      if (boardRef.current !== board) return;
      setDeviceInfo(info);
      setConnection("connected");
      startGame(board);
    } catch (error) {
      if (boardRef.current === board) boardRef.current = null;
      setConnection("disconnected");
      setDeviceInfo(null);
      setActivity(errorMessage(error, "could not connect board"));
      await board.disconnect();
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
    setActivity("disconnecting...");
    await board.disconnect();
    setConnection("disconnected");
    setActivity("board disconnected");
  }

  function startGame(board: SerialBoard | null = boardRef.current): void {
    const token = gameToken.current + 1;
    gameToken.current = token;
    const nextGame = new Chess();
    const nextHumanColor = resolveSide(sideChoice);
    gameRef.current = nextGame;
    setHumanColor(nextHumanColor);
    setSelected(null);
    setLastMove(null);
    setPromotion(null);
    setSearchResult(null);
    setBlocked(false);
    setActivity(nextHumanColor === "w" ? "your move" : "chip thinking...");
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
    setThinking(true);
    setSelected(null);
    setActivity("chip thinking...");
    try {
      const result = await requestChipSearch(board, activeGame, SEARCH_DEPTH);
      if (token !== gameToken.current || board !== boardRef.current) return;
      if (!result) return;
      const move = applyUciMove(activeGame, result.move);
      if (!move) {
        setBlocked(true);
        setActivity("invalid move from board");
        return;
      }
      setLastMove({ from: move.from, to: move.to });
      setSearchResult(result);
      setActivity(`chip played ${result.move}`);
      refreshGame();
    } catch (error) {
      if (token !== gameToken.current) return;
      setBlocked(true);
      setActivity(errorMessage(error, "board request failed"));
    } finally {
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
      <AeroLandscape />
      <header className="site-header">
        <nav aria-label="Main navigation" className="nav-inner">
          <a className="wordmark" href="#play">
            <span aria-hidden="true" className="wordmark-orb" />
            <span>ESP32 P4 NNUE</span>
          </a>
          <div className="nav-links">
            <a href="#play">Play</a>
            <a href="https://github.com/ishanrk/esp32p4-nnue">GitHub</a>
          </div>
        </nav>
      </header>

      <main id="play">
        <section className="title-area" aria-labelledby="page-title">
          <p className="eyebrow">hardware chess</p>
          <h1 id="page-title">ESP32 P4 NNUE</h1>
          <p className="tagline">play the chip</p>
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
                <div aria-live="polite" className="thinking-bubble">
                  <span aria-hidden="true" className="thinking-orb" />
                  chip thinking...
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
                          className="aero-button promotion-button"
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
            <div className="connection-row">
              <button
                className={`connect-button ${connection === "connected" ? "is-connected" : ""}`}
                aria-label={connection === "connected" ? "disconnect board" : undefined}
                disabled={!serialSupported || connection === "connecting" || connection === "disconnecting"}
                onClick={() => connection === "connected" ? void disconnectBoard() : void connectBoard()}
                title={connection === "connected" ? "disconnect board" : undefined}
                type="button"
              >
                <span aria-hidden="true" className="connection-orb" />
                {connection === "connecting" ? "connecting..." :
                  connection === "disconnecting" ? "disconnecting..." :
                  connection === "connected" ? "board connected" : "connect board"}
              </button>
              {!serialSupported && (
                <p className="support-note">Web Serial needs Chrome or Edge</p>
              )}
            </div>

            <fieldset
              className="side-selector"
              disabled={thinking || connection === "connecting" || connection === "disconnecting"}
            >
              <legend>choose a side</legend>
              <div className="segmented-pills">
                {SIDE_CHOICES.map((option) => (
                  <button
                    aria-pressed={sideChoice === option.value}
                    className="side-button"
                    key={option.value}
                    onClick={() => setSideChoice(option.value)}
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

            <div aria-atomic="true" aria-live="polite" className="game-status">
              <span aria-hidden="true" className={`status-orb ${thinking ? "is-thinking" : ""}`} />
              <div>
                <strong>{statusHeading}</strong>
                {statusDetail && <span>{statusDetail}</span>}
              </div>
            </div>

            {searchResult && (
              <p className="engine-response">
                depth {searchResult.depth}
                <span aria-hidden="true"> · </span>
                {searchResult.elapsedMs.toLocaleString()} ms
                <span aria-hidden="true"> · </span>
                {searchResult.nodes.toLocaleString()} nodes
              </p>
            )}

            <button
              className="aero-button new-game-button"
              disabled={connection !== "connected" || thinking}
              onClick={() => startGame()}
              type="button"
            >
              New game
            </button>

            <MoveHistory game={game} />

            {deviceInfo && (
              <p className="device-line">
                firmware {deviceInfo.firmwareVersion}
                <span aria-hidden="true"> · </span>
                {modelStateName(deviceInfo.modelState)} model
              </p>
            )}
          </aside>
        </section>
      </main>

      <footer className="site-footer">
        <span>ESP32 P4 NNUE</span>
        <div>
          <a href="https://github.com/ishanrk/esp32p4-nnue">source</a>
          <a href="https://ishankumthekar.com">ishankumthekar.com</a>
        </div>
      </footer>
    </div>
  );
}

function MoveHistory({ game }: { game: Chess }) {
  const rows = moveHistory(game);
  return (
    <div className="move-history">
      <span className="move-history-label">moves</span>
      {rows.length === 0 ? (
        <span className="empty-history">game ready</span>
      ) : (
        <ol aria-label="Move history">
          {rows.map((row) => (
            <li key={row.move}>
              <span>{row.move}.</span>
              <span>{row.white}</span>
              <span>{row.black ?? ""}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AeroLandscape() {
  return (
    <div aria-hidden="true" className="aero-landscape">
      <span className="sun-glow" />
      <span className="cloud cloud-one" />
      <span className="cloud cloud-two" />
      <span className="cloud cloud-three" />
      <span className="bubble bubble-one" />
      <span className="bubble bubble-two" />
      <span className="bubble bubble-three" />
      <span className="grass-hill grass-hill-back" />
      <span className="grass-hill grass-hill-front" />
      <span className="water-line" />
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
