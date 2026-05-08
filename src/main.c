#include "ch.h"

int main(void) {
    transposition_table_t table = {0};
    initialize_chess();
    resize_transposition_table(&table, 1);
    run_uci_loop(&table);
    free_transposition_table(&table);
    unload_nnue();
    return 0;
}
