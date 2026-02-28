#include "ch.h"

static const int val[6] = {100, 320, 330, 500, 900, 0};

static int psq(int t, int sq, int c) {
    if (c == B) sq ^= 56;
    int f = sq & 7;
    int r = sq >> 3;
    int df = f < 4 ? 3 - f : f - 4;
    int dr = r < 4 ? 3 - r : r - 4;
    int ctr = 6 - df - dr;
    if (t == P) return r * 6 + ctr;
    if (t == N) return ctr * 8;
    if (t == BI) return ctr * 5;
    if (t == R) return r * 2;
    if (t == Q) return ctr * 2;
    return r < 2 ? 12 - ctr * 2 : -ctr * 2;
}

int eval(const pos_t *p) {
    if (nn_on()) return nn_eval(p);
    int s = 0;
    for (int pc = 0; pc < PC_N; ++pc) {
        int c = pc_col(pc);
        int t = pc_typ(pc);
        bb_t x = p->bb[pc];
        while (x) {
            int sq = poplsb(&x);
            int v = val[t] + psq(t, sq, c);
            s += c == W ? v : -v;
        }
    }
    return p->side == W ? s : -s;
}
