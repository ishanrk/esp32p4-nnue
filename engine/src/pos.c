#include "pos.h"
#include "move.h"

#include <ctype.h>
#include <string.h>

static int8_t fen_piece_to_code(char c) {
    switch (c) {
        case 'P': return 1;
        case 'N': return 2;
        case 'B': return 3;
        case 'R': return 4;
        case 'Q': return 5;
        case 'K': return 6;
        case 'p': return -1;
        case 'n': return -2;
        case 'b': return -3;
        case 'r': return -4;
        case 'q': return -5;
        case 'k': return -6;
        default: return 0;
    }
}

static Piece code_to_piece(int8_t code) {
    int v = code < 0 ? -code : code;
    return (Piece)(v - 1);
}

static Color code_to_color(int8_t code) {
    return code > 0 ? COLOR_WHITE : COLOR_BLACK;
}

void pos_init(Position *pos) {
    if (!pos) {
        return;
    }
    memset(pos->board, 0, sizeof(pos->board));
    for (int c = 0; c < COLOR_NB; c++) {
        for (int p = 0; p < PIECE_NB; p++) {
            pos->pieces[c][p] = 0;
        }
        pos->occupancy[c] = 0;
    }
    pos->all = 0;
    pos->zobrist = 0;
    pos->pawn_key = 0;
    pos->castling = 0;
    pos->ep_square = SQUARE_NONE;
    pos->side_to_move = COLOR_WHITE;
    pos->halfmove_clock = 0;
    pos->fullmove_number = 1;
}

void pos_rebuild_bitboards(Position *pos) {
    for (int c = 0; c < COLOR_NB; c++) {
        for (int p = 0; p < PIECE_NB; p++) {
            pos->pieces[c][p] = 0;
        }
        pos->occupancy[c] = 0;
    }
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        int8_t code = pos->board[sq];
        if (code == 0) {
            continue;
        }
        Color side = code_to_color(code);
        Piece pt = code_to_piece(code);
        U64 bit = 1ULL << sq;
        pos->pieces[side][pt] |= bit;
        pos->occupancy[side] |= bit;
    }
    pos->all = pos->occupancy[COLOR_WHITE] | pos->occupancy[COLOR_BLACK];
}

void pos_startpos(Position *pos) {
    static const char *start_fen =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    pos_from_fen(pos, start_fen);
}

Square pos_find_king(const Position *pos, Color side) {
    int target = side == COLOR_WHITE ? 6 : -6;
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        if (pos->board[sq] == target) {
            return (Square)sq;
        }
    }
    return SQUARE_NONE;
}

static bool inside(int file, int rank) {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

static Square make_sq(int file, int rank) {
    return (Square)(rank * 8 + file);
}

bool pos_square_attacked(const Position *pos, Square sq, Color by_side) {
    int file = (int)sq % 8;
    int rank = (int)sq / 8;
    int pawn = by_side == COLOR_WHITE ? 1 : -1;
    int knight = by_side == COLOR_WHITE ? 2 : -2;
    int bishop = by_side == COLOR_WHITE ? 3 : -3;
    int rook = by_side == COLOR_WHITE ? 4 : -4;
    int queen = by_side == COLOR_WHITE ? 5 : -5;
    int king = by_side == COLOR_WHITE ? 6 : -6;

    int pawn_rank = by_side == COLOR_WHITE ? rank - 1 : rank + 1;
    if (inside(file - 1, pawn_rank) && pos->board[make_sq(file - 1, pawn_rank)] == pawn) {
        return true;
    }
    if (inside(file + 1, pawn_rank) && pos->board[make_sq(file + 1, pawn_rank)] == pawn) {
        return true;
    }

    static const int knight_df[8] = {-2, -1, 1, 2, 2, 1, -1, -2};
    static const int knight_dr[8] = {1, 2, 2, 1, -1, -2, -2, -1};
    for (int i = 0; i < 8; i++) {
        int nf = file + knight_df[i];
        int nr = rank + knight_dr[i];
        if (inside(nf, nr) && pos->board[make_sq(nf, nr)] == knight) {
            return true;
        }
    }

    static const int bdf[4] = {1, 1, -1, -1};
    static const int bdr[4] = {1, -1, 1, -1};
    for (int d = 0; d < 4; d++) {
        int nf = file + bdf[d];
        int nr = rank + bdr[d];
        while (inside(nf, nr)) {
            int8_t code = pos->board[make_sq(nf, nr)];
            if (code != 0) {
                if (code == bishop || code == queen) {
                    return true;
                }
                break;
            }
            nf += bdf[d];
            nr += bdr[d];
        }
    }

    static const int rdf[4] = {1, -1, 0, 0};
    static const int rdr[4] = {0, 0, 1, -1};
    for (int d = 0; d < 4; d++) {
        int nf = file + rdf[d];
        int nr = rank + rdr[d];
        while (inside(nf, nr)) {
            int8_t code = pos->board[make_sq(nf, nr)];
            if (code != 0) {
                if (code == rook || code == queen) {
                    return true;
                }
                break;
            }
            nf += rdf[d];
            nr += rdr[d];
        }
    }

    for (int df = -1; df <= 1; df++) {
        for (int dr = -1; dr <= 1; dr++) {
            if (df == 0 && dr == 0) {
                continue;
            }
            int nf = file + df;
            int nr = rank + dr;
            if (inside(nf, nr) && pos->board[make_sq(nf, nr)] == king) {
                return true;
            }
        }
    }

    return false;
}

bool pos_in_check(const Position *pos, Color side) {
    Square king_sq = pos_find_king(pos, side);
    if (king_sq == SQUARE_NONE) {
        return false;
    }
    Color enemy = side == COLOR_WHITE ? COLOR_BLACK : COLOR_WHITE;
    return pos_square_attacked(pos, king_sq, enemy);
}

bool pos_from_fen(Position *pos, const char *fen) {
    pos_init(pos);
    if (!fen || !*fen) {
        return false;
    }

    int rank = 7;
    int file = 0;
    const char *p = fen;

    while (*p && *p != ' ') {
        if (*p == '/') {
            rank--;
            file = 0;
            p++;
            continue;
        }
        if (isdigit((unsigned char)*p)) {
            file += *p - '0';
            p++;
            continue;
        }
        if (file < 0 || file > 7 || rank < 0 || rank > 7) {
            return false;
        }
        int8_t code = fen_piece_to_code(*p);
        if (code == 0) {
            return false;
        }
        pos->board[rank * 8 + file] = code;
        file++;
        p++;
    }
    if (*p != ' ') {
        return false;
    }
    p++;

    if (*p == 'w') {
        pos->side_to_move = COLOR_WHITE;
    } else if (*p == 'b') {
        pos->side_to_move = COLOR_BLACK;
    } else {
        return false;
    }
    p++;
    if (*p != ' ') {
        return false;
    }
    p++;

    pos->castling = 0;
    if (*p == '-') {
        p++;
    } else {
        while (*p && *p != ' ') {
            if (*p == 'K') pos->castling |= 1;
            if (*p == 'Q') pos->castling |= 2;
            if (*p == 'k') pos->castling |= 4;
            if (*p == 'q') pos->castling |= 8;
            p++;
        }
    }
    if (*p != ' ') {
        return false;
    }
    p++;

    if (*p == '-') {
        pos->ep_square = SQUARE_NONE;
        p++;
    } else {
        Square ep = SQUARE_NONE;
        if (!square_from_str(p, &ep)) {
            return false;
        }
        pos->ep_square = ep;
        p += 2;
    }

    while (*p == ' ') {
        p++;
    }
    pos->halfmove_clock = 0;
    while (isdigit((unsigned char)*p)) {
        pos->halfmove_clock = (U16)(pos->halfmove_clock * 10 + (U16)(*p - '0'));
        p++;
    }
    while (*p == ' ') {
        p++;
    }
    pos->fullmove_number = 1;
    if (isdigit((unsigned char)*p)) {
        pos->fullmove_number = 0;
        while (isdigit((unsigned char)*p)) {
            pos->fullmove_number = (U16)(pos->fullmove_number * 10 + (U16)(*p - '0'));
            p++;
        }
        if (pos->fullmove_number == 0) {
            pos->fullmove_number = 1;
        }
    }

    pos_rebuild_bitboards(pos);
    return true;
}
