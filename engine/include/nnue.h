#ifndef UBERCHESS_NNUE_H
#define UBERCHESS_NNUE_H

#include "pos.h"

typedef struct {
    I32 placeholder;
} NNUEState;

void nnue_init(void);
bool nnue_load(const char *path);
bool nnue_is_loaded(void);
void nnue_refresh(const Position *pos, NNUEState *state);
I32 nnue_evaluate(const NNUEState *state, const Position *pos);

#endif
