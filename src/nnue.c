#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const nnue_header_t *header;
    const int16_t *feature_bias;
    const int16_t *output_weights;
    const int8_t *feature_weights;
    void *memory;
    bool owns_memory;
} network_t;

static network_t network;

static bool bind_network(const void *data, size_t size, bool owns_memory) {
    if (!data || size < sizeof(nnue_header_t)) return false;
    const nnue_header_t *header = data;
    if (memcmp(header->magic, "P4NNUE1", 7) ||
        header->version != 1 ||
        header->bucket_count != NNUE_BUCKET_COUNT ||
        header->features_per_bucket != NNUE_FEATURES_PER_BUCKET ||
        header->hidden_size != NNUE_HIDDEN_SIZE ||
        header->file_size != NNUE_FILE_SIZE ||
        size != NNUE_FILE_SIZE ||
        !header->feature_quantization ||
        !header->output_quantization) return false;

    unload_nnue();
    const uint8_t *bytes = data;
    network.header = header;
    network.feature_bias = (const int16_t *)(bytes + sizeof(*header));
    network.output_weights = network.feature_bias + NNUE_HIDDEN_SIZE;
    network.feature_weights =
        (const int8_t *)(network.output_weights + 2 * NNUE_HIDDEN_SIZE);
    network.memory = owns_memory ? (void *)data : NULL;
    network.owns_memory = owns_memory;
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
    return network.header != NULL;
}

static int king_bucket(int square, int perspective) {
    // mirror files for shared king buckets
    if (perspective == BLACK) square ^= 56;
    int file = square & 7;
    int rank = square >> 3;
    if (file > 3) file = 7 - file;
    return file + ((rank >= 4) << 2);
}

static int feature_index(int piece, int square, int perspective) {
    int type = piece_type(piece);
    if (type == KING) return -1;
    if (perspective == BLACK) square ^= 56;
    int color_offset = piece_color(piece) == perspective ? 0 : 5;
    return (color_offset + type) * 64 + square;
}

static const int8_t *feature_vector(int bucket, int feature) {
    return network.feature_weights +
           ((bucket * NNUE_FEATURES_PER_BUCKET + feature) * NNUE_HIDDEN_SIZE);
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
        return;
    }
    int king_square = find_king_square(position, perspective);
    if (king_square == NO_SQUARE) {
        memset(position->accumulator[perspective], 0,
               sizeof(position->accumulator[perspective]));
        position->king_bucket[perspective] = 0;
        return;
    }

    int bucket = king_bucket(king_square, perspective);
    position->king_bucket[perspective] = (uint8_t)bucket;
    memcpy(position->accumulator[perspective], network.feature_bias,
           sizeof(position->accumulator[perspective]));
    for (int piece = 0; piece < PIECE_COUNT; ++piece) {
        if (piece_type(piece) == KING) continue;
        bitboard_t pieces = position->pieces[piece];
        while (pieces) {
            int square = pop_first_square(&pieces);
            int feature = feature_index(piece, square, perspective);
            add_vector(position->accumulator[perspective],
                       feature_vector(bucket, feature));
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
        int feature = feature_index(piece, square, perspective);
        add_vector(position->accumulator[perspective],
                   feature_vector(position->king_bucket[perspective], feature));
    }
}

void remove_nnue_feature(position_t *position, int piece, int square) {
    if (!nnue_is_loaded() || piece_type(piece) == KING) return;
    for (int perspective = 0; perspective < COLOR_COUNT; ++perspective) {
        int feature = feature_index(piece, square, perspective);
        remove_vector(position->accumulator[perspective],
                      feature_vector(position->king_bucket[perspective], feature));
    }
}

int evaluate_nnue(const position_t *position) {
    if (!nnue_is_loaded()) return 0;
    const int16_t *side_accumulator =
        position->accumulator[position->side_to_move];
    const int16_t *opponent_accumulator =
        position->accumulator[position->side_to_move ^ 1];
    int64_t score = network.header->output_bias;
    int clip = network.header->activation_clip;
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
                 ((int64_t)network.header->feature_quantization *
                  network.header->output_quantization));
}
