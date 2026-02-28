#ifndef P4_CH_H
#define P4_CH_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef uint8_t u8;
typedef int8_t i8;
typedef uint16_t u16;
typedef int16_t i16;
typedef uint32_t u32;
typedef int32_t i32;
typedef uint64_t u64;
typedef int64_t i64;
typedef u64 bb_t;
typedef u32 mv_t;

enum { W, B, C_N };
enum { P, N, BI, R, Q, K, T_N };
enum {
    WP, WN, WB, WR, WQ, WK,
    BP, BN, BB, BR, BQ, BK,
    PC_N,
    NO_PC = 255
};
enum { O_W, O_B, O_A };
enum { CA_WK = 1, CA_WQ = 2, CA_BK = 4, CA_BQ = 8 };
enum { MF_CAP = 1, MF_EP = 2, MF_CA = 4, MF_DB = 8 };
enum { TT_EXACT, TT_LO, TT_HI };
enum { NO_SQ = 64, MAX_MV = 256, MAX_PLY = 128, POS_HIST = 256 };
enum { NN_B = 8, NN_F = 640, NN_H = 64, NN_W = NN_B * NN_F * NN_H };

#define BIT(s) (UINT64_C(1) << (s))
#define SQ(f, r) ((r) * 8 + (f))
#define MV(fr, to, pr, fl) ((mv_t)((fr) | ((to) << 6) | ((pr) << 12) | ((fl) << 15)))
#define MV_FR(m) ((int)((m) & 63u))
#define MV_TO(m) ((int)(((m) >> 6) & 63u))
#define MV_PR(m) ((int)(((m) >> 12) & 7u))
#define MV_FL(m) ((int)(((m) >> 15) & 15u))

static inline int pc_col(int pc) { return pc >= BP; }
static inline int pc_typ(int pc) { return pc % 6; }
static inline int popn(bb_t x) { return __builtin_popcountll(x); }
static inline int lsb(bb_t x) { return __builtin_ctzll(x); }
static inline int poplsb(bb_t *x) {
    int s = lsb(*x);
    *x &= *x - 1;
    return s;
}

typedef struct {
    mv_t v[MAX_MV];
    int n;
} ml_t;

typedef struct {
    char magic[8];
    u16 ver;
    u16 b;
    u16 f;
    u16 h;
    u16 clip;
    u16 q1;
    u16 q2;
    u16 rsv;
    u32 bytes;
    i32 ob;
} nn_hdr_t;

enum {
    NN_BYTES = sizeof(nn_hdr_t) + NN_H * (int)sizeof(i16) +
               2 * NN_H * (int)sizeof(i16) + NN_W
};

typedef struct {
    bb_t bb[PC_N];
    bb_t occ[3];
    u64 key;
    u64 hist[POS_HIST];
    i16 acc[2][NN_H];
    u8 sq[64];
    u16 hm;
    u16 fm;
    u16 hp;
    u8 nb[2];
    u8 side;
    u8 ca;
    u8 ep;
} pos_t;

typedef struct {
    u64 key;
    i16 acc[2][NN_H];
    u16 hm;
    u16 fm;
    u16 hp;
    u8 ca;
    u8 ep;
    u8 nb[2];
    u8 pc;
    u8 cap;
} undo_t;

typedef struct {
    u64 key;
    mv_t mv;
    i16 score;
    i8 depth;
    u8 flag;
} tt_e;

typedef struct {
    tt_e *e;
    size_t n;
} tt_t;

typedef struct {
    int depth;
    u64 ms;
} lim_t;

typedef struct {
    mv_t best;
    mv_t pv[MAX_PLY];
    int pn;
    int score;
    int depth;
    u64 nodes;
    u64 ms;
} sr_t;

typedef void (*info_fn)(const sr_t *r, void *arg);

extern bb_t g_kn[64];
extern bb_t g_kg[64];
extern bb_t g_pa[2][64];
extern bb_t g_ray[8][64];
extern u64 g_zpc[PC_N][64];
extern u64 g_zca[16];
extern u64 g_zep[8];
extern u64 g_zside;

void ch_init(void);
bb_t bb_bi(int sq, bb_t occ);
bb_t bb_ro(int sq, bb_t occ);

void pos_clear(pos_t *p);
void pos_start(pos_t *p);
bool pos_set(pos_t *p, const char *fen);
bool pos_ok(const pos_t *p);
int pos_king(const pos_t *p, int c);
bool pos_att(const pos_t *p, int sq, int by);
bool pos_chk(const pos_t *p, int c);
u64 pos_hash(const pos_t *p);

void gen(const pos_t *p, ml_t *l, bool caps);
bool mv_do(pos_t *p, mv_t m, undo_t *u);
void mv_undo(pos_t *p, mv_t m, const undo_t *u);
mv_t mv_parse(pos_t *p, const char *s);
void mv_str(mv_t m, char out[6]);
u64 perft(pos_t *p, int d);

bool nn_load(const char *path);
bool nn_bind(const void *data, size_t n);
void nn_drop(void);
bool nn_on(void);
void nn_ref(pos_t *p);
void nn_ref_side(pos_t *p, int c);
void nn_add(pos_t *p, int pc, int sq);
void nn_del(pos_t *p, int pc, int sq);
int nn_eval(const pos_t *p);

int eval(const pos_t *p);

bool tt_new(tt_t *t, size_t mb);
void tt_free(tt_t *t);
void tt_clear(tt_t *t);
sr_t search(pos_t *p, tt_t *t, lim_t lim, info_fn fn, void *arg);

u64 sys_ms(void);
void uci(void);

#endif
