#include "uci.h"

int main(int argc, char **argv) {
    if (argc > 1 && argv[1][0] == '-' && argv[1][1] == '-' &&
        argv[1][2] == 'c' && argv[1][3] == 'l' && argv[1][4] == 'i' && argv[1][5] == '\0') {
        cli_loop();
        return 0;
    }
    uci_loop();
    return 0;
}
