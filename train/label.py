from __future__ import annotations

import argparse
import csv

import chess.pgn
import chess.engine


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pgn")
    parser.add_argument("engine")
    parser.add_argument("out")
    parser.add_argument("--nodes", type=int, default=20000)
    parser.add_argument("--stride", type=int, default=4)
    parser.add_argument("--limit", type=int, default=1000000)
    args = parser.parse_args()

    position_count = 0
    engine = chess.engine.SimpleEngine.popen_uci(args.engine)
    try:
        with open(args.pgn, encoding="utf-8", errors="ignore") as source, open(
            args.out, "w", newline="", encoding="utf-8"
        ) as destination:
            writer = csv.writer(destination)
            writer.writerow(("fen", "score"))
            while position_count < args.limit:
                game = chess.pgn.read_game(source)
                if game is None:
                    break
                board = game.board()
                for ply, move in enumerate(game.mainline_moves(), 1):
                    board.push(move)
                    if ply % args.stride or board.is_game_over():
                        continue
                    info = engine.analyse(
                        board, chess.engine.Limit(nodes=args.nodes)
                    )
                    score = info["score"].pov(board.turn).score(mate_score=30000)
                    if score is None:
                        continue
                    writer.writerow((board.fen(), score))
                    position_count += 1
                    if position_count >= args.limit:
                        break
    finally:
        engine.quit()
    print(position_count)


if __name__ == "__main__":
    main()
