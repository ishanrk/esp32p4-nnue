#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void info(const sr_t *r, void *arg) {
    (void)arg;
    printf("info depth %d nodes %llu time %llu ", r->depth,
           (unsigned long long)r->nodes, (unsigned long long)r->ms);
    if (r->score > 29000) printf("score mate %d ", (30000 - r->score + 1) / 2);
    else if (r->score < -29000) printf("score mate -%d ", (30000 + r->score + 1) / 2);
    else printf("score cp %d ", r->score);
    if (r->ms) printf("nps %llu ", (unsigned long long)(r->nodes * 1000u / r->ms));
    printf("pv");
    for (int i = 0; i < r->pn; ++i) {
        char b[6];
        mv_str(r->pv[i], b);
        printf(" %s", b);
    }
    putchar('\n');
    fflush(stdout);
}

static void set_pos(pos_t *p, char *line) {
    char *moves = strstr(line, " moves ");
    if (moves) *moves = '\0';

    if (!strncmp(line, "position startpos", 17)) pos_start(p);
    else if (!strncmp(line, "position fen ", 13)) pos_set(p, line + 13);
    else return;

    if (!moves) return;
    char *s = moves + 7;
    for (char *tok = strtok(s, " \t\r\n"); tok; tok = strtok(NULL, " \t\r\n")) {
        mv_t m = mv_parse(p, tok);
        if (!m) break;
        undo_t u;
        if (!mv_do(p, m, &u)) break;
    }
}

static lim_t get_lim(pos_t *p, char *line) {
    lim_t l = {0, 0};
    u64 wt = 0;
    u64 bt = 0;
    u64 wi = 0;
    u64 bi = 0;
    char *tok = strtok(line, " \t\r\n");
    while ((tok = strtok(NULL, " \t\r\n"))) {
        char *v = strtok(NULL, " \t\r\n");
        if (!v) break;
        if (!strcmp(tok, "depth")) l.depth = atoi(v);
        else if (!strcmp(tok, "movetime")) l.ms = strtoull(v, NULL, 10);
        else if (!strcmp(tok, "wtime")) wt = strtoull(v, NULL, 10);
        else if (!strcmp(tok, "btime")) bt = strtoull(v, NULL, 10);
        else if (!strcmp(tok, "winc")) wi = strtoull(v, NULL, 10);
        else if (!strcmp(tok, "binc")) bi = strtoull(v, NULL, 10);
        else if (!strcmp(tok, "nodes")) {
        }
    }
    if (!l.ms && (wt || bt)) {
        u64 t = p->side == W ? wt : bt;
        u64 inc = p->side == W ? wi : bi;
        l.ms = t / 30u + inc / 2u;
        if (l.ms < 10) l.ms = 10;
        if (t > 40 && l.ms > t - 20) l.ms = t - 20;
    }
    if (!l.depth && !l.ms) l.depth = 8;
    return l;
}

void uci(void) {
    pos_t p;
    tt_t t = {0};
    pos_start(&p);
    tt_new(&t, 1);

    char line[4096];
    while (fgets(line, sizeof(line), stdin)) {
        if (!strncmp(line, "uci", 3)) {
            puts("id name esp32p4 nnue");
            puts("id author ishan kumthekar");
            puts("option name Hash type spin default 1 min 1 max 256");
            puts("option name EvalFile type string default nn.bin");
            puts("uciok");
        } else if (!strncmp(line, "isready", 7)) {
            puts("readyok");
        } else if (!strncmp(line, "ucinewgame", 10)) {
            pos_start(&p);
            tt_clear(&t);
        } else if (!strncmp(line, "position ", 9)) {
            set_pos(&p, line);
        } else if (!strncmp(line, "setoption name Hash value ", 26)) {
            size_t mb = strtoul(line + 26, NULL, 10);
            if (!tt_new(&t, mb)) puts("info string hash alloc failed");
        } else if (!strncmp(line, "setoption name EvalFile value ", 30)) {
            char *s = line + 30;
            s[strcspn(s, "\r\n")] = '\0';
            if (nn_load(s)) {
                nn_ref(&p);
                puts("info string nn loaded");
            } else puts("info string nn load failed");
        } else if (!strncmp(line, "go ", 3) || !strcmp(line, "go\n") || !strcmp(line, "go\r\n")) {
            char tmp[4096];
            memcpy(tmp, line, sizeof(tmp));
            tmp[sizeof(tmp) - 1] = '\0';
            lim_t l = get_lim(&p, tmp);
            sr_t r = search(&p, &t, l, info, NULL);
            if (r.best) {
                char b[6];
                mv_str(r.best, b);
                printf("bestmove %s\n", b);
            } else puts("bestmove 0000");
        } else if (!strncmp(line, "perft ", 6)) {
            int d = atoi(line + 6);
            u64 t0 = sys_ms();
            u64 n = perft(&p, d);
            u64 dt = sys_ms() - t0;
            printf("info string perft %d nodes %llu time %llu\n", d,
                   (unsigned long long)n, (unsigned long long)dt);
        } else if (!strncmp(line, "eval", 4)) {
            printf("info string eval %d\n", eval(&p));
        } else if (!strncmp(line, "quit", 4)) {
            break;
        }
        fflush(stdout);
    }

    tt_free(&t);
    nn_drop();
}
