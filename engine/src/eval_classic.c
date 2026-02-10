#include "eval.h"
#include "nnue.h"

static const I32 piece_value[7] = {0, 100, 320, 330, 500, 900, 0};

I32 eval_classic(const Position *pos) {
    I32 score = 0;
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        int8_t p = pos->board[sq];
        if (p == 0) {
            continue;
        }
        int ap = p < 0 ? -p : p;
        I32 v = piece_value[ap];
        score += p > 0 ? v : -v;
    }
    return pos->side_to_move == COLOR_WHITE ? score : -score;
}

I32 eval_nnue(const Position *pos) {
    NNUEState state;
    nnue_refresh(pos, &state);
    return nnue_evaluate(&state, pos);
}

I32 eval_position(const Position *pos) {
    if (nnue_is_loaded()) {
        return eval_nnue(pos);
    }
    return eval_classic(pos);
}
