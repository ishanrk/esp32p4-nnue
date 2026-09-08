#include "ch.h"
#include "model_storage.h"
#include "protocol.h"
#include "serial_adapter.h"

#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

extern const uint8_t reference_nnue_start[]
    asm("_binary_reference_nnue_start");
extern const uint8_t reference_nnue_end[]
    asm("_binary_reference_nnue_end");

enum {
    FIRMWARE_TT_BYTES = 256 * 1024,
    UART_RECEIVE_CHUNK_BYTES = 256,
    UART_RX_RING_BYTES = 512,
    UART_TX_RING_BYTES = 0
};

static const char *firmware_log_tag = "firmware";

static void get_telemetry(void *argument, board_telemetry_t *out) {
    (void)argument;
    out->available = 0x13;
    out->internal_free = (uint32_t)heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    out->internal_minimum = (uint32_t)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    /* IDF reports this high water mark in bytes, unlike upstream FreeRTOS. */
    out->stack_free_minimum = (uint32_t)uxTaskGetStackHighWaterMark(NULL);
    if (heap_caps_get_total_size(MALLOC_CAP_SPIRAM)) {
        out->available |= 0x0c;
        out->psram_free = (uint32_t)heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
        out->psram_minimum = (uint32_t)heap_caps_get_minimum_free_size(MALLOC_CAP_SPIRAM);
    }
}

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

static void get_device_capabilities(void *argument,
                                    board_device_capabilities_t *capabilities) {
    (void)argument;
    memset(capabilities, 0, sizeof(*capabilities));
    capabilities->features = BOARD_CAPABILITY_SEARCH_DEPTH |
                             BOARD_CAPABILITY_SEARCH_TIME |
                             BOARD_CAPABILITY_MODEL_UPLOAD;
    capabilities->maximum_depth = BOARD_PROTOCOL_MAX_DEPTH;
    capabilities->maximum_time_ms = BOARD_PROTOCOL_MAX_TIME_MS;
    snprintf(capabilities->engine_name, sizeof(capabilities->engine_name),
             "P4 NNUE reference");
    snprintf(capabilities->firmware_identity,
             sizeof(capabilities->firmware_identity), "ESP32 P4 firmware");
}

static board_protocol_error_t begin_model_upload(void *argument,
                                                  uint32_t model_bytes,
                                                  uint32_t model_crc32) {
    firmware_context_t *context = argument;
    board_protocol_error_t error = model_storage_begin(
        &context->model_storage, model_bytes, model_crc32);
    synchronize_evaluator(context->position_valid ? &context->position : NULL, &context->table);
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
    synchronize_evaluator(context->position_valid ? &context->position : NULL, &context->table);
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

static bool poll_firmware_search(void *argument) {
	(void)argument;
	vTaskDelay(1);
	return false;
}


static board_protocol_error_t search_protocol_position(
    void *argument,
    uint8_t budget_type,
    uint32_t budget,
    board_search_result_t *result) {
    firmware_context_t *context = argument;
    if (!context->position_valid) return BOARD_ERROR_POSITION_REQUIRED;
    search_limits_t limits = {.move_time_ms = BOARD_PROTOCOL_MAX_TIME_MS,
		.max_ply = 12, .poll = poll_firmware_search};
    if (budget_type == BOARD_GO_DEPTH) {
        limits.depth = (int)budget;
    } else if (budget_type == BOARD_GO_TIME_MS) {
        limits.move_time_ms = budget;
    } else {
        return BOARD_ERROR_INVALID_PAYLOAD;
    }
    search_result_t search = search_position(
        &context->position, &context->table, limits, NULL, NULL);
    if (search.failed) return BOARD_ERROR_ENGINE_UNAVAILABLE;
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
    search_limits_t limits = {.depth = 5, .move_time_ms = BOARD_PROTOCOL_MAX_TIME_MS,
		.max_ply = 12, .poll = poll_firmware_search};
    search_result_t search = search_position(
        &context->position, &context->table, limits, NULL, NULL);
    copy_search_result(context, &search, result);
    clear_transposition_table(&context->table);
    context->position = saved_position;
    context->position_valid = saved_position_valid;
    return search.failed ? BOARD_ERROR_ENGINE_UNAVAILABLE : BOARD_ERROR_NONE;
}

static int write_protocol_bytes(void *argument, const uint8_t *data,
                                size_t size, size_t *written) {
    uart_port_t port = *(const uart_port_t *)argument;
    int count = uart_write_bytes(port, data, size);
    *written = count > 0 ? (size_t)count : 0;
    return count < 0 ? -1 : 0;
}

static bool initialize_uart_transport(uart_port_t *port) {
    *port = (uart_port_t)CONFIG_ESP_CONSOLE_UART_NUM;
    esp_err_t error = uart_driver_install(
        *port, UART_RX_RING_BYTES, UART_TX_RING_BYTES, 0, NULL, 0);
    if (error == ESP_OK) return true;
    ESP_LOGE(firmware_log_tag, "uart driver initialization failed %s",
             esp_err_to_name(error));
    return false;
}

static int read_uart_chunk(void *argument, uint8_t *data, size_t capacity, size_t *count) {
    uart_port_t port = *(const uart_port_t *)argument;
    int received = uart_read_bytes(port, data, (uint32_t)capacity, 1);
    *count = received > 0 ? (size_t)received : 0;
    return received < 0 ? -1 : 0;
}

static uint64_t serial_clock(void *argument) { (void)argument; return current_time_ms(); }
static void serial_yield(void *argument) { (void)argument; vTaskDelay(1); }

static bool run_protocol_loop(firmware_context_t *context,
                              uart_port_t *port) {
    board_protocol_backend_t backend = {
        .context = context,
        .get_info = get_device_info,
        .get_capabilities = get_device_capabilities,
        .get_telemetry = get_telemetry,
        .model_begin = begin_model_upload,
        .model_chunk = write_model_chunk,
        .model_commit = commit_model_upload,
        .set_position = set_protocol_position,
        .search = search_protocol_position,
        .benchmark = run_protocol_benchmark,
    };
    chess_serial_adapter_t adapter;
    chess_serial_io_t io = {.context = port, .read = read_uart_chunk,
        .write = write_protocol_bytes, .monotonic_ms = serial_clock,
        .yield = serial_yield};
    if (chess_serial_adapter_init(&adapter, &backend, &io)) return false;
    for (;;) {
        if (chess_serial_adapter_poll(&adapter)) return false;
    }
}

void app_main(void) {
    firmware_context_t context;
    memset(&context, 0, sizeof(context));
    size_t model_size =
        (size_t)((uintptr_t)reference_nnue_end -
                 (uintptr_t)reference_nnue_start);

    initialize_chess();
    if (!model_storage_init(&context.model_storage,
                            reference_nnue_start, model_size)) return;
    if (!resize_transposition_table_bytes(
            &context.table, FIRMWARE_TT_BYTES)) {
        model_storage_deinit(&context.model_storage);
        unload_nnue();
        return;
    }
    uart_port_t port;
    if (!initialize_uart_transport(&port)) {
        free_transposition_table(&context.table);
        model_storage_deinit(&context.model_storage);
        unload_nnue();
        return;
    }
    if (!run_protocol_loop(&context, &port)) {
        ESP_LOGE(firmware_log_tag, "uart receive failed");
    }
    uart_driver_delete(port);
    free_transposition_table(&context.table);
    model_storage_deinit(&context.model_storage);
    unload_nnue();
}
