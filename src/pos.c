#include "ch.h"

#include <ctype.h>
#include <stdlib.h>
#include <string.h>

static const char pcs[] = "PNBRQKpnbrqk";
static const int pr_t[5] = {P, N, BI, R, Q};

static int pc_chr(char c) {
    const char *p = strchr(pcs, c);
    return p ? (int)(p - pcs) : NO_PC;
}

static void raw_put(pos_t *p, int pc, int sq) {
    bb_t b = BIT(sq);
    p->sq[sq] = (u8)pc;
    p->bb[pc] |= b;
    p->occ[pc_col(pc)] |= b;
    p->occ[O_A] |= b;
}

static void put(pos_t *p, int pc, int sq) {
    raw_put(p, pc, sq);
    p->key ^= g_zpc[pc][sq];
    nn_add(p, pc, sq);
}

static int take(pos_t *p, int sq) {
    int pc = p->sq[sq];
    bb_t b = BIT(sq);
    nn_del(p, pc, sq);
    p->key ^= g_zpc[pc][sq];
    p->sq[sq] = NO_PC;
    p->bb[pc] &= ~b;
    p->occ[pc_col(pc)] &= ~b;
    p->occ[O_A] &= ~b;
    return pc;
}

static u8 ca_mask(int sq) {
    switch (sq) {
        case 4: return (u8)~(CA_WK | CA_WQ);
        case 0: return (u8)~CA_WQ;
        case 7: return (u8)~CA_WK;
        case 60: return (u8)~(CA_BK | CA_BQ);
        case 56: return (u8)~CA_BQ;
        case 63: return (u8)~CA_BK;
        default: return 15;
    }
}

void pos_clear(pos_t *p) {
    ch_init();
    memset(p, 0, sizeof(*p));
    memset(p->sq, NO_PC, sizeof(p->sq));
    p->ep = NO_SQ;
    p->fm = 1;
}

u64 pos_hash(const pos_t *p) {
    u64 k = g_zca[p->ca];
    for (int pc = 0; pc < PC_N; ++pc) {
        bb_t x = p->bb[pc];
        while (x) {
            int sq = poplsb(&x);
            k ^= g_zpc[pc][sq];
        }
    }
    if (p->ep != NO_SQ) k ^= g_zep[p->ep & 7];
    if (p->side == B) k ^= g_zside;
    return k;
}

bool pos_set(pos_t *p, const char *fen) {
    pos_clear(p);
    int r = 7;
    int f = 0;
    const char *s = fen;

    while (*s && *s != ' ') {
        if (*s == '/') {
            if (f != 8 || !r) return false;
            --r;
            f = 0;
        } else if (isdigit((unsigned char)*s)) {
            f += *s - '0';
            if (f > 8) return false;
        } else {
            int pc = pc_chr(*s);
            if (pc == NO_PC || f > 7) return false;
            raw_put(p, pc, SQ(f, r));
            ++f;
        }
        ++s;
    }
    if (r != 0 || f != 8 || *s++ != ' ') return false;

    if (*s == 'w') p->side = W;
    else if (*s == 'b') p->side = B;
    else return false;
    ++s;
    if (*s++ != ' ') return false;

    p->ca = 0;
    if (*s == '-') ++s;
    else {
        while (*s && *s != ' ') {
            if (*s == 'K') p->ca |= CA_WK;
            else if (*s == 'Q') p->ca |= CA_WQ;
            else if (*s == 'k') p->ca |= CA_BK;
            else if (*s == 'q') p->ca |= CA_BQ;
            else return false;
            ++s;
        }
    }
    if (*s++ != ' ') return false;

    if (*s == '-') {
        p->ep = NO_SQ;
        ++s;
    } else {
        if (s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8') return false;
        p->ep = (u8)SQ(s[0] - 'a', s[1] - '1');
        s += 2;
    }

    if (*s == ' ') {
        char *e;
        p->hm = (u16)strtoul(++s, &e, 10);
        s = e;
        if (*s == ' ') p->fm = (u16)strtoul(++s, &e, 10);
    }

    p->key = pos_hash(p);
    p->hp = 1;
    p->hist[0] = p->key;
    nn_ref(p);
    return pos_ok(p);
}

void pos_start(pos_t *p) {
    pos_set(p, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

int pos_king(const pos_t *p, int c) {
    bb_t x = p->bb[c == W ? WK : BK];
    return x ? lsb(x) : NO_SQ;
}

bool pos_att(const pos_t *p, int sq, int by) {
    int o = by == W ? 0 : 6;
    if (g_pa[by ^ 1][sq] & p->bb[o + P]) return true;
    if (g_kn[sq] & p->bb[o + N]) return true;
    if (g_kg[sq] & p->bb[o + K]) return true;
    if (bb_bi(sq, p->occ[O_A]) & (p->bb[o + BI] | p->bb[o + Q])) return true;
    if (bb_ro(sq, p->occ[O_A]) & (p->bb[o + R] | p->bb[o + Q])) return true;
    return false;
}

bool pos_chk(const pos_t *p, int c) {
    int k = pos_king(p, c);
    return k != NO_SQ && pos_att(p, k, c ^ 1);
}

bool pos_ok(const pos_t *p) {
    bb_t bb[PC_N] = {0};
    bb_t occ[3] = {0};
    for (int sq = 0; sq < 64; ++sq) {
        int pc = p->sq[sq];
        if (pc == NO_PC) continue;
        if ((unsigned)pc >= PC_N) return false;
        bb[pc] |= BIT(sq);
        occ[pc_col(pc)] |= BIT(sq);
        occ[O_A] |= BIT(sq);
    }
    if (memcmp(bb, p->bb, sizeof(bb)) || memcmp(occ, p->occ, sizeof(occ))) return false;
    if (popn(p->bb[WK]) != 1 || popn(p->bb[BK]) != 1) return false;
    if (p->occ[W] & p->occ[B]) return false;
    if (p->side > B || p->ca > 15 || p->ep > NO_SQ) return false;
    return p->key == pos_hash(p);
}

bool mv_do(pos_t *p, mv_t m, undo_t *u) {
    int fr = MV_FR(m);
    int to = MV_TO(m);
    int pr = MV_PR(m);
    int fl = MV_FL(m);
    int us = p->side;
    int them = us ^ 1;
    int pc = p->sq[fr];
    if ((unsigned)fr > 63u || (unsigned)to > 63u || pc == NO_PC || pc_col(pc) != us) return false;
    if (p->sq[to] != NO_PC && pc_col(p->sq[to]) == us) return false;
    if (pr && (pr > 4 || pc_typ(pc) != P)) return false;
    if ((fl & MF_CA) && pc_typ(pc) != K) return false;
    if ((fl & MF_CA) && to != 6 && to != 2 && to != 62 && to != 58) return false;
    if ((fl & MF_CA) && ((to == 6 && p->sq[7] != WR) ||
                         (to == 2 && p->sq[0] != WR) ||
                         (to == 62 && p->sq[63] != BR) ||
                         (to == 58 && p->sq[56] != BR))) return false;

    int cap_sq = to;
    int cap = p->sq[to];
    if (fl & MF_EP) {
        cap_sq = to + (us == W ? -8 : 8);
        cap = p->sq[cap_sq];
        if (cap != (us == W ? BP : WP)) return false;
    }

    u->key = p->key;
    u->hm = p->hm;
    u->fm = p->fm;
    u->hp = p->hp;
    u->ca = p->ca;
    u->ep = p->ep;
    u->nb[0] = p->nb[0];
    u->nb[1] = p->nb[1];
    u->pc = (u8)pc;
    u->cap = (u8)cap;
    if (nn_on()) memcpy(u->acc, p->acc, sizeof(u->acc));

    p->key ^= g_zca[p->ca];
    if (p->ep != NO_SQ) p->key ^= g_zep[p->ep & 7];
    p->ep = NO_SQ;
    ++p->hm;
    if (pc_typ(pc) == P || cap != NO_PC) p->hm = 0;
    p->ca &= ca_mask(fr);
    p->ca &= ca_mask(to);

    take(p, fr);
    if (cap != NO_PC) take(p, cap_sq);

    int add = pc;
    if (pr) add = us * 6 + pr_t[pr];
    put(p, add, to);

    if (fl & MF_CA) {
        if (to == 6) {
            int rook = take(p, 7);
            put(p, rook, 5);
        } else if (to == 2) {
            int rook = take(p, 0);
            put(p, rook, 3);
        } else if (to == 62) {
            int rook = take(p, 63);
            put(p, rook, 61);
        } else if (to == 58) {
            int rook = take(p, 56);
            put(p, rook, 59);
        }
    }

    if (fl & MF_DB) p->ep = (u8)((fr + to) >> 1);
    // rebuild one view after king bucket change
    if (pc_typ(pc) == K && nn_on()) nn_ref_side(p, us);

    p->key ^= g_zca[p->ca];
    if (p->ep != NO_SQ) p->key ^= g_zep[p->ep & 7];
    p->side = (u8)them;
    p->key ^= g_zside;
    if (us == B) ++p->fm;
    if (p->hp < POS_HIST) p->hist[p->hp++] = p->key;

    int ks = pos_king(p, us);
    if (ks == NO_SQ || pos_att(p, ks, them)) {
        mv_undo(p, m, u);
        return false;
    }
    return true;
}

void mv_undo(pos_t *p, mv_t m, const undo_t *u) {
    int fr = MV_FR(m);
    int to = MV_TO(m);
    int fl = MV_FL(m);
    int us = p->side ^ 1;

    if (fl & MF_CA) {
        if (to == 6) {
            int rook = take(p, 5);
            put(p, rook, 7);
        } else if (to == 2) {
            int rook = take(p, 3);
            put(p, rook, 0);
        } else if (to == 62) {
            int rook = take(p, 61);
            put(p, rook, 63);
        } else if (to == 58) {
            int rook = take(p, 59);
            put(p, rook, 56);
        }
    }

    take(p, to);
    put(p, u->pc, fr);
    if (u->cap != NO_PC) {
        int sq = (fl & MF_EP) ? to + (us == W ? -8 : 8) : to;
        put(p, u->cap, sq);
    }

    p->side = (u8)us;
    p->ca = u->ca;
    p->ep = u->ep;
    p->hm = u->hm;
    p->fm = u->fm;
    p->hp = u->hp;
    p->nb[0] = u->nb[0];
    p->nb[1] = u->nb[1];
    p->key = u->key;
    if (nn_on()) memcpy(p->acc, u->acc, sizeof(p->acc));
}

void mv_str(mv_t m, char out[6]) {
    int fr = MV_FR(m);
    int to = MV_TO(m);
    out[0] = (char)('a' + (fr & 7));
    out[1] = (char)('1' + (fr >> 3));
    out[2] = (char)('a' + (to & 7));
    out[3] = (char)('1' + (to >> 3));
    int pr = MV_PR(m);
    out[4] = pr ? " nbrq"[pr] : '\0';
    out[5] = '\0';
}

mv_t mv_parse(pos_t *p, const char *s) {
    ml_t l;
    gen(p, &l, false);
    for (int i = 0; i < l.n; ++i) {
        char b[6];
        mv_str(l.v[i], b);
        if (strcmp(b, s)) continue;
        undo_t u;
        if (!mv_do(p, l.v[i], &u)) continue;
        mv_undo(p, l.v[i], &u);
        return l.v[i];
    }
    return 0;
}

u64 perft(pos_t *p, int d) {
    if (!d) return 1;
    ml_t l;
    gen(p, &l, false);
    u64 n = 0;
    for (int i = 0; i < l.n; ++i) {
        undo_t u;
        if (!mv_do(p, l.v[i], &u)) continue;
        n += perft(p, d - 1);
        mv_undo(p, l.v[i], &u);
    }
    return n;
}
