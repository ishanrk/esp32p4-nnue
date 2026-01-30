#ifndef UBERCHESS_MAKEMOVE_H
#define UBERCHESS_MAKEMOVE_H

#include <stdint.h>

#include "move.h"
#include "pos.h"

typedef struct {
    int8_t captured_piece;
    int8_t moved_piece;
    Square from;
    Square to;
    Square ep_capture_square;
    Square rook_from;
    Square rook_to;
    bool promoted;
    U64 zobrist;
    U64 pawn_key;
    U16 castling;
    Square ep_square;
    U16 halfmove_clock;
    U16 fullmove_number;
} Undo;

bool make_move(Position *pos, Move m, Undo *undo);
void unmake_move(Position *pos, Move m, const Undo *undo);

#endif
