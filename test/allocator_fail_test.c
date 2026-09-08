#include "ch.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static bool fail_next;
void *__real_calloc(size_t count, size_t size);
void *__wrap_calloc(size_t count, size_t size) {
    if (fail_next) { fail_next = false; return NULL; }
    return __real_calloc(count, size);
}
int main(void) {
    initialize_chess();
    position_t position;
    set_start_position(&position);
    position_t original = position;
    fail_next = true;
    search_result_t result = search_position(&position, NULL,
        (search_limits_t){.depth=1}, NULL, NULL);
    if (!result.failed || result.best_move || memcmp(&position, &original, sizeof(position))) return 1;
    result = search_position(&position, NULL, (search_limits_t){.depth=1}, NULL, NULL);
    if (result.failed || !result.best_move) return 1;
    puts("allocation failure is explicit, preserves root and permits a later search");
    return 0;
}
