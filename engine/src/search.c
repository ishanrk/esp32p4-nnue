#include "search.h"

#include "eval.h"
#include "makemove.h"
#include "movegen.h"
#include "telemetry.h"

typedef struct {
    U64 nodes;
    U32 seldepth;
} SearchCtx;

static const I32 kMate = 30000;
static const I32 piece_value[7] = {0, 100, 320, 330, 500, 900, 20000};

static I32 negamax(Position *pos, I32 alpha, I32 beta, U32 depth, U32 ply, SearchCtx *ctx, Move *pv, U32 *pv_len) {
    ctx->nodes++;
    if (ply > ctx->seldepth) {
        ctx->seldepth = ply;
    }

    if (depth == 0) {
        return search_qsearch(pos, alpha, beta, 4);
    }

    MoveList list;
    movegen_legal(pos, &list);
    if (list.count == 0) {
        if (pos_in_check(pos, pos->side_to_move)) {
            return -kMate + (I32)ply;
        }
        return 0;
    }

    Move best = 0;
    Move child_pv[64];
    U32 child_len = 0;
    I32 best_score = -kMate;

    for (U32 i = 0; i < list.count; i++) {
        Undo u;
        if (!make_move(pos, list.moves[i], &u)) {
            continue;
        }
        I32 score = -negamax(pos, -beta, -alpha, depth - 1, ply + 1, ctx, child_pv, &child_len);
        unmake_move(pos, list.moves[i], &u);
        if (score > best_score) {
            best_score = score;
            best = list.moves[i];
            pv[0] = best;
            for (U32 j = 0; j < child_len && j + 1 < 64; j++) {
                pv[j + 1] = child_pv[j];
            }
            *pv_len = child_len + 1;
        }
        if (score > alpha) {
            alpha = score;
        }
        if (alpha >= beta) {
            break;
        }
    }
    if (move_is_null(best)) {
        *pv_len = 0;
    }
    return best_score;
}

SearchResult search_position(Position *pos, TTTable *tt, U32 depth) {
    (void)tt;
    SearchCtx ctx = {0, 0};
    Move pv[64] = {0};
    U32 pv_len = 0;
    I32 score = negamax(pos, -kMate, kMate, depth, 0, &ctx, pv, &pv_len);

    SearchResult result;
    result.score = score;
    result.best_move = pv_len > 0 ? pv[0] : 0;
    for (U32 i = 0; i < pv_len && i < 64; i++) {
        result.pv[i] = pv[i];
    }
    result.pv_len = pv_len;
    result.depth = depth;
    result.seldepth = ctx.seldepth;
    result.nodes = ctx.nodes;

    Telemetry t;
    telemetry_reset(&t);
    telemetry_set_depth(&t, result.depth, result.seldepth);
    telemetry_set_nodes(&t, result.nodes, 0);
    telemetry_set_tt_hit(&t, 0);
    telemetry_set_pv(&t, result.pv, result.pv_len);
    telemetry_emit_root(&t);

    return result;
}

I32 search_qsearch(Position *pos, I32 alpha, I32 beta, U32 depth) {
    I32 stand_pat = eval_position(pos);
    if (stand_pat >= beta) {
        return beta;
    }
    if (stand_pat > alpha) {
        alpha = stand_pat;
    }
    if (depth == 0) {
        return alpha;
    }

    MoveList list;
    movegen_legal(pos, &list);
    for (U32 i = 0; i < list.count; i++) {
        if ((move_flags(list.moves[i]) & MOVE_FLAG_CAPTURE) == 0) {
            continue;
        }
        Undo u;
        if (!make_move(pos, list.moves[i], &u)) {
            continue;
        }
        I32 score = -search_qsearch(pos, -beta, -alpha, depth - 1);
        unmake_move(pos, list.moves[i], &u);
        if (score >= beta) {
            return beta;
        }
        if (score > alpha) {
            alpha = score;
        }
    }
    return alpha;
}

I32 search_see(const Position *pos, Move m) {
    Square from = move_from(m);
    Square to = move_to(m);
    int8_t moving = pos->board[from];
    int8_t target = pos->board[to];
    if ((move_flags(m) & MOVE_FLAG_ENPASSANT) && target == 0) {
        target = pos->side_to_move == COLOR_WHITE ? -1 : 1;
    }
    int a = moving < 0 ? -moving : moving;
    int b = target < 0 ? -target : target;
    return piece_value[b] - piece_value[a];
}
