import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

import type { SearchResult } from "./protocol";

export type SideChoice = "white" | "black" | "random";

export type SearchTransport = {
  setPosition(fen: string): Promise<void>;
  searchDepth(depth: number): Promise<SearchResult>;
};

export type GameResult = {
  heading: string;
  detail: string;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export function resolveSide(
  choice: SideChoice,
  random: () => number = Math.random,
): Color {
  if (choice === "white") return "w";
  if (choice === "black") return "b";
  return random() < 0.5 ? "w" : "b";
}

export function orderedSquares(orientation: Color): Square[] {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? RANKS : [...RANKS].reverse();
  return ranks.flatMap((rank) =>
    files.map((file) => `${file}${rank}` as Square),
  );
}

export function legalMovesFrom(game: Chess, square: Square): Move[] {
  return game.moves({ square, verbose: true });
}

export function applyHumanMove(
  game: Chess,
  humanColor: Color,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): Move | null {
  if (game.isGameOver() || game.turn() !== humanColor) return null;
  return tryMove(game, from, to, promotion);
}

export function applyUciMove(game: Chess, uci: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length === 5 ? uci[4] as PieceSymbol : undefined;
  return tryMove(game, from, to, promotion);
}

export async function requestChipSearch(
  transport: SearchTransport,
  game: Chess,
  depth: number,
): Promise<SearchResult | null> {
  if (game.isGameOver()) return null;
  await transport.setPosition(game.fen());
  return transport.searchDepth(depth);
}

export function describeGameResult(
  game: Chess,
  humanColor: Color,
): GameResult | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    return {
      heading: "checkmate",
      detail: game.turn() === humanColor ? "chip wins" : "you win",
    };
  }
  if (game.isStalemate()) {
    return { heading: "stalemate", detail: "draw" };
  }
  return { heading: "draw", detail: drawReason(game) };
}

export function moveHistory(game: Chess): Array<{
  move: number;
  white: string;
  black?: string;
}> {
  const moves = game.history();
  const rows: Array<{ move: number; white: string; black?: string }> = [];
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({
      move: index / 2 + 1,
      white: moves[index],
      black: moves[index + 1],
    });
  }
  return rows;
}

function tryMove(
  game: Chess,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): Move | null {
  try {
    return game.move({ from, to, promotion });
  } catch {
    return null;
  }
}

function drawReason(game: Chess): string {
  if (game.isInsufficientMaterial()) return "insufficient material";
  if (game.isThreefoldRepetition()) return "repetition";
  if (game.isDrawByFiftyMoves()) return "fifty move rule";
  return "game drawn";
}
