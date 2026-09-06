#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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
    return current_time_us();
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
        for (int repetition = -1; repetition < repetitions; ++repetition) {
            position_t position;
            if (!set_position_fen(&position, search_positions[index].fen)) {
                free_transposition_table(&table);
                return false;
            }
            clear_transposition_table(&table);
            uint64_t start = time_us();
            search_limits_t limits = {.depth = depth, .move_time_ms = 0};
            search_result_t result = search_position(
                &position, &table, limits, NULL, NULL);
            uint64_t elapsed = time_us() - start;
            if (repetition < 0) {
                reference = result;
            } else if (result.best_move != reference.best_move ||
                       result.score != reference.score ||
                       result.depth != reference.depth ||
                       result.nodes != reference.nodes) {
                free_transposition_table(&table);
                return false;
            }
			if (repetition >= 0) {
				times[repetition] = elapsed;
				printf("search_raw fixture=%zu repetition=%d elapsed_us=%llu nodes=%llu score=%d valid=1\n", index,
					repetition, (unsigned long long)elapsed, (unsigned long long)result.nodes, result.score);
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


static bool benchmark_updates(uint64_t iterations, int repetitions) {
	static const struct {
		const char *name;
		const char *fen;
		const char *moves[12];
	} sequences[] = {
		{"opening_ep_castle", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			{"e2e4", "a7a6", "e4e5", "d7d5", "e5d6", "c7d6", "g1f3", "g8f6", "f1e2", "e7e6", "e1g1", NULL}},
		{"king_view", "7k/8/8/8/8/8/P7/3K4 w - - 0 1", {"d1e1", "h8g8", "e1d1", "g8h8", NULL}},
		{"promotion", "4k3/P7/8/8/8/8/7p/4K3 w - - 0 1", {"a7a8q", NULL}}
	};
	for (size_t fixture = 0; fixture < sizeof(sequences) / sizeof(sequences[0]); ++fixture) {
		position_t before[12], after[12], position;
		move_t moves[12];
		int count = 0;
		if (!set_position_fen(&position, sequences[fixture].fen)) return false;
		for (; sequences[fixture].moves[count]; ++count) {
			before[count] = position;
			moves[count] = parse_uci_move(&position, sequences[fixture].moves[count]);
			undo_t undo;
			if (!moves[count] || !make_move(&position, moves[count], &undo)) return false;
			after[count] = position;
			position_t rebuilt = position;
			refresh_nnue(&rebuilt);
			if (memcmp(&position, &rebuilt, sizeof(position)) || evaluate_nnue(&position) != evaluate_nnue(&rebuilt)) return false;
			undo_move(&rebuilt, moves[count], &undo);
			if (memcmp(&rebuilt, &before[count], sizeof(rebuilt))) return false;
			printf("update_fixture name=%s step=%d move=%s king_view_change=%d score=%d valid=1\n", sequences[fixture].name,
				count, sequences[fixture].moves[count],
				memcmp(before[count].king_bucket, after[count].king_bucket, sizeof(position.king_bucket)) != 0 ||
				memcmp(before[count].king_mirror, after[count].king_mirror, sizeof(position.king_mirror)) != 0, evaluate_nnue(&position));
		}
		for (int repetition = -1; repetition < repetitions; ++repetition) {
			int64_t checksum[2] = {0};
			uint64_t elapsed[2];
			for (int pass = 0; pass < 2; ++pass) {
				int mode = (pass + repetition + 1) % 2;
				uint64_t start = time_us();
				for (uint64_t iteration = 0; iteration < iterations; ++iteration) {
					for (int i = 0; i < count; ++i) {
						if (!mode) {
							undo_t undo;
							if (!make_move(&before[i], moves[i], &undo)) return false;
							checksum[mode] += evaluate_nnue(&before[i]);
							undo_move(&before[i], moves[i], &undo);
						} else {
							refresh_nnue(&after[i]);
							checksum[mode] += evaluate_nnue(&after[i]);
							refresh_nnue(&before[i]);
						}
						checksum[mode] += evaluate_nnue(&before[i]);
					}
				}
				elapsed[mode] = time_us() - start;
			}
			if (checksum[0] != checksum[1]) return false;
			if (repetition >= 0) printf("updates name=%s repetition=%d pairs=%llu incremental_make_undo_us=%llu full_refresh_pair_us=%llu checksum=%lld valid=1\n",
				sequences[fixture].name, repetition, (unsigned long long)(iterations * (uint64_t)count),
				(unsigned long long)elapsed[0], (unsigned long long)elapsed[1], (long long)checksum[0]);
		}
	}
	return true;
}


static bool parse_count(const char *text, uint64_t maximum, uint64_t *count) {
	if (!*text) return false;
	uint64_t value = 0;
	for (; *text; ++text) {
		if (*text < '0' || *text > '9') return false;
		unsigned digit = (unsigned)(*text - '0');
		if (value > (maximum - digit) / 10u) return false;
		value = value * 10u + digit;
	}
	if (!value || value > maximum) return false;
	*count = value;
	return true;
}

int main(int argc, char **argv) {
    if (argc < 2 || argc > 5) {
        fprintf(stderr,
                "usage: p4bench MODEL [EVAL_ITERATIONS] [SEARCH_DEPTH] [REPETITIONS]\n");
        return 2;
    }
    uint64_t iterations = 100000, requested_depth = 3, requested_repetitions = 3;
    if ((argc >= 3 && !parse_count(argv[2], 10000000, &iterations)) ||
		(argc >= 4 && !parse_count(argv[3], 12, &requested_depth)) ||
		(argc >= 5 && !parse_count(argv[4], 31, &requested_repetitions))) {
        fprintf(stderr, "invalid benchmark options\n");
        return 2;
    }
    int depth = (int)requested_depth;
    int repetitions = (int)requested_repetitions;
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
    printf("compiler %s\n", __VERSION__);
    bool ok = benchmark_evaluation(iterations) &&
              benchmark_search(depth, repetitions) &&
		benchmark_updates(iterations < 2000 ? iterations : 2000, repetitions);
    unload_nnue();
    if (!ok) {
        fprintf(stderr, "benchmark failed\n");
        return 1;
    }
    return 0;
}
