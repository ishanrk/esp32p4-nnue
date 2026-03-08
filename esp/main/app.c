#include "ch.h"

#include <stdio.h>

void app_main(void) {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    initialize_chess();
    run_uci_loop();
}
