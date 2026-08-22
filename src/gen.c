#include "ch.h"

static void push(ml_t *l, int fr, int to, int pr, int fl) {
    if (l->n < MAX_MV) l->v[l->n++] = MV(fr, to, pr, fl);
}

static void promo(ml_t *l, int fr, int to, int fl) {
    push(l, fr, to, 4, fl);
    push(l, fr, to, 3, fl);
    push(l, fr, to, 2, fl);
    push(l, fr, to, 1, fl);
}

static void pawns(const pos_t *p, ml_t *l, bool caps) {
    int us = p->side;
    int pc = us == W ? WP : BP;
    int step = us == W ? 8 : -8;
    int start = us == W ? 1 : 6;
    int last = us == W ? 6 : 1;
    bb_t x = p->bb[pc];

    while (x) {
        int fr = poplsb(&x);
        int f = fr & 7;
        int r = fr >> 3;
        int to = fr + step;
        if ((unsigned)to < 64u && p->sq[to] == NO_PC) {
            if (r == last) promo(l, fr, to, 0);
            else if (!caps) {
                push(l, fr, to, 0, 0);
                int to2 = to + step;
                if (r == start && p->sq[to2] == NO_PC) push(l, fr, to2, 0, MF_DB);
            }
        }

        int a[2] = {fr + step - 1, fr + step + 1};
        for (int i = 0; i < 2; ++i) {
            if ((i == 0 && !f) || (i == 1 && f == 7)) continue;
            to = a[i];
            if ((unsigned)to >= 64u) continue;
            int fl = 0;
            if (to == p->ep) fl = MF_CAP | MF_EP;
            else if (p->sq[to] != NO_PC && pc_col(p->sq[to]) != us) fl = MF_CAP;
            else continue;
            if (r == last) promo(l, fr, to, fl);
            else push(l, fr, to, 0, fl);
        }
    }
}

static void leapers(const pos_t *p, ml_t *l, bool caps, int pc, const bb_t *tab) {
    int us = p->side;
    bb_t own = p->occ[us];
    bb_t enemy = p->occ[us ^ 1];
    bb_t x = p->bb[pc];
    while (x) {
        int fr = poplsb(&x);
        bb_t a = tab[fr] & ~own;
        if (caps) a &= enemy;
        while (a) {
            int to = poplsb(&a);
            push(l, fr, to, 0, p->sq[to] == NO_PC ? 0 : MF_CAP);
        }
    }
}

static void sliders(const pos_t *p, ml_t *l, bool caps, int pc, int kind) {
    int us = p->side;
    bb_t own = p->occ[us];
    bb_t enemy = p->occ[us ^ 1];
    bb_t x = p->bb[pc];
    while (x) {
        int fr = poplsb(&x);
        bb_t a = kind == BI ? bb_bi(fr, p->occ[O_A]) :
                 kind == R ? bb_ro(fr, p->occ[O_A]) :
                 bb_bi(fr, p->occ[O_A]) | bb_ro(fr, p->occ[O_A]);
        a &= ~own;
        if (caps) a &= enemy;
        while (a) {
            int to = poplsb(&a);
            push(l, fr, to, 0, p->sq[to] == NO_PC ? 0 : MF_CAP);
        }
    }
}

static void castles(const pos_t *p, ml_t *l) {
    int us = p->side;
    int them = us ^ 1;
    if (pos_chk(p, us)) return;
    if (us == W && p->sq[4] == WK) {
        if ((p->ca & CA_WK) && p->sq[7] == WR && p->sq[5] == NO_PC && p->sq[6] == NO_PC &&
            !pos_att(p, 5, them) && !pos_att(p, 6, them)) push(l, 4, 6, 0, MF_CA);
        if ((p->ca & CA_WQ) && p->sq[0] == WR && p->sq[1] == NO_PC && p->sq[2] == NO_PC &&
            p->sq[3] == NO_PC && !pos_att(p, 3, them) && !pos_att(p, 2, them)) push(l, 4, 2, 0, MF_CA);
    } else if (us == B && p->sq[60] == BK) {
        if ((p->ca & CA_BK) && p->sq[63] == BR && p->sq[61] == NO_PC && p->sq[62] == NO_PC &&
            !pos_att(p, 61, them) && !pos_att(p, 62, them)) push(l, 60, 62, 0, MF_CA);
        if ((p->ca & CA_BQ) && p->sq[56] == BR && p->sq[57] == NO_PC && p->sq[58] == NO_PC &&
            p->sq[59] == NO_PC && !pos_att(p, 59, them) && !pos_att(p, 58, them)) push(l, 60, 58, 0, MF_CA);
    }
}

void gen(const pos_t *p, ml_t *l, bool caps) {
    l->n = 0;
    int o = p->side == W ? 0 : 6;
    pawns(p, l, caps);
    leapers(p, l, caps, o + N, g_kn);
    sliders(p, l, caps, o + BI, BI);
    sliders(p, l, caps, o + R, R);
    sliders(p, l, caps, o + Q, Q);
    leapers(p, l, caps, o + K, g_kg);
    if (!caps) castles(p, l);
}
