#include "move.h"

Move move_make(Square from, Square to, U32 flags, U32 promo) {
    return (Move)((U32)from | ((U32)to << 6) | (flags << 12) | (promo << 20));
}

Square move_from(Move m) {
    return (Square)(m & 0x3F);
}

Square move_to(Move m) {
    return (Square)((m >> 6) & 0x3F);
}

U32 move_flags(Move m) {
    return (U32)((m >> 12) & 0xFF);
}

U32 move_promo(Move m) {
    return (U32)((m >> 20) & 0xF);
}

bool move_is_null(Move m) {
    return m == 0;
}

bool square_from_str(const char *s, Square *sq) {
    if (!s || !sq) {
        return false;
    }
    if (s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8') {
        return false;
    }
    int file = s[0] - 'a';
    int rank = s[1] - '1';
    *sq = (Square)(rank * 8 + file);
    return true;
}

void square_to_str(Square sq, char out[3]) {
    int file = (int)sq % 8;
    int rank = (int)sq / 8;
    out[0] = (char)('a' + file);
    out[1] = (char)('1' + rank);
    out[2] = '\0';
}

void move_to_uci(Move m, char out[6]) {
    char from[3];
    char to[3];
    square_to_str(move_from(m), from);
    square_to_str(move_to(m), to);
    out[0] = from[0];
    out[1] = from[1];
    out[2] = to[0];
    out[3] = to[1];
    if (move_flags(m) & MOVE_FLAG_PROMO) {
        static const char promo_map[7] = {'q', 'n', 'b', 'r', 'q', 'k', 'q'};
        U32 p = move_promo(m);
        if (p > PIECE_KING) {
            p = PIECE_QUEEN;
        }
        out[4] = promo_map[p];
        out[5] = '\0';
    } else {
        out[4] = '\0';
    }
}
