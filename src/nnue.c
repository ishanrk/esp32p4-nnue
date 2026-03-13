#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    nnue_header_t header;
    const int16_t *feature_bias;
    const int16_t *output_weights;
    const int8_t *feature_weights;
    void *memory;
    bool owns_memory;
    bool loaded;
} network_t;

static network_t network;
static const char network_magic[8] = "P4NNUE1";

_Static_assert(NNUE_ACCUMULATOR_BIAS_MIN +
               NNUE_MAX_ACTIVE_FEATURES * INT8_MIN >= INT16_MIN,
               "nnue accumulator lower bound");
_Static_assert(NNUE_ACCUMULATOR_BIAS_MAX +
               NNUE_MAX_ACTIVE_FEATURES * INT8_MAX <= INT16_MAX,
               "nnue accumulator upper bound");

static bool bind_network(const void *data, size_t size, bool owns_memory) {
    if (!data || size < sizeof(nnue_header_t) ||
        (uintptr_t)data % _Alignof(int16_t)) return false;
    nnue_header_t header;
    memcpy(&header, data, sizeof(header));
    if (memcmp(header.magic, network_magic, sizeof(header.magic)) ||
        header.version != NNUE_FORMAT_VERSION ||
        header.bucket_count != NNUE_BUCKET_COUNT ||
        header.features_per_bucket != NNUE_FEATURES_PER_BUCKET ||
        header.hidden_size != NNUE_HIDDEN_SIZE ||
        header.activation_clip != NNUE_ACTIVATION_CLIP ||
        header.feature_quantization != NNUE_FEATURE_QUANTIZATION ||
        header.output_quantization != NNUE_OUTPUT_QUANTIZATION ||
        header.reserved ||
        header.file_size != NNUE_FILE_SIZE ||
        size != NNUE_FILE_SIZE ||
        size != header.file_size) return false;

    const uint8_t *bytes = data;
    const int16_t *feature_bias =
        (const int16_t *)(bytes + sizeof(header));
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        if (feature_bias[i] < NNUE_ACCUMULATOR_BIAS_MIN ||
            feature_bias[i] > NNUE_ACCUMULATOR_BIAS_MAX) return false;
    }

    unload_nnue();
    network.header = header;
    network.feature_bias = feature_bias;
    network.output_weights = network.feature_bias + NNUE_HIDDEN_SIZE;
    network.feature_weights =
        (const int8_t *)(network.output_weights + 2 * NNUE_HIDDEN_SIZE);
    network.memory = owns_memory ? (void *)data : NULL;
    network.owns_memory = owns_memory;
    network.loaded = true;
    return true;
}

bool bind_nnue(const void *data, size_t size) {
    return bind_network(data, size, false);
}

bool load_nnue(const char *path) {
    FILE *file = fopen(path, "rb");
    if (!file) return false;
    if (fseek(file, 0, SEEK_END)) {
        fclose(file);
        return false;
    }
    long file_size = ftell(file);
    if (file_size != NNUE_FILE_SIZE || fseek(file, 0, SEEK_SET)) {
        fclose(file);
        return false;
    }
    void *data = malloc((size_t)file_size);
    if (!data) {
        fclose(file);
        return false;
    }
    bool read_ok =
        fread(data, 1, (size_t)file_size, file) == (size_t)file_size;
    fclose(file);
    if (!read_ok || !bind_network(data, (size_t)file_size, true)) {
        free(data);
        return false;
    }
    return true;
}

void unload_nnue(void) {
    if (network.owns_memory) free(network.memory);
    memset(&network, 0, sizeof(network));
}

bool nnue_is_loaded(void) {
    return network.loaded;
}

static int perspective_square(int square, int perspective, bool mirror) {
    if (perspective == BLACK) square ^= 56;
    if (mirror) square ^= 7;
    return square;
}

static bool map_king_view(int king_square,
                          int perspective,
                          int *bucket,
                          bool *mirror) {
    if ((unsigned)king_square >= 64u || (unsigned)perspective >= COLOR_COUNT) {
        return false;
    }
    int square = perspective_square(king_square, perspective, false);
    *mirror = (square & 7) >= 4;
    if (*mirror) square ^= 7;
    *bucket = (square & 7) + ((square >> 3) >= 4 ? 4 : 0);
    return true;
}

bool nnue_king_mirror(int king_square, int perspective) {
    int bucket;
    bool mirror;
    return map_king_view(king_square, perspective, &bucket, &mirror) && mirror;
}

int nnue_king_bucket(int king_square, int perspective) {
    int bucket;
    bool mirror;
    return map_king_view(king_square, perspective, &bucket, &mirror)
               ? bucket
               : -1;
}

static int feature_index_from_view(int bucket,
                                   bool mirror,
                                   int piece,
                                   int square,
                                   int perspective) {
    int type = piece_type(piece);
    if (type == KING) return -1;
    square = perspective_square(square, perspective, mirror);
    int color_offset = piece_color(piece) == perspective ? 0 : 5;
    return bucket * NNUE_FEATURES_PER_BUCKET +
           (color_offset + type) * 64 + square;
}

int nnue_feature_index(int king_square,
                       int piece,
                       int square,
                       int perspective) {
    if ((unsigned)piece >= PIECE_COUNT || (unsigned)square >= 64u ||
        (unsigned)perspective >= COLOR_COUNT) return -1;
    int bucket;
    bool mirror;
    if (!map_king_view(king_square, perspective, &bucket, &mirror)) return -1;
    return feature_index_from_view(
        bucket, mirror, piece, square, perspective);
}

static const int8_t *feature_vector(int feature) {
    return network.feature_weights +
           feature * NNUE_HIDDEN_SIZE;
}

static void add_vector(int16_t *accumulator, const int8_t *weights) {
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        accumulator[i] = (int16_t)(accumulator[i] + weights[i]);
    }
}

static void remove_vector(int16_t *accumulator, const int8_t *weights) {
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        accumulator[i] = (int16_t)(accumulator[i] - weights[i]);
    }
}

void refresh_nnue_perspective(position_t *position, int perspective) {
    if (!nnue_is_loaded()) {
        memset(position->accumulator[perspective], 0,
               sizeof(position->accumulator[perspective]));
        position->king_bucket[perspective] = 0;
        position->king_mirror[perspective] = 0;
        return;
    }
    int king_square = find_king_square(position, perspective);
    if (king_square == NO_SQUARE) {
        memset(position->accumulator[perspective], 0,
               sizeof(position->accumulator[perspective]));
        position->king_bucket[perspective] = 0;
        position->king_mirror[perspective] = 0;
        return;
    }

    int bucket;
    bool mirror;
    if (!map_king_view(king_square, perspective, &bucket, &mirror)) return;
    position->king_bucket[perspective] = (uint8_t)bucket;
    position->king_mirror[perspective] = (uint8_t)mirror;
    memcpy(position->accumulator[perspective], network.feature_bias,
           sizeof(position->accumulator[perspective]));
    for (int piece = 0; piece < PIECE_COUNT; ++piece) {
        if (piece_type(piece) == KING) continue;
        bitboard_t pieces = position->pieces[piece];
        while (pieces) {
            int square = pop_first_square(&pieces);
            int feature = feature_index_from_view(
                bucket, mirror, piece, square, perspective);
            add_vector(position->accumulator[perspective],
                       feature_vector(feature));
        }
    }
}

void refresh_nnue(position_t *position) {
    refresh_nnue_perspective(position, WHITE);
    refresh_nnue_perspective(position, BLACK);
}

void add_nnue_feature(position_t *position, int piece, int square) {
    if (!nnue_is_loaded() || piece_type(piece) == KING) return;
    for (int perspective = 0; perspective < COLOR_COUNT; ++perspective) {
        int feature = feature_index_from_view(
            position->king_bucket[perspective],
            position->king_mirror[perspective] != 0,
            piece, square, perspective);
        add_vector(position->accumulator[perspective],
                   feature_vector(feature));
    }
}

void remove_nnue_feature(position_t *position, int piece, int square) {
    if (!nnue_is_loaded() || piece_type(piece) == KING) return;
    for (int perspective = 0; perspective < COLOR_COUNT; ++perspective) {
        int feature = feature_index_from_view(
            position->king_bucket[perspective],
            position->king_mirror[perspective] != 0,
            piece, square, perspective);
        remove_vector(position->accumulator[perspective],
                      feature_vector(feature));
    }
}

int evaluate_nnue(const position_t *position) {
    if (!nnue_is_loaded()) return 0;
    const int16_t *side_accumulator =
        position->accumulator[position->side_to_move];
    const int16_t *opponent_accumulator =
        position->accumulator[position->side_to_move ^ 1];
    int64_t score = network.header.output_bias;
    int clip = network.header.activation_clip;
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        int activation = side_accumulator[i];
        if (activation < 0) activation = 0;
        if (activation > clip) activation = clip;
        score += (int64_t)activation * network.output_weights[i];
    }
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        int activation = opponent_accumulator[i];
        if (activation < 0) activation = 0;
        if (activation > clip) activation = clip;
        score += (int64_t)activation *
                 network.output_weights[NNUE_HIDDEN_SIZE + i];
    }
    return (int)(score /
                 ((int64_t)network.header.feature_quantization *
                  network.header.output_quantization));
}
