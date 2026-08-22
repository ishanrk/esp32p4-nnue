#include "ch.h"

#include <stdlib.h>
#include <string.h>

#define INF 32000
#define MATE 30000

typedef struct {
    tt_t *tt;
    mv_t killer[MAX_PLY][2];
    mv_t pv[MAX_PLY][MAX_PLY];
    u8 pn[MAX_PLY];
    int hist[PC_N][64];
    u64 nodes;
    u64 start;
    u64 end;
    bool stop;
} sc_t;

bool tt_new(tt_t *t, size_t mb) {
    tt_free(t);
    if (!mb) return true;
    size_t n = (mb << 20) / sizeof(tt_e);
    size_t p = 1;
    while ((p << 1) <= n) p <<= 1;
    t->e = calloc(p, sizeof(*t->e));
    if (!t->e) return false;
    t->n = p;
    return true;
}

void tt_free(tt_t *t) {
    free(t->e);
    t->e = NULL;
    t->n = 0;
}

void tt_clear(tt_t *t) {
    if (t->e) memset(t->e, 0, t->n * sizeof(*t->e));
}

static bool rep(const pos_t *p) {
    if (p->hm >= 100) return true;
    int end = (int)p->hp - 1 - p->hm;
    if (end < 0) end = 0;
    for (int i = (int)p->hp - 3; i >= end; i -= 2) {
        if (p->hist[i] == p->key) return true;
    }
    return false;
}

static int tt_get(sc_t *s, u64 key, int depth, int alpha, int beta, int ply, mv_t *mv) {
    if (!s->tt || !s->tt->n) return INF;
    tt_e *e = &s->tt->e[key & (s->tt->n - 1)];
    if (e->key != key) return INF;
    *mv = e->mv;
    int v = e->score;
    if (v > MATE - MAX_PLY) v -= ply;
    else if (v < -MATE + MAX_PLY) v += ply;
    if (e->depth < depth) return INF;
    if (e->flag == TT_EXACT) return v;
    if (e->flag == TT_LO && v >= beta) return v;
    if (e->flag == TT_HI && v <= alpha) return v;
    return INF;
}

static void tt_put(sc_t *s, u64 key, int depth, int score, int flag, mv_t mv, int ply) {
    if (!s->tt || !s->tt->n) return;
    tt_e *e = &s->tt->e[key & (s->tt->n - 1)];
    if (e->key == key && e->depth > depth && flag != TT_EXACT) return;
    int v = score;
    if (v > MATE - MAX_PLY) v += ply;
    else if (v < -MATE + MAX_PLY) v -= ply;
    e->key = key;
    e->mv = mv;
    e->score = (i16)v;
    e->depth = (i8)depth;
    e->flag = (u8)flag;
}

static void tick(sc_t *s) {
    ++s->nodes;
    if ((s->nodes & 2047u) == 0 && s->end && sys_ms() >= s->end) s->stop = true;
}

static int mscore(sc_t *s, const pos_t *p, mv_t m, mv_t tt, int ply) {
    if (m == tt) return 2000000000;
    int fl = MV_FL(m);
    int pr = MV_PR(m);
    if (fl & MF_CAP) {
        int cap = (fl & MF_EP) ? (p->side == W ? BP : WP) : p->sq[MV_TO(m)];
        int pc = p->sq[MV_FR(m)];
        return 1000000 + pc_typ(cap) * 32 - pc_typ(pc) + pr * 128;
    }
    if (pr) return 900000 + pr * 128;
    if (s->killer[ply][0] == m) return 800000;
    if (s->killer[ply][1] == m) return 700000;
    int pc = p->sq[MV_FR(m)];
    return s->hist[pc][MV_TO(m)];
}

static void pick(sc_t *s, const pos_t *p, ml_t *l, int i, mv_t tt, int ply) {
    int bi = i;
    int bs = mscore(s, p, l->v[i], tt, ply);
    for (int j = i + 1; j < l->n; ++j) {
        int x = mscore(s, p, l->v[j], tt, ply);
        if (x > bs) {
            bs = x;
            bi = j;
        }
    }
    mv_t m = l->v[i];
    l->v[i] = l->v[bi];
    l->v[bi] = m;
}

static int qsearch(sc_t *s, pos_t *p, int alpha, int beta, int ply) {
    tick(s);
    if (s->stop) return 0;
    if (ply >= MAX_PLY - 1) return eval(p);
    bool chk = pos_chk(p, p->side);
    if (!chk) {
        int v = eval(p);
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
    }

    ml_t l;
    gen(p, &l, !chk);
    int legal = 0;
    for (int i = 0; i < l.n; ++i) {
        pick(s, p, &l, i, 0, ply);
        undo_t u;
        if (!mv_do(p, l.v[i], &u)) continue;
        ++legal;
        int v = -qsearch(s, p, -beta, -alpha, ply + 1);
        mv_undo(p, l.v[i], &u);
        if (s->stop) return 0;
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
    }
    if (chk && !legal) return -MATE + ply;
    return alpha;
}

static int neg(sc_t *s, pos_t *p, int depth, int alpha, int beta, int ply) {
    tick(s);
    s->pn[ply] = 0;
    if (s->stop) return 0;
    if (ply >= MAX_PLY - 1) return eval(p);
    if (ply && rep(p)) return 0;

    bool chk = pos_chk(p, p->side);
    if (chk) ++depth;
    if (depth <= 0) return qsearch(s, p, alpha, beta, ply);

    int olda = alpha;
    mv_t ttm = 0;
    int tv = tt_get(s, p->key, depth, alpha, beta, ply, &ttm);
    if (tv != INF && ply) return tv;

    ml_t l;
    gen(p, &l, false);
    mv_t best = 0;
    int bestv = -INF;
    int legal = 0;

    for (int i = 0; i < l.n; ++i) {
        pick(s, p, &l, i, ttm, ply);
        mv_t m = l.v[i];
        int quiet = !(MV_FL(m) & MF_CAP) && !MV_PR(m);
        undo_t u;
        if (!mv_do(p, m, &u)) continue;
        bool gives = pos_chk(p, p->side);
        int v;
        if (!legal) {
            v = -neg(s, p, depth - 1, -beta, -alpha, ply + 1);
        } else {
            // reduce late quiet moves
            int red = depth >= 3 && legal >= 4 && quiet && !chk && !gives;
            v = -neg(s, p, depth - 1 - red, -alpha - 1, -alpha, ply + 1);
            if (!s->stop && red && v > alpha) v = -neg(s, p, depth - 1, -alpha - 1, -alpha, ply + 1);
            if (!s->stop && v > alpha && v < beta) v = -neg(s, p, depth - 1, -beta, -alpha, ply + 1);
        }
        mv_undo(p, m, &u);
        if (s->stop) return 0;
        ++legal;

        if (v > bestv) {
            bestv = v;
            best = m;
        }
        if (v > alpha) {
            alpha = v;
            s->pv[ply][0] = m;
            int n = s->pn[ply + 1];
            if (n > MAX_PLY - ply - 1) n = MAX_PLY - ply - 1;
            memcpy(&s->pv[ply][1], s->pv[ply + 1], (size_t)n * sizeof(mv_t));
            s->pn[ply] = (u8)(n + 1);
        }
        if (alpha >= beta) {
            if (quiet) {
                if (s->killer[ply][0] != m) {
                    s->killer[ply][1] = s->killer[ply][0];
                    s->killer[ply][0] = m;
                }
                int pc = p->sq[MV_FR(m)];
                int *h = &s->hist[pc][MV_TO(m)];
                *h += depth * depth;
                if (*h > 1000000) {
                    for (int a = 0; a < PC_N; ++a) {
                        for (int b = 0; b < 64; ++b) s->hist[a][b] >>= 1;
                    }
                }
            }
            break;
        }
    }

    if (!legal) return chk ? -MATE + ply : 0;
    int flag = bestv <= olda ? TT_HI : bestv >= beta ? TT_LO : TT_EXACT;
    tt_put(s, p->key, depth, bestv, flag, best, ply);
    return bestv;
}

sr_t search(pos_t *p, tt_t *t, lim_t lim, info_fn fn, void *arg) {
    sr_t out;
    memset(&out, 0, sizeof(out));
    sc_t *s = calloc(1, sizeof(*s));
    if (!s) return out;
    s->tt = t;
    s->start = sys_ms();
    s->end = lim.ms ? s->start + lim.ms : 0;
    int maxd = lim.depth > 0 ? lim.depth : 64;
    if (maxd >= MAX_PLY) maxd = MAX_PLY - 1;

    for (int d = 1; d <= maxd; ++d) {
        s->pn[0] = 0;
        int v = neg(s, p, d, -INF, INF, 0);
        if (s->stop) break;
        out.score = v;
        out.depth = d;
        out.nodes = s->nodes;
        out.ms = sys_ms() - s->start;
        out.pn = s->pn[0];
        memcpy(out.pv, s->pv[0], (size_t)out.pn * sizeof(mv_t));
        out.best = out.pn ? out.pv[0] : 0;
        if (fn) fn(&out, arg);
        if (v > MATE - MAX_PLY || v < -MATE + MAX_PLY) break;
    }

    if (!out.best) {
        ml_t l;
        gen(p, &l, false);
        for (int i = 0; i < l.n; ++i) {
            undo_t u;
            if (!mv_do(p, l.v[i], &u)) continue;
            mv_undo(p, l.v[i], &u);
            out.best = l.v[i];
            break;
        }
    }
    out.nodes = s->nodes;
    out.ms = sys_ms() - s->start;
    free(s);
    return out;
}
