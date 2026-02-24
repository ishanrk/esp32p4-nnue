#include "uci.h"

#include "eval.h"
#include "makemove.h"
#include "movegen.h"
#include "nnue.h"
#include "search.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static Position g_pos;
static TTTable g_tt;
static bool g_stop = false;

static void uci_respond_id(void) {
    printf("id name Uberchess_NN\n");
    printf("id author kumth\n");
    printf("option name Hash type spin default 16 min 1 max 1024\n");
    printf("uciok\n");
}

static void trim_newline(char *s) {
    size_t n = strlen(s);
    while (n > 0 && (s[n - 1] == '\n' || s[n - 1] == '\r')) {
        s[--n] = '\0';
    }
}

static bool parse_move_uci(const Position *pos, const char *text, Move *out) {
    MoveList list;
    movegen_legal(pos, &list);
    for (U32 i = 0; i < list.count; i++) {
        char buf[6];
        move_to_uci(list.moves[i], buf);
        if (strcmp(buf, text) == 0) {
            *out = list.moves[i];
            return true;
        }
    }
    return false;
}

static void apply_moves_from_tokens(Position *pos, char *moves_text) {
    char *tok = strtok(moves_text, " ");
    while (tok) {
        Move m;
        if (parse_move_uci(pos, tok, &m)) {
            Undo u;
            if (!make_move(pos, m, &u)) {
                break;
            }
        }
        tok = strtok(NULL, " ");
    }
}

static void handle_position(char *line) {
    char *p = line + 8;
    while (*p == ' ') p++;

    if (strncmp(p, "startpos", 8) == 0) {
        pos_startpos(&g_pos);
        p += 8;
    } else if (strncmp(p, "fen ", 4) == 0) {
        p += 4;
        char fen[256];
        int len = 0;
        int spaces = 0;
        while (*p && len < 255) {
            if (*p == ' ') {
                const char *q = p;
                while (*q == ' ') q++;
                if (strncmp(q, "moves ", 6) == 0) {
                    break;
                }
                spaces++;
            }
            fen[len++] = *p++;
            if (spaces >= 5 && *p == ' ') {
                const char *q = p;
                while (*q == ' ') q++;
                if (strncmp(q, "moves ", 6) == 0) {
                    break;
                }
            }
        }
        fen[len] = '\0';
        pos_from_fen(&g_pos, fen);
    }

    char *moves = strstr(line, " moves ");
    if (moves) {
        moves += 7;
        apply_moves_from_tokens(&g_pos, moves);
    }
}

static void handle_go(char *line) {
    U32 depth = 4;
    char *d = strstr(line, " depth ");
    if (d) {
        int v = atoi(d + 7);
        if (v > 0 && v < 64) {
            depth = (U32)v;
        }
    }
    SearchResult r = search_position(&g_pos, &g_tt, depth);
    char best[6] = "0000";
    if (!move_is_null(r.best_move)) {
        move_to_uci(r.best_move, best);
    }
    printf("bestmove %s\n", best);
}

void uci_loop(void) {
    nnue_init();
    nnue_load(NULL);
    pos_startpos(&g_pos);
    tt_init(&g_tt, 16);

    char line[512];
    while (fgets(line, sizeof(line), stdin)) {
        trim_newline(line);
        if (strcmp(line, "uci") == 0) {
            uci_respond_id();
        } else if (strcmp(line, "isready") == 0) {
            printf("readyok\n");
        } else if (strcmp(line, "ucinewgame") == 0) {
            pos_startpos(&g_pos);
            tt_init(&g_tt, 16);
        } else if (strncmp(line, "position ", 9) == 0) {
            handle_position(line);
        } else if (strncmp(line, "go", 2) == 0) {
            g_stop = false;
            if (!g_stop) {
                handle_go(line);
            }
        } else if (strcmp(line, "stop") == 0) {
            g_stop = true;
        } else if (strcmp(line, "d") == 0) {
            printf("info string eval %d\n", eval_position(&g_pos));
        } else if (strcmp(line, "quit") == 0) {
            break;
        }
    }
    tt_free(&g_tt);
}

static char piece_char(int8_t p) {
    switch (p) {
        case 1: return 'P';
        case 2: return 'N';
        case 3: return 'B';
        case 4: return 'R';
        case 5: return 'Q';
        case 6: return 'K';
        case -1: return 'p';
        case -2: return 'n';
        case -3: return 'b';
        case -4: return 'r';
        case -5: return 'q';
        case -6: return 'k';
        default: return '.';
    }
}

static void print_board(const Position *pos) {
    printf("\n");
    for (int rank = 7; rank >= 0; rank--) {
        printf("%d  ", rank + 1);
        for (int file = 0; file < 8; file++) {
            int sq = rank * 8 + file;
            printf("%c ", piece_char(pos->board[sq]));
        }
        printf("\n");
    }
    printf("\n   a b c d e f g h\n\n");
}

void cli_loop(void) {
    nnue_init();
    nnue_load(NULL);
    pos_startpos(&g_pos);
    tt_init(&g_tt, 16);
    printf("uberchess cli\n");
    printf("type moves like e2e4, type 'go' for engine move, type 'quit' to exit\n");
    print_board(&g_pos);

    char line[256];
    while (1) {
        printf("cli> ");
        if (!fgets(line, sizeof(line), stdin)) {
            break;
        }
        trim_newline(line);
        if (strcmp(line, "quit") == 0) {
            break;
        }
        if (strcmp(line, "go") == 0) {
            SearchResult r = search_position(&g_pos, &g_tt, 4);
            if (move_is_null(r.best_move)) {
                printf("no legal moves\n");
                continue;
            }
            Undo u;
            make_move(&g_pos, r.best_move, &u);
            char best[6];
            move_to_uci(r.best_move, best);
            printf("engine plays %s\n", best);
            print_board(&g_pos);
            continue;
        }
        for (size_t i = 0; line[i]; i++) {
            line[i] = (char)tolower((unsigned char)line[i]);
        }
        Move m;
        if (!parse_move_uci(&g_pos, line, &m)) {
            printf("illegal move\n");
            continue;
        }
        Undo u;
        if (!make_move(&g_pos, m, &u)) {
            printf("illegal move\n");
            continue;
        }
        print_board(&g_pos);
    }
    tt_free(&g_tt);
}
