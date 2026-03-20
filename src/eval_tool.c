#include "ch.h"

#include <stdio.h>

int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: p4eval MODEL FEN\n");
        return 2;
    }
    initialize_chess();
    if (!load_nnue(argv[1])) {
        fprintf(stderr, "model load failed\n");
        return 1;
    }
    position_t position;
    if (!set_position_fen(&position, argv[2])) {
        fprintf(stderr, "fen load failed\n");
        unload_nnue();
        return 1;
    }
    printf("%d\n", evaluate_nnue(&position));
    unload_nnue();
    return 0;
}
