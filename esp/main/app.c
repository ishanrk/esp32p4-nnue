#include "ch.h"

#include <stdio.h>

void app_main(void) {
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    ch_init();
    uci();
}
