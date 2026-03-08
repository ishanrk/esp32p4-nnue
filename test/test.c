#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int test_failed;

static void expect_u64(const char *name, uint64_t actual, uint64_t expected) {
    if (actual == expected) return;
    fprintf(stderr, "%s got %llu want %llu\n", name,
            (unsigned long long)actual, (unsigned long long)expected);
    test_failed = 1;
}

static void expect_true(const char *name, bool value) {
    if (value) return;
    fprintf(stderr, "%s failed\n", name);
    test_failed = 1;
}

static void run_perft_case(const char *name,
                           const char *fen,
                           const uint64_t *expected,
                           int max_depth) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    for (int depth = 1; depth <= max_depth; ++depth) {
        char label[64];
        snprintf(label, sizeof(label), "%s d%d", name, depth);
        expect_u64(label, perft(&position, depth), expected[depth - 1]);
        expect_true("position after perft", position_is_valid(&position));
    }
}

static void *create_mock_network(void) {
    uint8_t *memory = calloc(1, NNUE_FILE_SIZE);
    if (!memory) return NULL;
    nnue_header_t *header = (nnue_header_t *)memory;
    memcpy(header->magic, "P4NNUE1", 8);
    header->version = 1;
    header->bucket_count = NNUE_BUCKET_COUNT;
    header->features_per_bucket = NNUE_FEATURES_PER_BUCKET;
    header->hidden_size = NNUE_HIDDEN_SIZE;
    header->activation_clip = 127;
    header->feature_quantization = 64;
    header->output_quantization = 64;
    header->file_size = NNUE_FILE_SIZE;
    header->output_bias = 123;

    int16_t *feature_bias = (int16_t *)(memory + sizeof(*header));
    int16_t *output_weights = feature_bias + NNUE_HIDDEN_SIZE;
    int8_t *feature_weights =
        (int8_t *)(output_weights + 2 * NNUE_HIDDEN_SIZE);
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        feature_bias[i] = (int16_t)(i - 31);
    }
    for (int i = 0; i < 2 * NNUE_HIDDEN_SIZE; ++i) {
        output_weights[i] = (int16_t)((i % 11) - 5);
    }
    for (int i = 0; i < NNUE_FEATURE_WEIGHT_COUNT; ++i) {
        feature_weights[i] = (int8_t)((i * 17 % 7) - 3);
    }
    return memory;
}

static void check_incremental_nnue(const char *name, const char *fen) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    move_list_t list;
    generate_moves(&position, &list, false);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        undo_t undo;
        if (!make_move(&position, list.moves[i], &undo)) continue;
        ++legal_moves;
        int16_t accumulator[COLOR_COUNT][NNUE_HIDDEN_SIZE];
        uint8_t king_bucket[COLOR_COUNT] = {
            position.king_bucket[WHITE],
            position.king_bucket[BLACK]
        };
        memcpy(accumulator, position.accumulator, sizeof(accumulator));
        refresh_nnue(&position);
        if (memcmp(accumulator, position.accumulator, sizeof(accumulator)) ||
            king_bucket[WHITE] != position.king_bucket[WHITE] ||
            king_bucket[BLACK] != position.king_bucket[BLACK]) {
            fprintf(stderr, "%s nn mismatch\n", name);
            test_failed = 1;
        }
        undo_move(&position, list.moves[i], &undo);
        expect_true("position after undo", position_is_valid(&position));
    }
    expect_true("legal moves", legal_moves > 0);
}

int main(void) {
    initialize_chess();
    expect_true("nn header", sizeof(nnue_header_t) == 32);

    static const uint64_t start_nodes[] = {20, 400, 8902, 197281};
    static const uint64_t kiwi_nodes[] = {48, 2039, 97862};
    static const uint64_t endgame_nodes[] = {14, 191, 2812};
    static const uint64_t position_four_nodes[] = {6, 264, 9467};
    static const uint64_t position_five_nodes[] = {44, 1486, 62379};
    static const uint64_t position_six_nodes[] = {46, 2079, 89890};
    run_perft_case("start",
                   "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                   start_nodes, 4);
    run_perft_case("kiwi",
                   "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
                   kiwi_nodes, 3);
    run_perft_case("end",
                   "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
                   endgame_nodes, 3);
    run_perft_case("p4",
                   "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
                   position_four_nodes, 3);
    run_perft_case("p5",
                   "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
                   position_five_nodes, 3);
    run_perft_case("p6",
                   "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
                   position_six_nodes, 3);

    void *network = create_mock_network();
    expect_true("net alloc", network != NULL);
    expect_true("net bind", network && bind_nnue(network, NNUE_FILE_SIZE));
    check_incremental_nnue(
        "inc start",
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    check_incremental_nnue(
        "inc kiwi",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    check_incremental_nnue(
        "inc ep",
        "8/8/8/3pP3/8/8/4K3/7k w - d6 0 1");
    check_incremental_nnue(
        "inc promo",
        "4k3/P7/8/8/8/8/7p/4K3 w - - 0 1");

    position_t position;
    set_start_position(&position);
    transposition_table_t table = {0};
    expect_true("tt alloc", resize_transposition_table(&table, 1));
    search_result_t result = search_position(
        &position, &table, (search_limits_t){3, 0}, NULL, NULL);
    expect_true("search move", result.best_move != 0 && result.depth == 3);
    free_transposition_table(&table);

    unload_nnue();
    free(network);
    if (test_failed) return 1;
    puts("ok");
    return 0;
}
