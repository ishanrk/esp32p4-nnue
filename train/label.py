from __future__ import annotations

import argparse
import csv

import chess.pgn
import chess.engine


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("pgn")
    p.add_argument("engine")
    p.add_argument("out")
    p.add_argument("--nodes", type=int, default=20000)
    p.add_argument("--stride", type=int, default=4)
    p.add_argument("--limit", type=int, default=1000000)
    a = p.parse_args()

    n = 0
    eng = chess.engine.SimpleEngine.popen_uci(a.engine)
    try:
        with open(a.pgn, encoding="utf-8", errors="ignore") as src, open(
            a.out, "w", newline="", encoding="utf-8"
        ) as dst:
            wr = csv.writer(dst)
            wr.writerow(("fen", "score"))
            while n < a.limit:
                game = chess.pgn.read_game(src)
                if game is None:
                    break
                board = game.board()
                for ply, move in enumerate(game.mainline_moves(), 1):
                    board.push(move)
                    if ply % a.stride or board.is_game_over():
                        continue
                    info = eng.analyse(board, chess.engine.Limit(nodes=a.nodes))
                    score = info["score"].pov(board.turn).score(mate_score=30000)
                    if score is None:
                        continue
                    wr.writerow((board.fen(), score))
                    n += 1
                    if n >= a.limit:
                        break
    finally:
        eng.quit()
    print(n)


if __name__ == "__main__":
    main()
