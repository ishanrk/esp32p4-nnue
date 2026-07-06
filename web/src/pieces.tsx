import type { Piece } from "chess.js";

const PIECE_FILE: Record<Piece["type"], string> = {
  b: "B",
  k: "K",
  n: "N",
  p: "P",
  q: "Q",
  r: "R",
};

export function ChessPiece({ piece }: { piece: Piece }) {
  const filename = `${piece.color}${PIECE_FILE[piece.type]}.svg`;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="piece"
      decoding="async"
      draggable={false}
      height={800}
      src={`/images/pieces/${filename}`}
      width={800}
    />
  );
}
