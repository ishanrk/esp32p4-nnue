#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

typedef struct {
    const char *name;
    const char *fen;
} benchmark_position_t;

static const benchmark_position_t evaluation_positions[] = {
    {"start white", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"},
    {"start black", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"},
    {"pawn white", "7k/8/8/8/8/8/P7/K7 w - - 0 1"},
    {"pawn black", "7k/8/8/8/8/8/P7/K7 b - - 0 1"},
    {"queens white", "4k3/8/8/8/7q/8/Q7/4K3 w - - 0 1"},
    {"queens black", "4k3/8/8/8/7q/8/Q7/4K3 b - - 0 1"},
};

static const benchmark_position_t search_positions[] = {
    {"start", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"},
    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"},
    {"midgame", "2r2rk1/pp1bqppp/2n1pn2/2pp4/3P4/2PBPN2/PPQN1PPP/2RR2K1 w - - 0 1"},
};

static uint64_t time_us(void) {
    struct timespec time;
    if (!timespec_get(&time, TIME_UTC)) return 0;
    return (uint64_t)time.tv_sec * UINT64_C(1000000) +
           (uint64_t)time.tv_nsec / 1000u;
}

static int compare_u64(const void *left, const void *right) {
    uint64_t a = *(const uint64_t *)left;
    uint64_t b = *(const uint64_t *)right;
    return a > b ? 1 : a < b ? -1 : 0;
}

static bool benchmark_evaluation(uint64_t iterations) {
    int (*volatile evaluation)(const position_t *) = evaluate_nnue;
    volatile int64_t checksum = 0;
    uint64_t start = time_us();
    for (size_t index = 0;
         index < sizeof(evaluation_positions) / sizeof(evaluation_positions[0]);
         ++index) {
        position_t position;
        if (!set_position_fen(&position, evaluation_positions[index].fen)) {
            return false;
        }
        for (uint64_t iteration = 0; iteration < iterations; ++iteration) {
            checksum += evaluation(&position);
        }
    }
    uint64_t elapsed = time_us() - start;
    uint64_t count = iterations *
        (sizeof(evaluation_positions) / sizeof(evaluation_positions[0]));
    uint64_t per_second = elapsed ? count * UINT64_C(1000000) / elapsed : 0;
    printf("eval evaluations=%llu elapsed_us=%llu evaluations_per_second=%llu checksum=%lld\n",
           (unsigned long long)count,
           (unsigned long long)elapsed,
           (unsigned long long)per_second,
           (long long)checksum);
    return true;
}

static bool benchmark_search(int depth, int repetitions) {
    transposition_table_t table = {0};
    if (!resize_transposition_table(&table, 1)) return false;
    for (size_t index = 0;
         index < sizeof(search_positions) / sizeof(search_positions[0]);
         ++index) {
        uint64_t times[31];
        search_result_t reference = {0};
        for (int repetition = 0; repetition < repetitions; ++repetition) {
            position_t position;
            if (!set_position_fen(&position, search_positions[index].fen)) {
                free_transposition_table(&table);
                return false;
            }
            clear_transposition_table(&table);
            uint64_t start = time_us();
            search_limits_t limits = {depth, 0};
            search_result_t result = search_position(
                &position, &table, limits, NULL, NULL);
            times[repetition] = time_us() - start;
            if (!repetition) {
                reference = result;
            } else if (result.best_move != reference.best_move ||
                       result.score != reference.score ||
                       result.depth != reference.depth ||
                       result.nodes != reference.nodes) {
                free_transposition_table(&table);
                return false;
            }
        }
        qsort(times, (size_t)repetitions, sizeof(times[0]), compare_u64);
        uint64_t median = times[repetitions / 2];
        uint64_t nodes_per_second = median
            ? reference.nodes * UINT64_C(1000000) / median
            : 0;
        char move[6];
        move_to_uci(reference.best_move, move);
        printf("search name=%s requested_depth=%d completed_depth=%d best_move=%s score=%d nodes=%llu median_us=%llu nodes_per_second=%llu repetitions=%d\n",
               search_positions[index].name,
               depth,
               reference.depth,
               move,
               reference.score,
               (unsigned long long)reference.nodes,
               (unsigned long long)median,
               (unsigned long long)nodes_per_second,
               repetitions);
    }
    free_transposition_table(&table);
    return true;
}

int main(int argc, char **argv) {
    if (argc < 2 || argc > 5) {
        fprintf(stderr,
                "usage: p4bench MODEL [EVAL_ITERATIONS] [SEARCH_DEPTH] [REPETITIONS]\n");
        return 2;
    }
    uint64_t iterations = argc >= 3 ? strtoull(argv[2], NULL, 10) : 500000;
    int depth = argc >= 4 ? atoi(argv[3]) : 5;
    int repetitions = argc >= 5 ? atoi(argv[4]) : 3;
    if (!iterations || depth <= 0 || repetitions <= 0 || repetitions > 31) {
        fprintf(stderr, "invalid benchmark options\n");
        return 2;
    }
    initialize_chess();
    if (!load_nnue(argv[1])) {
        fprintf(stderr, "model load failed\n");
        return 1;
    }
    printf("profile buckets=%d width=%d model_bytes=%d accumulator_bytes=%zu position_bytes=%zu undo_bytes=%zu\n",
           NNUE_BUCKET_COUNT,
           NNUE_HIDDEN_SIZE,
           NNUE_FILE_SIZE,
           sizeof(((position_t *)0)->accumulator),
           sizeof(position_t),
           sizeof(undo_t));
    bool ok = benchmark_evaluation(iterations) &&
              benchmark_search(depth, repetitions);
    unload_nnue();
    if (!ok) {
        fprintf(stderr, "benchmark failed\n");
        return 1;
    }
    return 0;
}
