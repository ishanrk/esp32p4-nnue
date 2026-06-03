#include "ch.h"
#include "model_storage.h"
#include "protocol.h"

#include "esp_app_desc.h"

#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

extern const uint8_t reference_nnue_start[]
    asm("_binary_reference_nnue_start");
extern const uint8_t reference_nnue_end[]
    asm("_binary_reference_nnue_end");

enum { FIRMWARE_TT_BYTES = 256 * 1024 };

typedef struct {
    model_storage_t model_storage;
    transposition_table_t table;
    position_t position;
    bool position_valid;
} firmware_context_t;

_Static_assert(sizeof(move_t) == 4, "firmware move size");
_Static_assert(NNUE_BUCKET_COUNT == 4, "firmware nnue buckets");
_Static_assert(NNUE_HIDDEN_SIZE == 128, "firmware nnue width");

static void get_device_info(void *argument, board_device_info_t *info) {
    firmware_context_t *context = argument;
    const esp_app_desc_t *description = esp_app_get_description();
    memset(info, 0, sizeof(*info));
    info->target = BOARD_TARGET_ESP32_P4;
    info->model_state = context->model_storage.active_state;
    info->nnue_format = NNUE_FORMAT_VERSION;
    info->bucket_count = NNUE_BUCKET_COUNT;
    info->hidden_width = NNUE_HIDDEN_SIZE;
    info->maximum_model_bytes = NNUE_FILE_SIZE;
    info->active_model_bytes = NNUE_FILE_SIZE;
    info->active_model_crc32 = context->model_storage.active_crc32;
    info->transposition_table_bytes = FIRMWARE_TT_BYTES;
    snprintf(info->firmware_version, sizeof(info->firmware_version), "%s",
             description->version);
}

static board_protocol_error_t begin_model_upload(void *argument,
                                                  uint32_t model_bytes,
                                                  uint32_t model_crc32) {
    firmware_context_t *context = argument;
    board_protocol_error_t error = model_storage_begin(
        &context->model_storage, model_bytes, model_crc32);
    if (!error && context->position_valid) refresh_nnue(&context->position);
    return error;
}

static board_protocol_error_t write_model_chunk(void *argument,
                                                 uint32_t offset,
                                                 const uint8_t *data,
                                                 size_t size) {
    firmware_context_t *context = argument;
    return model_storage_chunk(&context->model_storage, offset, data, size);
}

static board_protocol_error_t commit_model_upload(void *argument) {
    firmware_context_t *context = argument;
    board_protocol_error_t error = model_storage_commit(
        &context->model_storage);
    if (!error && context->position_valid) refresh_nnue(&context->position);
    return error;
}

static board_protocol_error_t set_protocol_position(void *argument,
                                                     const char *fen) {
    firmware_context_t *context = argument;
    position_t position;
    if (!set_position_fen(&position, fen)) return BOARD_ERROR_POSITION_INVALID;
    context->position = position;
    context->position_valid = true;
    return BOARD_ERROR_NONE;
}

static void copy_search_result(firmware_context_t *context,
                               const search_result_t *search,
                               board_search_result_t *result) {
    if (search->best_move) {
        move_to_uci(search->best_move, result->best_move);
    } else {
        memcpy(result->best_move, "0000", 5);
    }
    result->score = search->score;
    result->depth = (uint16_t)search->depth;
    result->nodes = search->nodes;
    result->elapsed_ms = search->elapsed_ms > UINT32_MAX
                             ? UINT32_MAX
                             : (uint32_t)search->elapsed_ms;
    result->model_state = context->model_storage.active_state;
    result->model_crc32 = context->model_storage.active_crc32;
}

static board_protocol_error_t search_protocol_position(
    void *argument,
    uint8_t budget_type,
    uint32_t budget,
    board_search_result_t *result) {
    firmware_context_t *context = argument;
    if (!context->position_valid) return BOARD_ERROR_POSITION_REQUIRED;
    search_limits_t limits = {0};
    if (budget_type == BOARD_GO_DEPTH) {
        limits.depth = (int)budget;
    } else if (budget_type == BOARD_GO_TIME_MS) {
        limits.move_time_ms = budget;
    } else {
        return BOARD_ERROR_INVALID_PAYLOAD;
    }
    search_result_t search = search_position(
        &context->position, &context->table, limits, NULL, NULL);
    copy_search_result(context, &search, result);
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t run_protocol_benchmark(
    void *argument, board_search_result_t *result) {
    firmware_context_t *context = argument;
    position_t saved_position = context->position;
    bool saved_position_valid = context->position_valid;
    set_start_position(&context->position);
    clear_transposition_table(&context->table);
    search_limits_t limits = {.depth = 5};
    search_result_t search = search_position(
        &context->position, &context->table, limits, NULL, NULL);
    copy_search_result(context, &search, result);
    clear_transposition_table(&context->table);
    context->position = saved_position;
    context->position_valid = saved_position_valid;
    return BOARD_ERROR_NONE;
}

static void write_protocol_bytes(const uint8_t *data,
                                 size_t size,
                                 void *argument) {
    (void)argument;
    fwrite(data, 1, size, stdout);
    fflush(stdout);
}

static void run_protocol_loop(firmware_context_t *context) {
    board_protocol_backend_t backend = {
        .context = context,
        .get_info = get_device_info,
        .model_begin = begin_model_upload,
        .model_chunk = write_model_chunk,
        .model_commit = commit_model_upload,
        .set_position = set_protocol_position,
        .search = search_protocol_position,
        .benchmark = run_protocol_benchmark,
    };
    board_protocol_t protocol;
    board_protocol_init(&protocol, &backend);
    for (;;) {
        int byte = getchar();
        if (byte == EOF) continue;
        uint8_t input = (uint8_t)byte;
        board_protocol_feed(&protocol, &input, 1,
                            write_protocol_bytes, NULL);
    }
}

void app_main(void) {
    firmware_context_t context;
    memset(&context, 0, sizeof(context));
    size_t model_size =
        (size_t)((uintptr_t)reference_nnue_end -
                 (uintptr_t)reference_nnue_start);

    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    initialize_chess();
    if (!model_storage_init(&context.model_storage,
                            reference_nnue_start, model_size)) return;
    if (!resize_transposition_table_bytes(
            &context.table, FIRMWARE_TT_BYTES)) {
        model_storage_deinit(&context.model_storage);
        unload_nnue();
        return;
    }
    run_protocol_loop(&context);
    free_transposition_table(&context.table);
    model_storage_deinit(&context.model_storage);
    unload_nnue();
}
