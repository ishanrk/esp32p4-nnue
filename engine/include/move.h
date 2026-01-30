#ifndef UBERCHESS_MOVE_H
#define UBERCHESS_MOVE_H

#include <stdbool.h>

#include "types.h"

typedef U32 Move;

enum {
    MOVE_FLAG_NONE = 0,
    MOVE_FLAG_CAPTURE = 1 << 0,
    MOVE_FLAG_PROMO = 1 << 1,
    MOVE_FLAG_ENPASSANT = 1 << 2,
    MOVE_FLAG_CASTLE = 1 << 3,
    MOVE_FLAG_DOUBLE_PAWN = 1 << 4
};

Move move_make(Square from, Square to, U32 flags, U32 promo);
Square move_from(Move m);
Square move_to(Move m);
U32 move_flags(Move m);
U32 move_promo(Move m);
bool move_is_null(Move m);

bool square_from_str(const char *s, Square *sq);
void square_to_str(Square sq, char out[3]);
void move_to_uci(Move m, char out[6]);

#endif
