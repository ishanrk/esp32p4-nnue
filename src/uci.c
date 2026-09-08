#define _POSIX_C_SOURCE 200809L
#include "ch.h"
#include <errno.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
	position_t *position;
	transposition_table_t *table;
	search_limits_t limits;
	pthread_t thread;
	atomic_bool stop;
	bool joinable;
	bool infinite;
} uci_search_t;


static void print_search_info(const search_result_t *result, void *context) {
	(void)context;
	flockfile(stdout);
	printf("info depth %d nodes %llu time %llu ", result->depth,
		(unsigned long long)result->nodes, (unsigned long long)result->elapsed_ms);
	if (result->score > SCORE_MATE - MAX_PLY) printf("score mate %d ", (SCORE_MATE - result->score + 1) / 2);
	else if (result->score < -SCORE_MATE + MAX_PLY) printf("score mate -%d ", (SCORE_MATE + result->score + 1) / 2);
	else printf("score cp %d ", result->score);
	printf("pv");
	for (int i = 0; i < result->pv_count; ++i) {
		char move[6];
		move_to_uci(result->pv[i], move);
		printf(" %s", move);
	}
	putchar('\n');
	fflush(stdout);
	funlockfile(stdout);
}


static bool poll_search(void *argument) {
	uci_search_t *search = argument;
	return atomic_load_explicit(&search->stop, memory_order_relaxed);
}


static void *run_search(void *argument) {
	uci_search_t *search = argument;
	search_result_t result = search_position(search->position, search->table,
		search->limits, print_search_info, NULL);
	if (result.failed) {
		puts("info string search allocation failed");
		puts("bestmove 0000");
		fflush(stdout);
		return NULL;
	}
	while (search->infinite && !poll_search(search)) {
		struct timespec delay = {.tv_nsec = 1000000};
		nanosleep(&delay, NULL);
	}
	char move[6] = "0000";
	if (result.best_move) move_to_uci(result.best_move, move);
	printf("bestmove %s\n", move);
	fflush(stdout);
	return NULL;
}


static void stop_search(uci_search_t *search) {
	if (!search->joinable) return;
	atomic_store_explicit(&search->stop, true, memory_order_relaxed);
	int error = pthread_join(search->thread, NULL);
	if (error) { fprintf(stderr, "search join failed: %s\n", strerror(error)); abort(); }
	search->joinable = false;
}


static bool parse_number(const char *text, uint64_t maximum, uint64_t *value) {
	if (!text || !*text) return false;
	uint64_t number = 0;
	for (; *text; ++text) {
		if (*text < '0' || *text > '9') return false;
		unsigned digit = (unsigned)(*text - '0');
		if (digit > maximum || number > (maximum - digit) / 10u) return false;
		number = number * 10u + digit;
	}
	*value = number;
	return true;
}


static bool set_uci_position(position_t *position, char *line) {
	position_t candidate;
	char *moves = strstr(line, " moves ");
	if (moves) *moves = 0;
	if (!strcmp(line, "position startpos")) set_start_position(&candidate);
	else if (!strncmp(line, "position fen ", 13)) {
		if (!set_position_fen(&candidate, line + 13)) return false;
	} else return false;
	if (moves) {
		char *state = NULL;
		for (char *token = strtok_r(moves + 7, " \t", &state); token; token = strtok_r(NULL, " \t", &state)) {
			move_t move = parse_uci_move(&candidate, token);
			undo_t undo;
			if (!move || !make_move(&candidate, move, &undo)) return false;
		}
	}
	*position = candidate;
	return true;
}


static bool parse_search_limits(position_t *position, char *line, search_limits_t *limits, bool *infinite) {
	*limits = (search_limits_t){0};
	*infinite = false;
	uint64_t remaining[2] = {0}, increment[2] = {0}, moves_to_go = 30;
	bool clock_set = false, seen[8] = {false};
	static const char *names[] = {"depth", "movetime", "wtime", "btime", "winc", "binc", "movestogo", "infinite"};
	char *state = NULL;
	strtok_r(line, " \t", &state);
	for (char *token = strtok_r(NULL, " \t", &state); token; token = strtok_r(NULL, " \t", &state)) {
		int option = 0;
		while (option < 8 && strcmp(token, names[option])) ++option;
		if (option == 8 || seen[option]) return false;
		seen[option] = true;
		if (option == 7) { *infinite = true; continue; }
		uint64_t value;
		if (!parse_number(strtok_r(NULL, " \t", &state), UINT32_MAX, &value)) return false;
		if (option == 0) {
			if (!value || value >= MAX_PLY) return false;
			limits->depth = (int)value;
		} else if (option == 1) {
			if (!value) return false;
			limits->move_time_ms = value;
		} else if (option == 2 || option == 3) {
			remaining[option - 2] = value;
			clock_set = true;
		} else if (option == 4 || option == 5) increment[option - 4] = value;
		else {
			if (!value) return false;
			moves_to_go = value;
		}
	}
	if (*infinite) {
		for (int i = 0; i < 7; ++i) if (seen[i]) return false;
		limits->depth = MAX_PLY - 1;
	} else if (!limits->move_time_ms && clock_set) {
		uint64_t time = remaining[position->side_to_move];
		uint64_t budget = time / moves_to_go + increment[position->side_to_move] / 2u;
		uint64_t available = time > 20 ? time - 20 : 1;
		if (budget > available) budget = available;
		limits->move_time_ms = budget ? budget : 1;
	} else if (!limits->depth && !limits->move_time_ms) limits->depth = 8;
	return true;
}


void run_uci_loop(transposition_table_t *table, const char *model_path) {
	position_t position;
	set_start_position(&position);
	synchronize_evaluator(&position, table);
	char active_model[4096];
	snprintf(active_model, sizeof(active_model), "%s", model_path ? model_path : "<empty>");
	uci_search_t search = {.position = &position, .table = table};
	atomic_init(&search.stop, false);
	char line[4096];
	while (fgets(line, sizeof(line), stdin)) {
		size_t size = strlen(line);
		if (size == sizeof(line) - 1 && line[size - 1] != '\n') {
			int c;
			while ((c = getchar()) != '\n' && c != EOF) {}
			puts("info string command too long");
			fflush(stdout);
			continue;
		}
		while (size && strchr(" \t\r\n", line[size - 1])) line[--size] = 0;
		if (!strcmp(line, "isready")) puts("readyok");
		else if (!strcmp(line, "stop")) stop_search(&search);
		else if (!strcmp(line, "quit")) break;
		else if (!strcmp(line, "uci")) {
			flockfile(stdout);
			puts("id name esp32p4 nnue");
			puts("id author ishan kumthekar");
			puts("option name Hash type spin default 1 min 1 max 256");
			printf("option name EvalFile type string default %s\n", model_path ? model_path : "<empty>");
			printf("info string evaluator %s model %s\n", nnue_is_loaded() ? "nnue" : "classical", active_model);
			puts("uciok");
			funlockfile(stdout);
		} else if (!strcmp(line, "ucinewgame")) {
			stop_search(&search);
			set_start_position(&position);
			clear_transposition_table(table);
		} else if (!strncmp(line, "position ", 9)) {
			stop_search(&search);
			if (!set_uci_position(&position, line)) puts("info string invalid position fen or move");
		} else if (!strncmp(line, "setoption name Hash value ", 26)) {
			stop_search(&search);
			uint64_t megabytes;
			if (!parse_number(line + 26, 256, &megabytes) || !megabytes) puts("info string invalid hash size");
			else if (!resize_transposition_table(table, (size_t)megabytes)) puts("info string hash alloc failed");
		} else if (!strncmp(line, "setoption name EvalFile value ", 30)) {
			stop_search(&search);
			const char *path = line + 30;
			if (!strcmp(path, "<empty>")) {
				unload_nnue();
				synchronize_evaluator(&position, table);
				snprintf(active_model, sizeof(active_model), "%s", path);
				puts("info string evaluator classical");
			} else if (*path && load_nnue(path)) {
				synchronize_evaluator(&position, table);
				snprintf(active_model, sizeof(active_model), "%s", path);
				printf("info string nn loaded\ninfo string evaluator nnue model %s\n", active_model);
			} else puts("info string nn load failed");
		} else if (!strcmp(line, "go") || !strncmp(line, "go ", 3)) {
			stop_search(&search);
			if (!parse_search_limits(&position, line, &search.limits, &search.infinite)) {
				puts("info string invalid go options");
			} else {
				search.limits.poll = poll_search;
				search.limits.poll_context = &search;
				atomic_store_explicit(&search.stop, false, memory_order_relaxed);
				int error = pthread_create(&search.thread, NULL, run_search, &search);
				if (error) printf("info string search start failed %s\n", strerror(error));
				else search.joinable = true;
			}
		} else if (!strncmp(line, "perft ", 6)) {
			stop_search(&search);
			uint64_t depth;
			if (!parse_number(line + 6, 5, &depth)) puts("info string invalid perft depth");
			else {
				uint64_t start = current_time_ms();
				uint64_t nodes = perft(&position, (int)depth);
				printf("info string perft %llu nodes %llu time %llu\n", (unsigned long long)depth,
					(unsigned long long)nodes, (unsigned long long)(current_time_ms() - start));
			}
		} else if (!strcmp(line, "eval")) {
			stop_search(&search);
			printf("info string eval %d\n", evaluate(&position));
		} else if (*line) puts("info string unsupported command");
		fflush(stdout);
	}
	stop_search(&search);
}
