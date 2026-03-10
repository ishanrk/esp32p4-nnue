#include "ch.h"

static void add_move(move_list_t *list, int from, int to, int promotion, int flags) {
    if (list->count < MAX_MOVES) {
        list->moves[list->count++] = PACK_MOVE(from, to, promotion, flags);
    }
}

static void add_promotions(move_list_t *list, int from, int to, int flags) {
    add_move(list, from, to, 4, flags);
    add_move(list, from, to, 3, flags);
    add_move(list, from, to, 2, flags);
    add_move(list, from, to, 1, flags);
}

static void generate_pawn_moves(const position_t *position,
                                move_list_t *list,
                                bool tactical_only) {
    int side = position->side_to_move;
    int piece = side == WHITE ? WHITE_PAWN : BLACK_PAWN;
    int step = side == WHITE ? 8 : -8;
    int start_rank = side == WHITE ? 1 : 6;
    int promotion_rank = side == WHITE ? 6 : 1;
    bitboard_t enemy = position->occupancy[side ^ 1];
    bitboard_t pawns = position->pieces[piece];

    while (pawns) {
        int from = pop_first_square(&pawns);
        int rank = from >> 3;
        int to = from + step;
        if ((unsigned)to < 64u && position->board[to] == NO_PIECE) {
            if (rank == promotion_rank) {
                add_promotions(list, from, to, 0);
            } else if (!tactical_only) {
                add_move(list, from, to, 0, 0);
                int double_to = to + step;
                if (rank == start_rank && position->board[double_to] == NO_PIECE) {
                    add_move(list, from, double_to, 0, MOVE_DOUBLE_PAWN);
                }
            }
        }

        bitboard_t captures = pawn_attacks[side][from] & enemy;
        if (position->en_passant != NO_SQUARE) {
            captures |= pawn_attacks[side][from] &
                        SQUARE_BIT(position->en_passant);
        }
        while (captures) {
            to = pop_first_square(&captures);
            int flags = MOVE_CAPTURE;
            if (to == position->en_passant) {
                flags |= MOVE_EN_PASSANT;
            }
            if (rank == promotion_rank) add_promotions(list, from, to, flags);
            else add_move(list, from, to, 0, flags);
        }
    }
}

static void generate_leaper_moves(const position_t *position,
                                  move_list_t *list,
                                  bool tactical_only,
                                  int piece,
                                  const bitboard_t *attack_table) {
    int side = position->side_to_move;
    bitboard_t own = position->occupancy[side];
    bitboard_t enemy = position->occupancy[side ^ 1];
    bitboard_t targets = tactical_only ? enemy : ~own;
    bitboard_t pieces = position->pieces[piece];
    while (pieces) {
        int from = pop_first_square(&pieces);
        bitboard_t attacks = attack_table[from] & targets;
        while (attacks) {
            int to = pop_first_square(&attacks);
            int flags = position->board[to] == NO_PIECE ? 0 : MOVE_CAPTURE;
            add_move(list, from, to, 0, flags);
        }
    }
}

static void generate_slider_moves(const position_t *position,
                                  move_list_t *list,
                                  bool tactical_only,
                                  int piece,
                                  int type) {
    int side = position->side_to_move;
    bitboard_t own = position->occupancy[side];
    bitboard_t enemy = position->occupancy[side ^ 1];
    bitboard_t targets = tactical_only ? enemy : ~own;
    bitboard_t occupancy = position->occupancy[ALL_PIECES];
    bitboard_t pieces = position->pieces[piece];
    while (pieces) {
        int from = pop_first_square(&pieces);
        bitboard_t attacks;
        if (type == BISHOP) {
            attacks = generate_bishop_attacks(from, occupancy);
        } else if (type == ROOK) {
            attacks = generate_rook_attacks(from, occupancy);
        } else {
            attacks = generate_bishop_attacks(from, occupancy) |
                      generate_rook_attacks(from, occupancy);
        }
        attacks &= targets;
        while (attacks) {
            int to = pop_first_square(&attacks);
            int flags = position->board[to] == NO_PIECE ? 0 : MOVE_CAPTURE;
            add_move(list, from, to, 0, flags);
        }
    }
}

static void generate_castling_moves(const position_t *position, move_list_t *list) {
    int side = position->side_to_move;

    if (side == WHITE && position->board[4] == WHITE_KING) {
        if ((position->castling & CASTLE_WHITE_KING) &&
            position->board[7] == WHITE_ROOK &&
            position->board[5] == NO_PIECE &&
            position->board[6] == NO_PIECE) {
            add_move(list, 4, 6, 0, MOVE_CASTLE);
        }
        if ((position->castling & CASTLE_WHITE_QUEEN) &&
            position->board[0] == WHITE_ROOK &&
            position->board[1] == NO_PIECE &&
            position->board[2] == NO_PIECE &&
            position->board[3] == NO_PIECE) {
            add_move(list, 4, 2, 0, MOVE_CASTLE);
        }
    } else if (side == BLACK && position->board[60] == BLACK_KING) {
        if ((position->castling & CASTLE_BLACK_KING) &&
            position->board[63] == BLACK_ROOK &&
            position->board[61] == NO_PIECE &&
            position->board[62] == NO_PIECE) {
            add_move(list, 60, 62, 0, MOVE_CASTLE);
        }
        if ((position->castling & CASTLE_BLACK_QUEEN) &&
            position->board[56] == BLACK_ROOK &&
            position->board[57] == NO_PIECE &&
            position->board[58] == NO_PIECE &&
            position->board[59] == NO_PIECE) {
            add_move(list, 60, 58, 0, MOVE_CASTLE);
        }
    }
}

void generate_moves(const position_t *position, move_list_t *list, bool tactical_only) {
    list->count = 0;
    int piece_offset = position->side_to_move == WHITE ? 0 : 6;
    generate_pawn_moves(position, list, tactical_only);
    generate_leaper_moves(position, list, tactical_only,
                          piece_offset + KNIGHT, knight_attacks);
    generate_slider_moves(position, list, tactical_only,
                          piece_offset + BISHOP, BISHOP);
    generate_slider_moves(position, list, tactical_only,
                          piece_offset + ROOK, ROOK);
    generate_slider_moves(position, list, tactical_only,
                          piece_offset + QUEEN, QUEEN);
    generate_leaper_moves(position, list, tactical_only,
                          piece_offset + KING, king_attacks);
    if (!tactical_only) generate_castling_moves(position, list);
}
