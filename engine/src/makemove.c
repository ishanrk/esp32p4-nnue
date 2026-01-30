#include "makemove.h"

#include <string.h>

static void clear_castling_rights(Position *pos, Square sq) {
    if (sq == SQUARE_E1) pos->castling &= (U16)~(1 | 2);
    if (sq == SQUARE_H1) pos->castling &= (U16)~1;
    if (sq == SQUARE_A1) pos->castling &= (U16)~2;
    if (sq == SQUARE_E8) pos->castling &= (U16)~(4 | 8);
    if (sq == SQUARE_H8) pos->castling &= (U16)~4;
    if (sq == SQUARE_A8) pos->castling &= (U16)~8;
}

static bool is_white_piece(int8_t p) {
    return p > 0;
}

static bool is_black_piece(int8_t p) {
    return p < 0;
}

bool make_move(Position *pos, Move m, Undo *undo) {
    Square from = move_from(m);
    Square to = move_to(m);
    U32 flags = move_flags(m);
    U32 promo = move_promo(m);
    int8_t moved = pos->board[from];
    int8_t captured = pos->board[to];

    if (moved == 0) {
        return false;
    }
    if (pos->side_to_move == COLOR_WHITE && !is_white_piece(moved)) {
        return false;
    }
    if (pos->side_to_move == COLOR_BLACK && !is_black_piece(moved)) {
        return false;
    }

    if (undo) {
        memset(undo, 0, sizeof(*undo));
        undo->captured_piece = captured;
        undo->moved_piece = moved;
        undo->from = from;
        undo->to = to;
        undo->ep_capture_square = SQUARE_NONE;
        undo->rook_from = SQUARE_NONE;
        undo->rook_to = SQUARE_NONE;
        undo->promoted = false;
        undo->zobrist = pos->zobrist;
        undo->pawn_key = pos->pawn_key;
        undo->castling = pos->castling;
        undo->ep_square = pos->ep_square;
        undo->halfmove_clock = pos->halfmove_clock;
        undo->fullmove_number = pos->fullmove_number;
    }

    clear_castling_rights(pos, from);
    if (captured != 0) {
        clear_castling_rights(pos, to);
    }

    pos->board[from] = 0;
    pos->board[to] = moved;

    if (flags & MOVE_FLAG_ENPASSANT) {
        int dir = moved > 0 ? -8 : 8;
        Square cap_sq = (Square)((int)to + dir);
        captured = pos->board[cap_sq];
        pos->board[cap_sq] = 0;
        if (undo) {
            undo->captured_piece = captured;
            undo->ep_capture_square = cap_sq;
        }
    }

    if (flags & MOVE_FLAG_CASTLE) {
        if (to == SQUARE_G1) {
            pos->board[SQUARE_H1] = 0;
            pos->board[SQUARE_F1] = 4;
            if (undo) {
                undo->rook_from = SQUARE_H1;
                undo->rook_to = SQUARE_F1;
            }
        } else if (to == SQUARE_C1) {
            pos->board[SQUARE_A1] = 0;
            pos->board[SQUARE_D1] = 4;
            if (undo) {
                undo->rook_from = SQUARE_A1;
                undo->rook_to = SQUARE_D1;
            }
        } else if (to == SQUARE_G8) {
            pos->board[SQUARE_H8] = 0;
            pos->board[SQUARE_F8] = -4;
            if (undo) {
                undo->rook_from = SQUARE_H8;
                undo->rook_to = SQUARE_F8;
            }
        } else if (to == SQUARE_C8) {
            pos->board[SQUARE_A8] = 0;
            pos->board[SQUARE_D8] = -4;
            if (undo) {
                undo->rook_from = SQUARE_A8;
                undo->rook_to = SQUARE_D8;
            }
        }
    }

    if (flags & MOVE_FLAG_PROMO) {
        int8_t sign = moved > 0 ? 1 : -1;
        int8_t promoted = 5;
        if (promo == PIECE_KNIGHT) promoted = 2;
        if (promo == PIECE_BISHOP) promoted = 3;
        if (promo == PIECE_ROOK) promoted = 4;
        if (promo == PIECE_QUEEN) promoted = 5;
        pos->board[to] = (int8_t)(sign * promoted);
        if (undo) {
            undo->promoted = true;
        }
    }

    if (flags & MOVE_FLAG_DOUBLE_PAWN) {
        int step = moved > 0 ? 8 : -8;
        pos->ep_square = (Square)((int)to - step);
    } else {
        pos->ep_square = SQUARE_NONE;
    }

    if (moved == 1 || moved == -1 || captured != 0) {
        pos->halfmove_clock = 0;
    } else {
        pos->halfmove_clock++;
    }
    if (pos->side_to_move == COLOR_BLACK) {
        pos->fullmove_number++;
    }

    Color moved_side = pos->side_to_move;
    pos->side_to_move = moved_side == COLOR_WHITE ? COLOR_BLACK : COLOR_WHITE;
    pos_rebuild_bitboards(pos);
    if (pos_in_check(pos, moved_side)) {
        if (undo) {
            unmake_move(pos, m, undo);
        }
        return false;
    }

    return true;
}

void unmake_move(Position *pos, Move m, const Undo *undo) {
    (void)m;
    if (!pos || !undo) {
        return;
    }

    pos->side_to_move = pos->side_to_move == COLOR_WHITE ? COLOR_BLACK : COLOR_WHITE;
    pos->castling = undo->castling;
    pos->ep_square = undo->ep_square;
    pos->halfmove_clock = undo->halfmove_clock;
    pos->fullmove_number = undo->fullmove_number;
    pos->zobrist = undo->zobrist;
    pos->pawn_key = undo->pawn_key;

    pos->board[undo->from] = undo->moved_piece;
    pos->board[undo->to] = undo->captured_piece;

    if (undo->ep_capture_square != SQUARE_NONE) {
        pos->board[undo->to] = 0;
        pos->board[undo->ep_capture_square] = undo->captured_piece;
    }

    if (undo->rook_from != SQUARE_NONE && undo->rook_to != SQUARE_NONE) {
        pos->board[undo->rook_from] = pos->board[undo->rook_to];
        pos->board[undo->rook_to] = 0;
    }

    if (undo->promoted) {
        pos->board[undo->from] = undo->moved_piece;
    }

    pos_rebuild_bitboards(pos);
}
