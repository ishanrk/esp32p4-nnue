import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { type Chess, type Color, type Move, type Square } from "chess.js";

import { orderedSquares } from "./game";
import { ChessPiece } from "./pieces";

type ChessboardProps = {
  game: Chess;
  orientation: Color;
  selected: Square | null;
  legalTargets: ReadonlySet<Square>;
  lastMove: Pick<Move, "from" | "to"> | null;
  disabled: boolean;
  onSquare: (square: Square) => void;
};

export function Chessboard({
  game,
  orientation,
  selected,
  legalTargets,
  lastMove,
  disabled,
  onSquare,
}: ChessboardProps) {
  const squares = useMemo(() => orderedSquares(orientation), [orientation]);
  const squareButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const checkedKing = game.inCheck()
    ? game.findPiece({ type: "k", color: game.turn() })[0]
    : undefined;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const directions: Record<string, number> = {
      ArrowUp: -8,
      ArrowDown: 8,
      ArrowLeft: -1,
      ArrowRight: 1,
    };
    const offset = directions[event.key];
    if (offset === undefined) return;
    const target = index + offset;
    const crossesRow = Math.abs(offset) === 1 &&
      Math.floor(index / 8) !== Math.floor(target / 8);
    if (target < 0 || target >= 64 || crossesRow) return;
    event.preventDefault();
    setFocusIndex(target);
    squareButtons.current[target]?.focus();
  }

  return (
    <div
      aria-label={`chessboard from ${orientation === "w" ? "white" : "black"} side`}
      className="chessboard"
      role="group"
    >
      {squares.map((square, index) => {
        const piece = game.get(square);
        const isLight = (square.charCodeAt(0) + Number(square[1])) % 2 === 1;
        const isSelected = selected === square;
        const isTarget = legalTargets.has(square);
        const isLast = lastMove?.from === square || lastMove?.to === square;
        const classNames = [
          "square",
          isLight ? "square-light" : "square-dark",
          isSelected ? "is-selected" : "",
          isTarget ? "is-legal" : "",
          isTarget && piece ? "is-capture" : "",
          isLast ? "is-last" : "",
          checkedKing === square ? "is-check" : "",
        ].filter(Boolean).join(" ");
        const row = Math.floor(index / 8);
        const column = index % 8;
        const state = [
          piece
            ? `${piece.color === "w" ? "white" : "black"} ${pieceName(piece.type)}`
            : "empty",
          isSelected ? "selected" : "",
          isTarget ? "legal destination" : "",
          checkedKing === square ? "in check" : "",
        ].filter(Boolean).join(", ");

        return (
          <button
            aria-label={`${square}, ${state}`}
            className={classNames}
            data-square={square}
            disabled={disabled}
            key={square}
            onClick={() => onSquare(square)}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => moveFocus(event, index)}
            ref={(element) => {
              squareButtons.current[index] = element;
            }}
            tabIndex={!disabled && index === focusIndex ? 0 : -1}
            type="button"
          >
            {piece && <ChessPiece piece={piece} />}
            {isTarget && <span aria-hidden="true" className="legal-marker" />}
            {column === 0 && <span className="rank-label">{square[1]}</span>}
            {row === 7 && <span className="file-label">{square[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function pieceName(piece: string): string {
  return {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  }[piece] ?? "piece";
}
