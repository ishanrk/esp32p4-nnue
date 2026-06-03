#ifndef P4_BOARD_PROTOCOL_H
#define P4_BOARD_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum {
    BOARD_PROTOCOL_MAGIC_FIRST = 'P',
    BOARD_PROTOCOL_MAGIC_SECOND = '4',
    BOARD_PROTOCOL_VERSION = 1,
    BOARD_PROTOCOL_HEADER_SIZE = 6,
    BOARD_PROTOCOL_CRC_SIZE = 4,
    BOARD_PROTOCOL_MAX_PAYLOAD = 1024,
    BOARD_PROTOCOL_MAX_FRAME =
        BOARD_PROTOCOL_HEADER_SIZE + BOARD_PROTOCOL_MAX_PAYLOAD +
        BOARD_PROTOCOL_CRC_SIZE,
    BOARD_PROTOCOL_MAX_FEN = 127,
    BOARD_PROTOCOL_MAX_FIRMWARE_VERSION = 31,
    BOARD_PROTOCOL_MODEL_CHUNK_BYTES = BOARD_PROTOCOL_MAX_PAYLOAD - 4,
    BOARD_PROTOCOL_MAX_DEPTH = 64,
    BOARD_PROTOCOL_MAX_TIME_MS = 3600000
};

enum {
    BOARD_COMMAND_HELLO = 0x01,
    BOARD_COMMAND_DEVICE_INFO = 0x02,
    BOARD_COMMAND_FIRMWARE_INFO = 0x03,
    BOARD_COMMAND_MODEL_INFO = 0x04,
    BOARD_COMMAND_MODEL_BEGIN = 0x10,
    BOARD_COMMAND_MODEL_CHUNK = 0x11,
    BOARD_COMMAND_MODEL_COMMIT = 0x12,
    BOARD_COMMAND_POSITION = 0x20,
    BOARD_COMMAND_GO = 0x21,
    BOARD_COMMAND_BENCH = 0x22,
    BOARD_COMMAND_ERROR = 0xff
};

enum {
    BOARD_ERROR_NONE,
    BOARD_ERROR_VERSION,
    BOARD_ERROR_LENGTH,
    BOARD_ERROR_CHECKSUM,
    BOARD_ERROR_UNKNOWN_COMMAND,
    BOARD_ERROR_INVALID_PAYLOAD,
    BOARD_ERROR_MODEL_TOO_LARGE,
    BOARD_ERROR_MODEL_SEQUENCE,
    BOARD_ERROR_MODEL_INCOMPLETE,
    BOARD_ERROR_MODEL_INVALID,
    BOARD_ERROR_STORAGE,
    BOARD_ERROR_POSITION_INVALID,
    BOARD_ERROR_POSITION_REQUIRED
};

enum {
    BOARD_TARGET_UNKNOWN,
    BOARD_TARGET_ESP32_P4
};

enum {
    BOARD_MODEL_NONE,
    BOARD_MODEL_EMBEDDED,
    BOARD_MODEL_UPLOADED
};

enum {
    BOARD_GO_DEPTH = 1,
    BOARD_GO_TIME_MS = 2
};

typedef struct {
    uint8_t target;
    uint8_t model_state;
    uint16_t nnue_format;
    uint16_t bucket_count;
    uint16_t hidden_width;
    uint32_t maximum_model_bytes;
    uint32_t active_model_bytes;
    uint32_t active_model_crc32;
    uint32_t transposition_table_bytes;
    char firmware_version[BOARD_PROTOCOL_MAX_FIRMWARE_VERSION + 1];
} board_device_info_t;

typedef struct {
    char best_move[6];
    int32_t score;
    uint16_t depth;
    uint64_t nodes;
    uint32_t elapsed_ms;
    uint8_t model_state;
    uint32_t model_crc32;
} board_search_result_t;

typedef uint8_t board_protocol_error_t;

typedef struct {
    uint32_t expected_bytes;
    uint32_t expected_crc32;
    uint32_t received_bytes;
    uint32_t crc_state;
    bool active;
} board_model_upload_t;

typedef struct {
    void *context;
    void (*get_info)(void *context, board_device_info_t *info);
    board_protocol_error_t (*model_begin)(void *context,
                                          uint32_t model_bytes,
                                          uint32_t model_crc32);
    board_protocol_error_t (*model_chunk)(void *context,
                                          uint32_t offset,
                                          const uint8_t *data,
                                          size_t size);
    board_protocol_error_t (*model_commit)(void *context);
    board_protocol_error_t (*set_position)(void *context, const char *fen);
    board_protocol_error_t (*search)(void *context,
                                     uint8_t budget_type,
                                     uint32_t budget,
                                     board_search_result_t *result);
    board_protocol_error_t (*benchmark)(void *context,
                                        board_search_result_t *result);
} board_protocol_backend_t;

typedef void (*board_protocol_write_fn)(const uint8_t *data,
                                        size_t size,
                                        void *context);

typedef struct {
    board_protocol_backend_t backend;
    uint8_t frame[BOARD_PROTOCOL_MAX_FRAME];
    size_t frame_size;
    size_t expected_size;
} board_protocol_t;

void board_protocol_init(board_protocol_t *protocol,
                         const board_protocol_backend_t *backend);
void board_protocol_feed(board_protocol_t *protocol,
                         const uint8_t *data,
                         size_t size,
                         board_protocol_write_fn write,
                         void *write_context);
size_t board_protocol_encode_frame(uint8_t version,
                                   uint8_t command,
                                   const uint8_t *payload,
                                   size_t payload_size,
                                   uint8_t *output,
                                   size_t output_size);
uint32_t board_protocol_crc32_begin(void);
uint32_t board_protocol_crc32_update(uint32_t state,
                                     const uint8_t *data,
                                     size_t size);
uint32_t board_protocol_crc32_finish(uint32_t state);
uint32_t board_protocol_crc32(const uint8_t *data, size_t size);
board_protocol_error_t board_model_upload_begin(
    board_model_upload_t *upload,
    uint32_t model_bytes,
    uint32_t model_crc32,
    uint32_t maximum_bytes,
    uint32_t required_bytes);
board_protocol_error_t board_model_upload_accept(
    board_model_upload_t *upload,
    uint32_t offset,
    const uint8_t *data,
    size_t size);
board_protocol_error_t board_model_upload_finish(board_model_upload_t *upload);
void board_model_upload_cancel(board_model_upload_t *upload);

#endif
