#ifndef UBERCHESS_POS_H
#define UBERCHESS_POS_H

#include <stdint.h>

#include "types.h"

typedef struct {
    int8_t board[SQUARE_NB];
    U64 pieces[COLOR_NB][PIECE_NB];
    U64 occupancy[COLOR_NB];
    U64 all;
    U64 zobrist;
    U64 pawn_key;
    U16 castling;
    Square ep_square;
    Color side_to_move;
    U16 halfmove_clock;
    U16 fullmove_number;
} Position;

void pos_init(Position *pos);
void pos_startpos(Position *pos);
bool pos_from_fen(Position *pos, const char *fen);
void pos_rebuild_bitboards(Position *pos);
bool pos_square_attacked(const Position *pos, Square sq, Color by_side);
bool pos_in_check(const Position *pos, Color side);
Square pos_find_king(const Position *pos, Color side);

#endif
