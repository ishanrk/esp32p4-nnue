#include "movegen.h"

#include "makemove.h"

static bool inside(int file, int rank) {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

static Square sq_make(int file, int rank) {
    return (Square)(rank * 8 + file);
}

static bool same_side(int8_t a, int8_t b) {
    return (a > 0 && b > 0) || (a < 0 && b < 0);
}

static void push_move(MoveList *list, Move m) {
    if (list->count < MOVE_LIST_MAX) {
        list->moves[list->count++] = m;
    }
}

static void gen_slider(const Position *pos, MoveList *list, Square from, const int *df, const int *dr, int n_dirs) {
    int8_t me = pos->board[from];
    int from_file = (int)from % 8;
    int from_rank = (int)from / 8;
    for (int d = 0; d < n_dirs; d++) {
        int file = from_file + df[d];
        int rank = from_rank + dr[d];
        while (inside(file, rank)) {
            Square to = sq_make(file, rank);
            int8_t target = pos->board[to];
            if (target == 0) {
                push_move(list, move_make(from, to, MOVE_FLAG_NONE, 0));
            } else {
                if (!same_side(me, target)) {
                    push_move(list, move_make(from, to, MOVE_FLAG_CAPTURE, 0));
                }
                break;
            }
            file += df[d];
            rank += dr[d];
        }
    }
}

void movegen_pseudo_legal(const Position *pos, MoveList *list) {
    list->count = 0;
    Color side = pos->side_to_move;
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        int8_t piece = pos->board[sq];
        if (piece == 0) {
            continue;
        }
        if (side == COLOR_WHITE && piece < 0) {
            continue;
        }
        if (side == COLOR_BLACK && piece > 0) {
            continue;
        }
        int abs_piece = piece < 0 ? -piece : piece;
        int from_file = sq % 8;
        int from_rank = sq / 8;

        if (abs_piece == 1) {
            int dir = piece > 0 ? 1 : -1;
            int start_rank = piece > 0 ? 1 : 6;
            int promo_rank = piece > 0 ? 6 : 1;
            int next_rank = from_rank + dir;
            if (inside(from_file, next_rank)) {
                Square to = sq_make(from_file, next_rank);
                if (pos->board[to] == 0) {
                    if (from_rank == promo_rank) {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_PROMO, PIECE_QUEEN));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_PROMO, PIECE_ROOK));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_PROMO, PIECE_BISHOP));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_PROMO, PIECE_KNIGHT));
                    } else {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_NONE, 0));
                        if (from_rank == start_rank) {
                            Square to2 = sq_make(from_file, from_rank + 2 * dir);
                            if (pos->board[to2] == 0) {
                                push_move(list, move_make((Square)sq, to2, MOVE_FLAG_DOUBLE_PAWN, 0));
                            }
                        }
                    }
                }
            }
            int cap_rank = from_rank + dir;
            for (int df = -1; df <= 1; df += 2) {
                int cap_file = from_file + df;
                if (!inside(cap_file, cap_rank)) {
                    continue;
                }
                Square to = sq_make(cap_file, cap_rank);
                int8_t target = pos->board[to];
                if (target != 0 && !same_side(piece, target)) {
                    if (from_rank == promo_rank) {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE | MOVE_FLAG_PROMO, PIECE_QUEEN));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE | MOVE_FLAG_PROMO, PIECE_ROOK));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE | MOVE_FLAG_PROMO, PIECE_BISHOP));
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE | MOVE_FLAG_PROMO, PIECE_KNIGHT));
                    } else {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE, 0));
                    }
                }
                if (to == pos->ep_square) {
                    push_move(list, move_make((Square)sq, to, MOVE_FLAG_ENPASSANT | MOVE_FLAG_CAPTURE, 0));
                }
            }
            continue;
        }

        if (abs_piece == 2) {
            static const int ndf[8] = {-2, -1, 1, 2, 2, 1, -1, -2};
            static const int ndr[8] = {1, 2, 2, 1, -1, -2, -2, -1};
            for (int i = 0; i < 8; i++) {
                int file = from_file + ndf[i];
                int rank = from_rank + ndr[i];
                if (!inside(file, rank)) {
                    continue;
                }
                Square to = sq_make(file, rank);
                int8_t target = pos->board[to];
                if (target == 0) {
                    push_move(list, move_make((Square)sq, to, MOVE_FLAG_NONE, 0));
                } else if (!same_side(piece, target)) {
                    push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE, 0));
                }
            }
            continue;
        }

        if (abs_piece == 3 || abs_piece == 5) {
            static const int bdf[4] = {1, 1, -1, -1};
            static const int bdr[4] = {1, -1, 1, -1};
            gen_slider(pos, list, (Square)sq, bdf, bdr, 4);
        }
        if (abs_piece == 4 || abs_piece == 5) {
            static const int rdf[4] = {1, -1, 0, 0};
            static const int rdr[4] = {0, 0, 1, -1};
            gen_slider(pos, list, (Square)sq, rdf, rdr, 4);
        }
        if (abs_piece == 6) {
            for (int df = -1; df <= 1; df++) {
                for (int dr = -1; dr <= 1; dr++) {
                    if (df == 0 && dr == 0) {
                        continue;
                    }
                    int file = from_file + df;
                    int rank = from_rank + dr;
                    if (!inside(file, rank)) {
                        continue;
                    }
                    Square to = sq_make(file, rank);
                    int8_t target = pos->board[to];
                    if (target == 0) {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_NONE, 0));
                    } else if (!same_side(piece, target)) {
                        push_move(list, move_make((Square)sq, to, MOVE_FLAG_CAPTURE, 0));
                    }
                }
            }
            if (piece > 0) {
                if ((pos->castling & 1) &&
                    pos->board[SQUARE_F1] == 0 &&
                    pos->board[SQUARE_G1] == 0 &&
                    !pos_square_attacked(pos, SQUARE_E1, COLOR_BLACK) &&
                    !pos_square_attacked(pos, SQUARE_F1, COLOR_BLACK) &&
                    !pos_square_attacked(pos, SQUARE_G1, COLOR_BLACK)) {
                    push_move(list, move_make((Square)sq, SQUARE_G1, MOVE_FLAG_CASTLE, 0));
                }
                if ((pos->castling & 2) &&
                    pos->board[SQUARE_B1] == 0 &&
                    pos->board[SQUARE_C1] == 0 &&
                    pos->board[SQUARE_D1] == 0 &&
                    !pos_square_attacked(pos, SQUARE_E1, COLOR_BLACK) &&
                    !pos_square_attacked(pos, SQUARE_D1, COLOR_BLACK) &&
                    !pos_square_attacked(pos, SQUARE_C1, COLOR_BLACK)) {
                    push_move(list, move_make((Square)sq, SQUARE_C1, MOVE_FLAG_CASTLE, 0));
                }
            } else {
                if ((pos->castling & 4) &&
                    pos->board[SQUARE_F8] == 0 &&
                    pos->board[SQUARE_G8] == 0 &&
                    !pos_square_attacked(pos, SQUARE_E8, COLOR_WHITE) &&
                    !pos_square_attacked(pos, SQUARE_F8, COLOR_WHITE) &&
                    !pos_square_attacked(pos, SQUARE_G8, COLOR_WHITE)) {
                    push_move(list, move_make((Square)sq, SQUARE_G8, MOVE_FLAG_CASTLE, 0));
                }
                if ((pos->castling & 8) &&
                    pos->board[SQUARE_B8] == 0 &&
                    pos->board[SQUARE_C8] == 0 &&
                    pos->board[SQUARE_D8] == 0 &&
                    !pos_square_attacked(pos, SQUARE_E8, COLOR_WHITE) &&
                    !pos_square_attacked(pos, SQUARE_D8, COLOR_WHITE) &&
                    !pos_square_attacked(pos, SQUARE_C8, COLOR_WHITE)) {
                    push_move(list, move_make((Square)sq, SQUARE_C8, MOVE_FLAG_CASTLE, 0));
                }
            }
        }
    }
}

void movegen_legal(const Position *pos, MoveList *list) {
    MoveList pseudo;
    movegen_pseudo_legal(pos, &pseudo);
    list->count = 0;
    for (U32 i = 0; i < pseudo.count; i++) {
        Position tmp = *pos;
        Undo u;
        if (make_move(&tmp, pseudo.moves[i], &u)) {
            push_move(list, pseudo.moves[i]);
        }
    }
}
