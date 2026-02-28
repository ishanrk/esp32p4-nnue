#include "ch.h"


bb_t g_kn[64];
bb_t g_kg[64];
bb_t g_pa[2][64];
bb_t g_ray[8][64];
u64 g_zpc[PC_N][64];
u64 g_zca[16];
u64 g_zep[8];
u64 g_zside;

static u64 rnd(u64 *x) {
    u64 z = (*x += UINT64_C(0x9e3779b97f4a7c15));
    z = (z ^ (z >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
    z = (z ^ (z >> 27)) * UINT64_C(0x94d049bb133111eb);
    return z ^ (z >> 31);
}

static bb_t ray(int sq, int df, int dr) {
    bb_t x = 0;
    int f = sq & 7;
    int r = sq >> 3;
    for (;;) {
        f += df;
        r += dr;
        if ((unsigned)f > 7u || (unsigned)r > 7u) break;
        x |= BIT(SQ(f, r));
    }
    return x;
}

void ch_init(void) {
    static bool done;
    if (done) return;
    done = true;

    static const int kdf[8] = {1, 2, 2, 1, -1, -2, -2, -1};
    static const int kdr[8] = {2, 1, -1, -2, -2, -1, 1, 2};
    static const int gdf[8] = {0, 0, 1, -1, 1, -1, 1, -1};
    static const int gdr[8] = {1, -1, 0, 0, 1, 1, -1, -1};

    for (int sq = 0; sq < 64; ++sq) {
        int f = sq & 7;
        int r = sq >> 3;
        for (int i = 0; i < 8; ++i) {
            int nf = f + kdf[i];
            int nr = r + kdr[i];
            if ((unsigned)nf < 8u && (unsigned)nr < 8u) g_kn[sq] |= BIT(SQ(nf, nr));
        }
        for (int df = -1; df <= 1; ++df) {
            for (int dr = -1; dr <= 1; ++dr) {
                if (!df && !dr) continue;
                int nf = f + df;
                int nr = r + dr;
                if ((unsigned)nf < 8u && (unsigned)nr < 8u) g_kg[sq] |= BIT(SQ(nf, nr));
            }
        }
        if (r < 7) {
            if (f) g_pa[W][sq] |= BIT(sq + 7);
            if (f < 7) g_pa[W][sq] |= BIT(sq + 9);
        }
        if (r) {
            if (f) g_pa[B][sq] |= BIT(sq - 9);
            if (f < 7) g_pa[B][sq] |= BIT(sq - 7);
        }
        for (int d = 0; d < 8; ++d) g_ray[d][sq] = ray(sq, gdf[d], gdr[d]);
    }

    u64 s = UINT64_C(0x7069346e6e756531);
    for (int pc = 0; pc < PC_N; ++pc) {
        for (int sq = 0; sq < 64; ++sq) g_zpc[pc][sq] = rnd(&s);
    }
    for (int i = 0; i < 16; ++i) g_zca[i] = rnd(&s);
    for (int i = 0; i < 8; ++i) g_zep[i] = rnd(&s);
    g_zside = rnd(&s);
}

static bb_t line(int sq, bb_t occ, int d, bool hi) {
    // trim squares beyond nearest blocker
    bb_t r = g_ray[d][sq];
    bb_t b = r & occ;
    if (!b) return r;
    int s = hi ? 63 - __builtin_clzll(b) : __builtin_ctzll(b);
    return r ^ g_ray[d][s];
}

bb_t bb_bi(int sq, bb_t occ) {
    return line(sq, occ, 4, false) |
           line(sq, occ, 5, false) |
           line(sq, occ, 6, true) |
           line(sq, occ, 7, true);
}

bb_t bb_ro(int sq, bb_t occ) {
    return line(sq, occ, 0, false) |
           line(sq, occ, 1, true) |
           line(sq, occ, 2, false) |
           line(sq, occ, 3, true);
}
