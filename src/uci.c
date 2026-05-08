#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void print_search_info(const search_result_t *result, void *context) {
    (void)context;
    printf("info depth %d nodes %llu time %llu ", result->depth,
           (unsigned long long)result->nodes,
           (unsigned long long)result->elapsed_ms);
    if (result->score > 29000) {
        printf("score mate %d ", (30000 - result->score + 1) / 2);
    } else if (result->score < -29000) {
        printf("score mate -%d ", (30000 + result->score + 1) / 2);
    } else {
        printf("score cp %d ", result->score);
    }
    if (result->elapsed_ms) {
        printf("nps %llu ",
               (unsigned long long)(result->nodes * 1000u /
                                    result->elapsed_ms));
    }
    printf("pv");
    for (int i = 0; i < result->pv_count; ++i) {
        char uci_move[6];
        move_to_uci(result->pv[i], uci_move);
        printf(" %s", uci_move);
    }
    putchar('\n');
    fflush(stdout);
}

static void set_uci_position(position_t *position, char *line) {
    char *moves = strstr(line, " moves ");
    if (moves) *moves = '\0';

    if (!strncmp(line, "position startpos", 17)) {
        set_start_position(position);
    } else if (!strncmp(line, "position fen ", 13)) {
        set_position_fen(position, line + 13);
    } else {
        return;
    }

    if (!moves) return;
    char *move_text = moves + 7;
    for (char *token = strtok(move_text, " \t\r\n");
         token;
         token = strtok(NULL, " \t\r\n")) {
        move_t move = parse_uci_move(position, token);
        if (!move) break;
        undo_t undo;
        if (!make_move(position, move, &undo)) break;
    }
}

static search_limits_t parse_search_limits(position_t *position, char *line) {
    search_limits_t limits = {0, 0};
    uint64_t white_time = 0;
    uint64_t black_time = 0;
    uint64_t white_increment = 0;
    uint64_t black_increment = 0;
    char *token = strtok(line, " \t\r\n");
    while ((token = strtok(NULL, " \t\r\n"))) {
        char *value = strtok(NULL, " \t\r\n");
        if (!value) break;
        if (!strcmp(token, "depth")) {
            limits.depth = atoi(value);
        } else if (!strcmp(token, "movetime")) {
            limits.move_time_ms = strtoull(value, NULL, 10);
        } else if (!strcmp(token, "wtime")) {
            white_time = strtoull(value, NULL, 10);
        } else if (!strcmp(token, "btime")) {
            black_time = strtoull(value, NULL, 10);
        } else if (!strcmp(token, "winc")) {
            white_increment = strtoull(value, NULL, 10);
        } else if (!strcmp(token, "binc")) {
            black_increment = strtoull(value, NULL, 10);
        } else if (!strcmp(token, "nodes")) {
        }
    }
    if (!limits.move_time_ms && (white_time || black_time)) {
        uint64_t remaining =
            position->side_to_move == WHITE ? white_time : black_time;
        uint64_t increment = position->side_to_move == WHITE
                                 ? white_increment
                                 : black_increment;
        limits.move_time_ms = remaining / 30u + increment / 2u;
        if (limits.move_time_ms < 10) limits.move_time_ms = 10;
        if (remaining > 40 && limits.move_time_ms > remaining - 20) {
            limits.move_time_ms = remaining - 20;
        }
    }
    if (!limits.depth && !limits.move_time_ms) limits.depth = 8;
    return limits;
}

void run_uci_loop(transposition_table_t *table) {
    position_t position;
    set_start_position(&position);

    char line[4096];
    while (fgets(line, sizeof(line), stdin)) {
        if (!strcmp(line, "uci\n") || !strcmp(line, "uci\r\n") ||
            !strcmp(line, "uci")) {
            puts("id name esp32p4 nnue");
            puts("id author ishan kumthekar");
#ifndef ESP_PLATFORM
            puts("option name Hash type spin default 1 min 1 max 256");
            puts("option name EvalFile type string default nn.bin");
#endif
            puts("uciok");
        } else if (!strncmp(line, "isready", 7)) {
            puts("readyok");
        } else if (!strncmp(line, "ucinewgame", 10)) {
            set_start_position(&position);
            clear_transposition_table(table);
        } else if (!strncmp(line, "position ", 9)) {
            set_uci_position(&position, line);
#ifndef ESP_PLATFORM
        } else if (!strncmp(line, "setoption name Hash value ", 26)) {
            size_t megabytes = strtoul(line + 26, NULL, 10);
            if (!resize_transposition_table(table, megabytes)) {
                puts("info string hash alloc failed");
            }
        } else if (!strncmp(line, "setoption name EvalFile value ", 30)) {
            char *path = line + 30;
            path[strcspn(path, "\r\n")] = '\0';
            if (load_nnue(path)) {
                refresh_nnue(&position);
                puts("info string nn loaded");
            } else {
                puts("info string nn load failed");
            }
#endif
        } else if (!strncmp(line, "go ", 3) ||
                   !strcmp(line, "go\n") ||
                   !strcmp(line, "go\r\n")) {
            char copy[4096];
            memcpy(copy, line, sizeof(copy));
            copy[sizeof(copy) - 1] = '\0';
            search_limits_t limits = parse_search_limits(&position, copy);
            search_result_t result = search_position(
                &position, table, limits, print_search_info, NULL);
            if (result.best_move) {
                char uci_move[6];
                move_to_uci(result.best_move, uci_move);
                printf("bestmove %s\n", uci_move);
            } else {
                puts("bestmove 0000");
            }
        } else if (!strncmp(line, "perft ", 6)) {
            int depth = atoi(line + 6);
            uint64_t start_ms = current_time_ms();
            uint64_t nodes = perft(&position, depth);
            uint64_t elapsed_ms = current_time_ms() - start_ms;
            printf("info string perft %d nodes %llu time %llu\n", depth,
                   (unsigned long long)nodes,
                   (unsigned long long)elapsed_ms);
        } else if (!strncmp(line, "eval", 4)) {
            printf("info string eval %d\n", evaluate(&position));
        } else if (!strncmp(line, "quit", 4)) {
            break;
        }
        fflush(stdout);
    }
}
