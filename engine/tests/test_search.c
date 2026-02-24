#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "pos.h"
#include "search.h"
#include "tt.h"

int main(int argc, char **argv) {
    if (argc < 3) {
        printf("usage: test_search <fen> <depth>\n");
        return 0;
    }
    Position pos;
    if (strcmp(argv[1], "startpos") == 0) {
        pos_startpos(&pos);
    } else if (!pos_from_fen(&pos, argv[1])) {
        printf("bad fen\n");
        return 1;
    }
    U32 depth = (U32)atoi(argv[2]);
    TTTable tt;
    tt_init(&tt, 8);
    SearchResult r = search_position(&pos, &tt, depth);
    tt_free(&tt);
    if (r.depth != depth) {
        return 1;
    }
    printf("test_search ok\n");
    return 0;
}
