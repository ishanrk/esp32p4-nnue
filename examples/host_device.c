#define _POSIX_C_SOURCE 200809L
#include "ch.h"
#include "protocol.h"
#include "serial_adapter.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>

typedef struct {
    position_t position;
    transposition_table_t table;
    bool position_valid;
    uint32_t model_bytes, model_crc;
} host_device_t;

static void get_info(void *argument, board_device_info_t *info) {
    host_device_t *device = argument;
    memset(info, 0, sizeof(*info));
    info->target = BOARD_TARGET_UNKNOWN;
    info->transposition_table_bytes = 1024 * 1024;
    if (nnue_is_loaded()) {
        info->model_state = BOARD_MODEL_EMBEDDED;
        info->nnue_format = 3;
        info->bucket_count = NNUE_BUCKET_COUNT;
        info->hidden_width = NNUE_HIDDEN_SIZE;
        info->active_model_bytes = device->model_bytes;
        info->active_model_crc32 = device->model_crc;
    }
    snprintf(info->firmware_version, sizeof(info->firmware_version),
             "host fixture 1");
}

static void get_capabilities(void *argument,
                             board_device_capabilities_t *capabilities) {
    (void)argument;
    memset(capabilities, 0, sizeof(*capabilities));
    capabilities->features = BOARD_CAPABILITY_SEARCH_DEPTH |
                             BOARD_CAPABILITY_SEARCH_TIME;
    capabilities->maximum_depth = BOARD_PROTOCOL_MAX_DEPTH;
    capabilities->maximum_time_ms = BOARD_PROTOCOL_MAX_TIME_MS;
    snprintf(capabilities->engine_name, sizeof(capabilities->engine_name),
             "%s", nnue_is_loaded() ? "P4 host NNUE" : "P4 classical host");
    snprintf(capabilities->firmware_identity,
             sizeof(capabilities->firmware_identity), "host fixture");
}

static board_protocol_error_t set_position(void *argument, const char *fen) {
    host_device_t *device = argument;
    position_t candidate;
    if (!set_position_fen(&candidate, fen)) return BOARD_ERROR_POSITION_INVALID;
    device->position = candidate;
    device->position_valid = true;
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t search(void *argument, uint8_t kind,
                                     uint32_t budget,
                                     board_search_result_t *result) {
    host_device_t *device = argument;
    if (!device->position_valid) return BOARD_ERROR_POSITION_REQUIRED;
    search_limits_t limits = {.max_ply = 12, .move_time_ms = 5000};
    if (kind == BOARD_GO_DEPTH) limits.depth = (int)budget;
    else if (kind == BOARD_GO_TIME_MS) limits.move_time_ms = budget;
    else return BOARD_ERROR_INVALID_PAYLOAD;
    search_result_t search_result = search_position(
        &device->position, &device->table, limits, NULL, NULL);
    if (search_result.failed) return BOARD_ERROR_ENGINE_UNAVAILABLE;
    memset(result, 0, sizeof(*result));
    if (search_result.best_move) move_to_uci(search_result.best_move, result->best_move);
    else memcpy(result->best_move, "0000", 5);
    result->score = search_result.score;
    result->depth = (uint16_t)search_result.depth;
    result->nodes = search_result.nodes;
    result->elapsed_ms = (uint32_t)search_result.elapsed_ms;
    result->model_state = nnue_is_loaded() ? BOARD_MODEL_EMBEDDED : BOARD_MODEL_NONE;
    result->model_crc32 = device->model_crc;
    return BOARD_ERROR_NONE;
}

static int serial_read(void *context, uint8_t *dst, size_t capacity, size_t *count) {
    (void)context;
    ssize_t n = read(STDIN_FILENO, dst, capacity);
    *count = n > 0 ? (size_t)n : 0;
    return n == 0 ? 1 : (n < 0 && errno != EINTR ? -1 : 0);
}

static int serial_write(void *context, const uint8_t *src, size_t length, size_t *count) {
    (void)context;
    ssize_t n = write(STDOUT_FILENO, src, length);
    *count = n > 0 ? (size_t)n : 0;
    return n < 0 && errno != EINTR ? -1 : 0;
}

static uint64_t monotonic_ms(void *context) { (void)context; return current_time_ms(); }
static void platform_yield(void *context) {
    (void)context;
    struct timespec pause = {.tv_nsec = 1000000};
    nanosleep(&pause, NULL);
}

int main(int argc, char **argv) {
    if (argc != 1 && (argc != 3 || strcmp(argv[1], "--model"))) {
        fprintf(stderr, "usage: p4hostdevice [--model PATH]\n");
        return 2;
    }
    initialize_chess();
    host_device_t device = {0};
    if (argc == 3) {
        if (!load_nnue(argv[2])) return 1;
        FILE *model = fopen(argv[2], "rb");
        if (!model) return 1;
        uint8_t bytes[1024];
        size_t count;
        uint32_t crc = board_protocol_crc32_begin();
        while ((count = fread(bytes, 1, sizeof(bytes), model))) {
            device.model_bytes += (uint32_t)count;
            crc = board_protocol_crc32_update(crc, bytes, count);
        }
        int failed = ferror(model);
        fclose(model);
        if (failed) return 1;
        device.model_crc = board_protocol_crc32_finish(crc);
    }
    if (!resize_transposition_table(&device.table, 1)) return 1;
    board_protocol_backend_t backend = {
        .context = &device, .get_info = get_info,
        .get_capabilities = get_capabilities, .set_position = set_position,
        .search = search,
    };
    chess_serial_io_t io = {.read = serial_read, .write = serial_write,
        .monotonic_ms = monotonic_ms, .yield = platform_yield};
    chess_serial_adapter_t adapter;
    if (chess_serial_adapter_init(&adapter, &backend, &io)) return 1;
    int status;
    while ((status = chess_serial_adapter_poll(&adapter)) == 0) {}
    free_transposition_table(&device.table);
    unload_nnue();
    return status == 1 ? 0 : 1;
}
