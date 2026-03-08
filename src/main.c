#include "ch.h"

int main(void) {
    initialize_chess();
    run_uci_loop();
    return 0;
}
