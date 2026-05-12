#include "ch.h"

#include <stdio.h>

static bool evaluate_fen(const char *fen) {
    position_t position;
    if (!set_position_fen(&position, fen)) return false;
    printf("%d\n", evaluate_nnue(&position));
    return true;
}

int main(int argc, char **argv) {
    if (argc < 2 || argc > 3) {
        fprintf(stderr, "usage: p4eval MODEL [FEN]\n");
        return 2;
    }
    initialize_chess();
    if (!load_nnue(argv[1])) {
        fprintf(stderr, "model load failed\n");
        return 1;
    }
    if (argc == 3) {
        if (!evaluate_fen(argv[2])) {
            fprintf(stderr, "fen load failed\n");
            unload_nnue();
            return 1;
        }
    } else {
        char fen[256];
        while (fgets(fen, sizeof(fen), stdin)) {
            if (!evaluate_fen(fen)) {
                fprintf(stderr, "fen load failed\n");
                unload_nnue();
                return 1;
            }
        }
    }
    unload_nnue();
    return 0;
}
