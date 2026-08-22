#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const nn_hdr_t *h;
    const i16 *b;
    const i16 *o;
    const i8 *w;
    void *mem;
    bool own;
} net_t;

static net_t g;

static bool bind0(const void *data, size_t n, bool own) {
    if (!data || n < sizeof(nn_hdr_t)) return false;
    const nn_hdr_t *h = data;
    if (memcmp(h->magic, "P4NNUE1", 7) || h->ver != 1 || h->b != NN_B ||
        h->f != NN_F || h->h != NN_H || h->bytes != NN_BYTES || n != NN_BYTES ||
        !h->q1 || !h->q2) return false;

    nn_drop();
    const u8 *p = data;
    g.h = h;
    g.b = (const i16 *)(p + sizeof(*h));
    g.o = g.b + NN_H;
    g.w = (const i8 *)(g.o + 2 * NN_H);
    g.mem = own ? (void *)data : NULL;
    g.own = own;
    return true;
}

bool nn_bind(const void *data, size_t n) {
    return bind0(data, n, false);
}

bool nn_load(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return false;
    if (fseek(f, 0, SEEK_END)) {
        fclose(f);
        return false;
    }
    long z = ftell(f);
    if (z != NN_BYTES || fseek(f, 0, SEEK_SET)) {
        fclose(f);
        return false;
    }
    void *p = malloc((size_t)z);
    if (!p) {
        fclose(f);
        return false;
    }
    bool ok = fread(p, 1, (size_t)z, f) == (size_t)z;
    fclose(f);
    if (!ok || !bind0(p, (size_t)z, true)) {
        free(p);
        return false;
    }
    return true;
}

void nn_drop(void) {
    if (g.own) free(g.mem);
    memset(&g, 0, sizeof(g));
}

bool nn_on(void) {
    return g.h != NULL;
}

static int bucket(int sq, int view) {
    // mirror files for shared king buckets
    if (view == B) sq ^= 56;
    int f = sq & 7;
    int r = sq >> 3;
    if (f > 3) f = 7 - f;
    return f + ((r >= 4) << 2);
}

static int feat(int pc, int sq, int view) {
    int t = pc_typ(pc);
    if (t == K) return -1;
    if (view == B) sq ^= 56;
    int c = pc_col(pc) == view ? 0 : 5;
    return (c + t) * 64 + sq;
}

static const i8 *vec(int b, int f) {
    return g.w + ((b * NN_F + f) * NN_H);
}

static void addv(i16 *a, const i8 *w) {
    for (int i = 0; i < NN_H; ++i) a[i] = (i16)(a[i] + w[i]);
}

static void delv(i16 *a, const i8 *w) {
    for (int i = 0; i < NN_H; ++i) a[i] = (i16)(a[i] - w[i]);
}

void nn_ref_side(pos_t *p, int c) {
    if (!nn_on()) {
        memset(p->acc[c], 0, sizeof(p->acc[c]));
        p->nb[c] = 0;
        return;
    }
    int ks = pos_king(p, c);
    if (ks == NO_SQ) {
        memset(p->acc[c], 0, sizeof(p->acc[c]));
        p->nb[c] = 0;
        return;
    }
    int b = bucket(ks, c);
    p->nb[c] = (u8)b;
    memcpy(p->acc[c], g.b, sizeof(p->acc[c]));
    for (int pc = 0; pc < PC_N; ++pc) {
        if (pc_typ(pc) == K) continue;
        bb_t x = p->bb[pc];
        while (x) {
            int sq = poplsb(&x);
            int f = feat(pc, sq, c);
            addv(p->acc[c], vec(b, f));
        }
    }
}

void nn_ref(pos_t *p) {
    nn_ref_side(p, W);
    nn_ref_side(p, B);
}

void nn_add(pos_t *p, int pc, int sq) {
    if (!nn_on() || pc_typ(pc) == K) return;
    for (int c = 0; c < 2; ++c) {
        int f = feat(pc, sq, c);
        addv(p->acc[c], vec(p->nb[c], f));
    }
}

void nn_del(pos_t *p, int pc, int sq) {
    if (!nn_on() || pc_typ(pc) == K) return;
    for (int c = 0; c < 2; ++c) {
        int f = feat(pc, sq, c);
        delv(p->acc[c], vec(p->nb[c], f));
    }
}

int nn_eval(const pos_t *p) {
    if (!nn_on()) return 0;
    const i16 *a = p->acc[p->side];
    const i16 *b = p->acc[p->side ^ 1];
    i64 s = g.h->ob;
    int clip = g.h->clip;
    for (int i = 0; i < NN_H; ++i) {
        int x = a[i];
        if (x < 0) x = 0;
        if (x > clip) x = clip;
        s += (i64)x * g.o[i];
    }
    for (int i = 0; i < NN_H; ++i) {
        int x = b[i];
        if (x < 0) x = 0;
        if (x > clip) x = clip;
        s += (i64)x * g.o[NN_H + i];
    }
    return (int)(s / ((i64)g.h->q1 * g.h->q2));
}
