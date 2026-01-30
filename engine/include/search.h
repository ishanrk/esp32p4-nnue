#ifndef UBERCHESS_SEARCH_H
#define UBERCHESS_SEARCH_H

#include "move.h"
#include "pos.h"
#include "tt.h"

typedef struct {
    I32 score;
    Move best_move;
    Move pv[64];
    U32 pv_len;
    U32 depth;
    U32 seldepth;
    U64 nodes;
} SearchResult;

SearchResult search_position(Position *pos, TTTable *tt, U32 depth);
I32 search_qsearch(Position *pos, I32 alpha, I32 beta, U32 depth);
I32 search_see(const Position *pos, Move m);

#endif
