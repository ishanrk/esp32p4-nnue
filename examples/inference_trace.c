#include "ch.h"
#include "serial_adapter.h"
#include <stdio.h>
#include <string.h>

/* Executable study example. All values come from the supplied model on host. */
int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "usage: p4trace MODEL\n"); return 2; }
    initialize_chess();
    if (!load_nnue(argv[1])) return 1;
    position_t position;
    set_start_position(&position);
    position_t original = position;
    move_t move = parse_uci_move(&position, "e2e4");
    undo_t undo;
    if (!move || !make_move(&position, move, &undo)) return 1;
    position_t refreshed = position;
    refresh_nnue(&refreshed);
    int matched = !memcmp(position.accumulator, refreshed.accumulator, sizeof(position.accumulator));
    printf("{\"execution\":\"host trace\",\"position_bytes\":%zu,\"undo_bytes\":%zu,\"accumulator_bytes\":%zu,\"tt_entry_bytes\":%zu,\"serial_adapter_bytes\":%zu,", sizeof(position), sizeof(undo), sizeof(position.accumulator), sizeof(tt_entry_t), sizeof(chess_serial_adapter_t));
    printf("\"move\":\"e2e4\",\"packed_move\":%u,\"white_first_before\":%d,\"white_first_after\":%d,\"black_first_before\":%d,\"black_first_after\":%d,\"incremental_equals_refresh\":%s,", move, original.accumulator[0][0], position.accumulator[0][0], original.accumulator[1][0], position.accumulator[1][0], matched ? "true" : "false");
    undo_move(&position, move, &undo);
    int restored = !memcmp(&position, &original, sizeof(position));
    printf("\"undo_restored_position\":%s,", restored ? "true" : "false");
    if (!set_position_fen(&position, "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")) return 1;
    original = position;
    move = parse_uci_move(&position, "e1d1");
    if (!move || !make_move(&position, move, &undo)) return 1;
    refreshed = position;
    refresh_nnue(&refreshed);
    int king_matched = !memcmp(position.accumulator, refreshed.accumulator, sizeof(position.accumulator));
    printf("\"king_move\":\"e1d1\",\"mirror_before\":%u,\"mirror_after\":%u,\"king_refresh_matches\":%s,", original.king_mirror[0], position.king_mirror[0], king_matched ? "true" : "false");
    undo_move(&position, move, &undo);
    int king_restored = !memcmp(&position, &original, sizeof(position));
    printf("\"king_undo_restores\":%s}", king_restored ? "true" : "false");
    puts("");
    unload_nnue();
    return matched && restored && king_matched && king_restored ? 0 : 1;
}
