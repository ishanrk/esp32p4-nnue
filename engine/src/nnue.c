#include "nnue.h"

#include <stdio.h>
#include <string.h>

enum {
    NN_IN = 768,
    NN_H = 64
};

static float w1[NN_H][NN_IN];
static float b1[NN_H];
static float w2[NN_H];
static float b2;
static bool g_loaded = false;

static int feature_index(const Position *pos, int sq) {
    int8_t p = pos->board[sq];
    if (p == 0) {
        return -1;
    }
    int color_offset = p > 0 ? 0 : 6;
    int piece_index = (p > 0 ? p : -p) - 1;
    int channel = color_offset + piece_index;
    return channel * 64 + sq;
}

void nnue_init(void) {
    memset(w1, 0, sizeof(w1));
    memset(b1, 0, sizeof(b1));
    memset(w2, 0, sizeof(w2));
    b2 = 0.0f;
    g_loaded = false;
}

bool nnue_load(const char *path) {
    const char *use_path = path ? path : "train/nnue_weights.bin";
    FILE *f = fopen(use_path, "rb");
    if (!f) {
        g_loaded = false;
        return false;
    }

    char magic[8] = {0};
    if (fread(magic, 1, 8, f) != 8 || memcmp(magic, "UBNNUE1", 7) != 0) {
        fclose(f);
        g_loaded = false;
        return false;
    }

    U32 in = 0;
    U32 h = 0;
    if (fread(&in, sizeof(U32), 1, f) != 1 || fread(&h, sizeof(U32), 1, f) != 1) {
        fclose(f);
        g_loaded = false;
        return false;
    }
    if (in != NN_IN || h != NN_H) {
        fclose(f);
        g_loaded = false;
        return false;
    }

    if (fread(w1, sizeof(float), NN_H * NN_IN, f) != NN_H * NN_IN ||
        fread(b1, sizeof(float), NN_H, f) != NN_H ||
        fread(w2, sizeof(float), NN_H, f) != NN_H ||
        fread(&b2, sizeof(float), 1, f) != 1) {
        fclose(f);
        g_loaded = false;
        return false;
    }
    fclose(f);
    g_loaded = true;
    return true;
}

bool nnue_is_loaded(void) {
    return g_loaded;
}

void nnue_refresh(const Position *pos, NNUEState *state) {
    (void)pos;
    if (state) {
        state->placeholder = 0;
    }
}

I32 nnue_evaluate(const NNUEState *state, const Position *pos) {
    (void)state;
    if (!g_loaded) {
        return 0;
    }
    float hidden[NN_H];
    for (int i = 0; i < NN_H; i++) {
        hidden[i] = b1[i];
    }
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        int fi = feature_index(pos, sq);
        if (fi < 0) {
            continue;
        }
        for (int i = 0; i < NN_H; i++) {
            hidden[i] += w1[i][fi];
        }
    }
    float out = b2;
    for (int i = 0; i < NN_H; i++) {
        float h = hidden[i] > 0.0f ? hidden[i] : 0.0f;
        out += h * w2[i];
    }
    I32 score = (I32)(out >= 0.0f ? out + 0.5f : out - 0.5f);
    return pos->side_to_move == COLOR_WHITE ? score : -score;
}
