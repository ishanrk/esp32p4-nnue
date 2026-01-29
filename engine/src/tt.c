#include "tt.h"

#include <stddef.h>

void tt_init(TTTable *tt, U64 mb) {
    (void)mb;
    tt->entries = NULL;
    tt->mask = 0;
}

void tt_free(TTTable *tt) {
    (void)tt;
}

bool tt_probe(const TTTable *tt, U64 key, TTEntry *out) {
    (void)tt;
    (void)key;
    if (out) {
        out->key = 0;
        out->move = 0;
        out->score = 0;
        out->depth = 0;
        out->flags = 0;
    }
    return false;
}

void tt_store(TTTable *tt, U64 key, const TTEntry *entry) {
    (void)tt;
    (void)key;
    (void)entry;
}
