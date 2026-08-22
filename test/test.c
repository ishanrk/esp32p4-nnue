#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int fail;

static void eq_u64(const char *name, u64 got, u64 want) {
    if (got == want) return;
    fprintf(stderr, "%s got %llu want %llu\n", name,
            (unsigned long long)got, (unsigned long long)want);
    fail = 1;
}

static void ok(const char *name, bool v) {
    if (v) return;
    fprintf(stderr, "%s failed\n", name);
    fail = 1;
}

static void perft_case(const char *name, const char *fen, const u64 *want, int n) {
    pos_t p;
    ok(name, pos_set(&p, fen));
    for (int d = 1; d <= n; ++d) {
        char tag[64];
        snprintf(tag, sizeof(tag), "%s d%d", name, d);
        eq_u64(tag, perft(&p, d), want[d - 1]);
        ok("pos after perft", pos_ok(&p));
    }
}

static void *mock_net(void) {
    u8 *mem = calloc(1, NN_BYTES);
    if (!mem) return NULL;
    nn_hdr_t *h = (nn_hdr_t *)mem;
    memcpy(h->magic, "P4NNUE1", 8);
    h->ver = 1;
    h->b = NN_B;
    h->f = NN_F;
    h->h = NN_H;
    h->clip = 127;
    h->q1 = 64;
    h->q2 = 64;
    h->bytes = NN_BYTES;
    h->ob = 123;
    i16 *b = (i16 *)(mem + sizeof(*h));
    i16 *o = b + NN_H;
    i8 *w = (i8 *)(o + 2 * NN_H);
    for (int i = 0; i < NN_H; ++i) b[i] = (i16)(i - 31);
    for (int i = 0; i < 2 * NN_H; ++i) o[i] = (i16)((i % 11) - 5);
    for (int i = 0; i < NN_W; ++i) w[i] = (i8)((i * 17 % 7) - 3);
    return mem;
}

static void inc_case(const char *name, const char *fen) {
    pos_t p;
    ok(name, pos_set(&p, fen));
    ml_t l;
    gen(&p, &l, false);
    int legal = 0;
    for (int i = 0; i < l.n; ++i) {
        undo_t u;
        if (!mv_do(&p, l.v[i], &u)) continue;
        ++legal;
        i16 acc[2][NN_H];
        u8 nb[2] = {p.nb[0], p.nb[1]};
        memcpy(acc, p.acc, sizeof(acc));
        nn_ref(&p);
        if (memcmp(acc, p.acc, sizeof(acc)) || nb[0] != p.nb[0] || nb[1] != p.nb[1]) {
            fprintf(stderr, "%s nn mismatch\n", name);
            fail = 1;
        }
        mv_undo(&p, l.v[i], &u);
        ok("pos after undo", pos_ok(&p));
    }
    ok("legal moves", legal > 0);
}

int main(void) {
    ch_init();
    ok("nn header", sizeof(nn_hdr_t) == 32);

    static const u64 s[] = {20, 400, 8902, 197281};
    static const u64 k[] = {48, 2039, 97862};
    static const u64 e[] = {14, 191, 2812};
    static const u64 p4[] = {6, 264, 9467};
    static const u64 p5[] = {44, 1486, 62379};
    static const u64 p6[] = {46, 2079, 89890};
    perft_case("start", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", s, 4);
    perft_case("kiwi", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", k, 3);
    perft_case("end", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", e, 3);
    perft_case("p4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", p4, 3);
    perft_case("p5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", p5, 3);
    perft_case("p6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", p6, 3);

    void *net = mock_net();
    ok("net alloc", net != NULL);
    ok("net bind", net && nn_bind(net, NN_BYTES));
    inc_case("inc start", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    inc_case("inc kiwi", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    inc_case("inc ep", "8/8/8/3pP3/8/8/4K3/7k w - d6 0 1");
    inc_case("inc promo", "4k3/P7/8/8/8/8/7p/4K3 w - - 0 1");

    pos_t p;
    pos_start(&p);
    tt_t t = {0};
    ok("tt alloc", tt_new(&t, 1));
    sr_t r = search(&p, &t, (lim_t){3, 0}, NULL, NULL);
    ok("search move", r.best != 0 && r.depth == 3);
    tt_free(&t);

    nn_drop();
    free(net);
    if (fail) return 1;
    puts("ok");
    return 0;
}
