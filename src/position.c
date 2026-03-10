#include "ch.h"

#include <stdlib.h>
#include <string.h>

static const char piece_symbols[] = "PNBRQKpnbrqk";
static const int promotion_type[5] = {PAWN, KNIGHT, BISHOP, ROOK, QUEEN};

static int piece_from_symbol(char character) {
    const char *symbol = strchr(piece_symbols, character);
    return symbol ? (int)(symbol - piece_symbols) : NO_PIECE;
}

static void place_piece_raw(position_t *position, int piece, int square) {
    bitboard_t b = SQUARE_BIT(square);
    position->board[square] = (uint8_t)piece;
    position->pieces[piece] |= b;
    position->occupancy[piece_color(piece)] |= b;
    position->occupancy[ALL_PIECES] |= b;
}

static void place_piece(position_t *position, int piece, int square) {
    place_piece_raw(position, piece, square);
    position->key ^= zobrist_piece[piece][square];
    add_nnue_feature(position, piece, square);
}

static int remove_piece(position_t *position, int square) {
    int piece = position->board[square];
    bitboard_t b = SQUARE_BIT(square);
    remove_nnue_feature(position, piece, square);
    position->key ^= zobrist_piece[piece][square];
    position->board[square] = NO_PIECE;
    position->pieces[piece] &= ~b;
    position->occupancy[piece_color(piece)] &= ~b;
    position->occupancy[ALL_PIECES] &= ~b;
    return piece;
}

static uint8_t castling_mask(int square) {
    switch (square) {
        case 4: return (uint8_t)~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
        case 0: return (uint8_t)~CASTLE_WHITE_QUEEN;
        case 7: return (uint8_t)~CASTLE_WHITE_KING;
        case 60: return (uint8_t)~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
        case 56: return (uint8_t)~CASTLE_BLACK_QUEEN;
        case 63: return (uint8_t)~CASTLE_BLACK_KING;
        default: return 15;
    }
}

static bool move_flags_are_valid(int flags) {
    return flags == 0 ||
           flags == MOVE_CAPTURE ||
           flags == (MOVE_CAPTURE | MOVE_EN_PASSANT) ||
           flags == MOVE_CASTLE ||
           flags == MOVE_DOUBLE_PAWN;
}

static bool en_passant_move_is_valid(const position_t *position,
                                     int from,
                                     int to,
                                     int side) {
    int step = side == WHITE ? 8 : -8;
    int from_rank = side == WHITE ? 4 : 3;
    int to_rank = side == WHITE ? 5 : 2;
    int file_delta = (to & 7) - (from & 7);
    int capture_square = to - step;
    int captured_pawn = side == WHITE ? BLACK_PAWN : WHITE_PAWN;
    return position->en_passant == to &&
           position->board[to] == NO_PIECE &&
           (from >> 3) == from_rank &&
           (to >> 3) == to_rank &&
           (file_delta == -1 || file_delta == 1) &&
           to - from == step + file_delta &&
           position->board[capture_square] == captured_pawn;
}

static bool double_pawn_move_is_valid(const position_t *position,
                                      int from,
                                      int to,
                                      int side) {
    int step = side == WHITE ? 8 : -8;
    int start_rank = side == WHITE ? 1 : 6;
    return (from >> 3) == start_rank &&
           to == from + 2 * step &&
           position->board[from + step] == NO_PIECE &&
           position->board[to] == NO_PIECE;
}

static bool castle_move_is_valid(const position_t *position,
                                 int from,
                                 int to,
                                 int side) {
    int transit;
    if (side == WHITE && from == 4) {
        if (to == 6) {
            if (!(position->castling & CASTLE_WHITE_KING) ||
                position->board[7] != WHITE_ROOK ||
                position->board[5] != NO_PIECE ||
                position->board[6] != NO_PIECE) return false;
            transit = 5;
        } else if (to == 2) {
            if (!(position->castling & CASTLE_WHITE_QUEEN) ||
                position->board[0] != WHITE_ROOK ||
                position->board[1] != NO_PIECE ||
                position->board[2] != NO_PIECE ||
                position->board[3] != NO_PIECE) return false;
            transit = 3;
        } else {
            return false;
        }
    } else if (side == BLACK && from == 60) {
        if (to == 62) {
            if (!(position->castling & CASTLE_BLACK_KING) ||
                position->board[63] != BLACK_ROOK ||
                position->board[61] != NO_PIECE ||
                position->board[62] != NO_PIECE) return false;
            transit = 61;
        } else if (to == 58) {
            if (!(position->castling & CASTLE_BLACK_QUEEN) ||
                position->board[56] != BLACK_ROOK ||
                position->board[57] != NO_PIECE ||
                position->board[58] != NO_PIECE ||
                position->board[59] != NO_PIECE) return false;
            transit = 59;
        } else {
            return false;
        }
    } else {
        return false;
    }
    int opponent = side ^ 1;
    return !side_in_check(position, side) &&
           !square_is_attacked(position, transit, opponent);
}

void clear_position(position_t *position) {
    initialize_chess();
    memset(position, 0, sizeof(*position));
    memset(position->board, NO_PIECE, sizeof(position->board));
    position->en_passant = NO_SQUARE;
    position->fullmove_number = 1;
}

uint64_t calculate_position_hash(const position_t *position) {
    uint64_t k = zobrist_castling[position->castling];
    for (int piece = 0; piece < PIECE_COUNT; ++piece) {
        bitboard_t x = position->pieces[piece];
        while (x) {
            int square = pop_first_square(&x);
            k ^= zobrist_piece[piece][square];
        }
    }
    if (position->en_passant != NO_SQUARE) k ^= zobrist_en_passant[position->en_passant & 7];
    if (position->side_to_move == BLACK) k ^= zobrist_side;
    return k;
}

bool set_position_fen(position_t *position, const char *fen) {
    clear_position(position);
    int rank = 7;
    int file = 0;
    const char *cursor = fen;

    while (*cursor && *cursor != ' ') {
        if (*cursor == '/') {
            if (file != 8 || !rank) return false;
            --rank;
            file = 0;
        } else if (*cursor >= '1' && *cursor <= '8') {
            file += *cursor - '0';
            if (file > 8) return false;
        } else {
            int piece = piece_from_symbol(*cursor);
            if (piece == NO_PIECE || file > 7) return false;
            place_piece_raw(position, piece, MAKE_SQUARE(file, rank));
            ++file;
        }
        ++cursor;
    }
    if (rank != 0 || file != 8 || *cursor++ != ' ') return false;

    if (*cursor == 'w') position->side_to_move = WHITE;
    else if (*cursor == 'b') position->side_to_move = BLACK;
    else return false;
    ++cursor;
    if (*cursor++ != ' ') return false;

    position->castling = 0;
    if (*cursor == '-') ++cursor;
    else {
        while (*cursor && *cursor != ' ') {
            if (*cursor == 'K') position->castling |= CASTLE_WHITE_KING;
            else if (*cursor == 'Q') position->castling |= CASTLE_WHITE_QUEEN;
            else if (*cursor == 'k') position->castling |= CASTLE_BLACK_KING;
            else if (*cursor == 'q') position->castling |= CASTLE_BLACK_QUEEN;
            else return false;
            ++cursor;
        }
    }
    if (*cursor++ != ' ') return false;

    if (*cursor == '-') {
        position->en_passant = NO_SQUARE;
        ++cursor;
    } else {
        if (cursor[0] < 'a' || cursor[0] > 'h' ||
            cursor[1] < '1' || cursor[1] > '8') return false;
        position->en_passant =
            (uint8_t)MAKE_SQUARE(cursor[0] - 'a', cursor[1] - '1');
        cursor += 2;
    }
    if (*cursor && *cursor != ' ' && *cursor != '\r' && *cursor != '\n') {
        return false;
    }

    if (*cursor == ' ') {
        char *end;
        position->halfmove_clock = (uint16_t)strtoul(++cursor, &end, 10);
        cursor = end;
        if (*cursor == ' ') {
            position->fullmove_number = (uint16_t)strtoul(++cursor, &end, 10);
        }
    }

    position->key = calculate_position_hash(position);
    position->history_count = 1;
    position->history[0] = position->key;
    refresh_nnue(position);
    return position_is_valid(position);
}

void set_start_position(position_t *position) {
    set_position_fen(position, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

int find_king_square(const position_t *position, int color) {
    bitboard_t king = position->pieces[color == WHITE ? WHITE_KING : BLACK_KING];
    return king ? first_square(king) : NO_SQUARE;
}

bool square_is_attacked(const position_t *position, int square, int by_color) {
    int piece_offset = by_color == WHITE ? 0 : 6;
    if (pawn_attacks[by_color ^ 1][square] &
        position->pieces[piece_offset + PAWN]) return true;
    if (knight_attacks[square] & position->pieces[piece_offset + KNIGHT]) return true;
    if (king_attacks[square] & position->pieces[piece_offset + KING]) return true;
    if (generate_bishop_attacks(square, position->occupancy[ALL_PIECES]) &
        (position->pieces[piece_offset + BISHOP] |
         position->pieces[piece_offset + QUEEN])) return true;
    if (generate_rook_attacks(square, position->occupancy[ALL_PIECES]) &
        (position->pieces[piece_offset + ROOK] |
         position->pieces[piece_offset + QUEEN])) return true;
    return false;
}

bool side_in_check(const position_t *position, int color) {
    int king_square = find_king_square(position, color);
    return king_square != NO_SQUARE &&
           square_is_attacked(position, king_square, color ^ 1);
}

bool position_is_valid(const position_t *position) {
    bitboard_t pieces[PIECE_COUNT] = {0};
    bitboard_t occupancy[3] = {0};
    for (int square = 0; square < 64; ++square) {
        int piece = position->board[square];
        if (piece == NO_PIECE) continue;
        if ((unsigned)piece >= PIECE_COUNT) return false;
        pieces[piece] |= SQUARE_BIT(square);
        occupancy[piece_color(piece)] |= SQUARE_BIT(square);
        occupancy[ALL_PIECES] |= SQUARE_BIT(square);
    }
    if (memcmp(pieces, position->pieces, sizeof(pieces)) ||
        memcmp(occupancy, position->occupancy, sizeof(occupancy))) return false;
    if (bit_count(position->pieces[WHITE_KING]) != 1 ||
        bit_count(position->pieces[BLACK_KING]) != 1) return false;
    if (position->occupancy[WHITE] & position->occupancy[BLACK]) return false;
    if (position->side_to_move > BLACK ||
        position->castling > 15 ||
        position->en_passant > NO_SQUARE) return false;
    if (position->en_passant != NO_SQUARE) {
        int en_passant_rank = position->en_passant >> 3;
        int expected_rank = position->side_to_move == WHITE ? 5 : 2;
        int pawn_square = position->en_passant +
                          (position->side_to_move == WHITE ? -8 : 8);
        int expected_pawn = position->side_to_move == WHITE ?
                            BLACK_PAWN : WHITE_PAWN;
        if (en_passant_rank != expected_rank ||
            position->board[position->en_passant] != NO_PIECE ||
            position->board[pawn_square] != expected_pawn) return false;
    }
    return position->key == calculate_position_hash(position);
}

bool make_move(position_t *position, move_t move, undo_t *undo) {
    if (move & ~UINT32_C(0x7ffff)) return false;
    int from = MOVE_FROM(move);
    int to = MOVE_TO(move);
    int promotion = MOVE_PROMOTION(move);
    int flags = MOVE_FLAGS(move);
    int side = position->side_to_move;
    int opponent = side ^ 1;
    int piece = position->board[from];
    if (from == to ||
        !move_flags_are_valid(flags) ||
        piece == NO_PIECE ||
        piece_color(piece) != side) return false;

    int type = piece_type(piece);
    int capture_square = to;
    int captured = position->board[to];
    if (flags == (MOVE_CAPTURE | MOVE_EN_PASSANT)) {
        if (type != PAWN || promotion ||
            !en_passant_move_is_valid(position, from, to, side)) return false;
        capture_square = to + (side == WHITE ? -8 : 8);
        captured = position->board[capture_square];
    } else if (flags == MOVE_CAPTURE) {
        if (captured == NO_PIECE ||
            piece_color(captured) == side ||
            piece_type(captured) == KING) return false;
    } else if (captured != NO_PIECE) {
        return false;
    }

    if (promotion > 4 || (promotion && type != PAWN)) return false;
    int promotion_rank = side == WHITE ? 7 : 0;
    if (type == PAWN) {
        int step = side == WHITE ? 8 : -8;
        int file_delta = (to & 7) - (from & 7);
        bool reaches_promotion = (to >> 3) == promotion_rank;
        if ((promotion != 0) != reaches_promotion) return false;
        if (flags == MOVE_DOUBLE_PAWN) {
            if (!double_pawn_move_is_valid(position, from, to, side)) return false;
        } else if (flags != (MOVE_CAPTURE | MOVE_EN_PASSANT)) {
            if (flags == MOVE_CAPTURE) {
                if ((file_delta != -1 && file_delta != 1) ||
                    to - from != step + file_delta) return false;
            } else if (flags || file_delta || to - from != step) {
                return false;
            }
        }
    } else if (flags == MOVE_DOUBLE_PAWN ||
               flags == (MOVE_CAPTURE | MOVE_EN_PASSANT)) {
        return false;
    }

    if (flags == MOVE_CASTLE) {
        if (type != KING || promotion ||
            !castle_move_is_valid(position, from, to, side)) return false;
    } else if (type == KING) {
        int file_delta = (to & 7) - (from & 7);
        int rank_delta = (to >> 3) - (from >> 3);
        if (file_delta < -1 || file_delta > 1 ||
            rank_delta < -1 || rank_delta > 1) return false;
    }

    undo->key = position->key;
    undo->halfmove_clock = position->halfmove_clock;
    undo->fullmove_number = position->fullmove_number;
    undo->history_count = position->history_count;
    undo->castling = position->castling;
    undo->en_passant = position->en_passant;
    undo->king_bucket[0] = position->king_bucket[0];
    undo->king_bucket[1] = position->king_bucket[1];
    undo->moved_piece = (uint8_t)piece;
    undo->captured_piece = (uint8_t)captured;
    if (nnue_is_loaded()) {
        memcpy(undo->accumulator, position->accumulator,
               sizeof(undo->accumulator));
    }

    position->key ^= zobrist_castling[position->castling];
    if (position->en_passant != NO_SQUARE) {
        position->key ^= zobrist_en_passant[position->en_passant & 7];
    }
    position->en_passant = NO_SQUARE;
    ++position->halfmove_clock;
    if (piece_type(piece) == PAWN || captured != NO_PIECE) position->halfmove_clock = 0;
    position->castling &= castling_mask(from);
    position->castling &= castling_mask(to);

    remove_piece(position, from);
    if (captured != NO_PIECE) remove_piece(position, capture_square);

    int placed_piece = piece;
    if (promotion) placed_piece = side * 6 + promotion_type[promotion];
    place_piece(position, placed_piece, to);

    if (flags & MOVE_CASTLE) {
        if (to == 6) {
            int rook = remove_piece(position, 7);
            place_piece(position, rook, 5);
        } else if (to == 2) {
            int rook = remove_piece(position, 0);
            place_piece(position, rook, 3);
        } else if (to == 62) {
            int rook = remove_piece(position, 63);
            place_piece(position, rook, 61);
        } else if (to == 58) {
            int rook = remove_piece(position, 56);
            place_piece(position, rook, 59);
        }
    }

    if (flags & MOVE_DOUBLE_PAWN) position->en_passant = (uint8_t)((from + to) >> 1);
    // rebuild one view after king bucket change
    if (piece_type(piece) == KING && nnue_is_loaded()) {
        refresh_nnue_perspective(position, side);
    }

    position->key ^= zobrist_castling[position->castling];
    if (position->en_passant != NO_SQUARE) {
        position->key ^= zobrist_en_passant[position->en_passant & 7];
    }
    position->side_to_move = (uint8_t)opponent;
    position->key ^= zobrist_side;
    if (side == BLACK) ++position->fullmove_number;
    if (position->history_count < POSITION_HISTORY_SIZE) {
        position->history[position->history_count++] = position->key;
    }

    int king_square = find_king_square(position, side);
    if (king_square == NO_SQUARE || square_is_attacked(position, king_square, opponent)) {
        undo_move(position, move, undo);
        return false;
    }
    return true;
}

void undo_move(position_t *position, move_t move, const undo_t *undo) {
    int from = MOVE_FROM(move);
    int to = MOVE_TO(move);
    int flags = MOVE_FLAGS(move);
    int side = position->side_to_move ^ 1;

    if (flags & MOVE_CASTLE) {
        if (to == 6) {
            int rook = remove_piece(position, 5);
            place_piece(position, rook, 7);
        } else if (to == 2) {
            int rook = remove_piece(position, 3);
            place_piece(position, rook, 0);
        } else if (to == 62) {
            int rook = remove_piece(position, 61);
            place_piece(position, rook, 63);
        } else if (to == 58) {
            int rook = remove_piece(position, 59);
            place_piece(position, rook, 56);
        }
    }

    remove_piece(position, to);
    place_piece(position, undo->moved_piece, from);
    if (undo->captured_piece != NO_PIECE) {
        int square = (flags & MOVE_EN_PASSANT) ? to + (side == WHITE ? -8 : 8) : to;
        place_piece(position, undo->captured_piece, square);
    }

    position->side_to_move = (uint8_t)side;
    position->castling = undo->castling;
    position->en_passant = undo->en_passant;
    position->halfmove_clock = undo->halfmove_clock;
    position->fullmove_number = undo->fullmove_number;
    position->history_count = undo->history_count;
    position->king_bucket[0] = undo->king_bucket[0];
    position->king_bucket[1] = undo->king_bucket[1];
    position->key = undo->key;
    if (nnue_is_loaded()) {
        memcpy(position->accumulator, undo->accumulator,
               sizeof(position->accumulator));
    }
}

void move_to_uci(move_t move, char output[6]) {
    int from = MOVE_FROM(move);
    int to = MOVE_TO(move);
    output[0] = (char)('a' + (from & 7));
    output[1] = (char)('1' + (from >> 3));
    output[2] = (char)('a' + (to & 7));
    output[3] = (char)('1' + (to >> 3));
    int promotion = MOVE_PROMOTION(move);
    output[4] = promotion ? " nbrq"[promotion] : '\0';
    output[5] = '\0';
}

move_t parse_uci_move(position_t *position, const char *text) {
    move_list_t list;
    generate_moves(position, &list, false);
    for (int i = 0; i < list.count; ++i) {
        char uci_move[6];
        move_to_uci(list.moves[i], uci_move);
        if (strcmp(uci_move, text)) continue;
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        undo_move(position, list.moves[i], &undo);
        return list.moves[i];
    }
    return 0;
}

uint64_t perft(position_t *position, int depth) {
    if (!depth) return 1;
    move_list_t list;
    generate_moves(position, &list, false);
    uint64_t nodes = 0;
    for (int i = 0; i < list.count; ++i) {
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        nodes += perft(position, depth - 1);
        undo_move(position, list.moves[i], &undo);
    }
    return nodes;
}
