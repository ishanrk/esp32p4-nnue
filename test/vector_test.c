#include "protocol.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    FILE *input = fopen(argv[1], "r");
    if (!input) return 2;
    char name[80], hex[BOARD_PROTOCOL_MAX_FRAME * 2 + 1];
    size_t count = 0;
    while (fscanf(input, "%79s %2068s", name, hex) == 2) {
        uint8_t bytes[BOARD_PROTOCOL_MAX_FRAME], encoded[BOARD_PROTOCOL_MAX_FRAME];
        size_t size = strlen(hex) / 2;
        if (strlen(hex) % 2 || size < 10) return 1;
        for (size_t i = 0; i < size; ++i) {
            char pair[3] = {hex[2*i], hex[2*i+1], 0};
            char *end;
            bytes[i] = (uint8_t)strtoul(pair, &end, 16);
            if (*end) return 1;
        }
        size_t payload = (size_t)bytes[4] | (size_t)bytes[5] << 8;
        size_t actual = board_protocol_encode_frame(bytes[2], bytes[3], bytes + 6, payload,
                                                    encoded, sizeof(encoded));
        if (actual != size || memcmp(bytes, encoded, size)) {
            fprintf(stderr, "golden vector mismatch: %s\n", name);
            return 1;
        }
        ++count;
    }
    int failed = ferror(input);
    fclose(input);
    printf("%zu shared protocol vectors passed in C\n", count);
    return failed || !count;
}
