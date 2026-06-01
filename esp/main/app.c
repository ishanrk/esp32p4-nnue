#include "ch.h"

#include <stdio.h>

extern const uint8_t reference_nnue_start[]
    asm("_binary_reference_nnue_start");
extern const uint8_t reference_nnue_end[]
    asm("_binary_reference_nnue_end");

enum { FIRMWARE_TT_KIB = 256 };

void app_main(void) {
    transposition_table_t table = {0};
    size_t model_size =
        (size_t)((uintptr_t)reference_nnue_end -
                 (uintptr_t)reference_nnue_start);

    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    initialize_chess();
    if (!bind_nnue(reference_nnue_start, model_size)) {
        puts("esp32p4 nnue model bind failed");
        return;
    }
    if (!resize_transposition_table_bytes(
            &table, (size_t)FIRMWARE_TT_KIB * 1024u)) {
        puts("esp32p4 nnue hash allocation failed");
        unload_nnue();
        return;
    }

    printf("esp32p4 nnue firmware reference model format %d profile %dx%d "
           "bytes %u tt %d kib\n",
           NNUE_FORMAT_VERSION, NNUE_BUCKET_COUNT, NNUE_HIDDEN_SIZE,
           (unsigned)model_size, FIRMWARE_TT_KIB);
    run_uci_loop(&table);

    free_transposition_table(&table);
    unload_nnue();
}
