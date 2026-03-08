#include "ch.h"

#include <ctype.h>
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
        } else if (isdigit((unsigned char)*cursor)) {
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
    return position->key == calculate_position_hash(position);
}

bool make_move(position_t *position, move_t move, undo_t *undo) {
    int from = MOVE_FROM(move);
    int to = MOVE_TO(move);
    int promotion = MOVE_PROMOTION(move);
    int flags = MOVE_FLAGS(move);
    int side = position->side_to_move;
    int opponent = side ^ 1;
    int piece = position->board[from];
    if ((unsigned)from > 63u ||
        (unsigned)to > 63u ||
        piece == NO_PIECE ||
        piece_color(piece) != side) return false;
    if (position->board[to] != NO_PIECE &&
        piece_color(position->board[to]) == side) return false;
    if (promotion && (promotion > 4 || piece_type(piece) != PAWN)) return false;
    if ((flags & MOVE_CASTLE) && piece_type(piece) != KING) return false;
    if ((flags & MOVE_CASTLE) && to != 6 && to != 2 && to != 62 && to != 58) return false;
    if ((flags & MOVE_CASTLE) && ((to == 6 && position->board[7] != WHITE_ROOK) ||
                         (to == 2 && position->board[0] != WHITE_ROOK) ||
                         (to == 62 && position->board[63] != BLACK_ROOK) ||
                         (to == 58 && position->board[56] != BLACK_ROOK))) return false;

    int capture_square = to;
    int captured = position->board[to];
    if (flags & MOVE_EN_PASSANT) {
        capture_square = to + (side == WHITE ? -8 : 8);
        captured = position->board[capture_square];
        if (captured != (side == WHITE ? BLACK_PAWN : WHITE_PAWN)) return false;
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
