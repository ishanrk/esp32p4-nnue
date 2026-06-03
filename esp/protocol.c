#include "protocol.h"

#include <stdbool.h>
#include <string.h>

static uint16_t read_u16_le(const uint8_t *data) {
    return (uint16_t)((uint16_t)data[0] | (uint16_t)((uint16_t)data[1] << 8));
}

static uint32_t read_u32_le(const uint8_t *data) {
    return (uint32_t)data[0] |
           (uint32_t)data[1] << 8 |
           (uint32_t)data[2] << 16 |
           (uint32_t)data[3] << 24;
}

static void write_u16_le(uint8_t *data, uint16_t value) {
    data[0] = (uint8_t)value;
    data[1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *data, uint32_t value) {
    data[0] = (uint8_t)value;
    data[1] = (uint8_t)(value >> 8);
    data[2] = (uint8_t)(value >> 16);
    data[3] = (uint8_t)(value >> 24);
}

static void write_u64_le(uint8_t *data, uint64_t value) {
    for (int i = 0; i < 8; ++i) data[i] = (uint8_t)(value >> (8 * i));
}

uint32_t board_protocol_crc32_begin(void) {
    return UINT32_MAX;
}

uint32_t board_protocol_crc32_update(uint32_t state,
                                     const uint8_t *data,
                                     size_t size) {
    for (size_t i = 0; i < size; ++i) {
        state ^= data[i];
        for (int bit = 0; bit < 8; ++bit) {
            uint32_t mask = (uint32_t)-(int32_t)(state & 1u);
            state = (state >> 1) ^ (UINT32_C(0xedb88320) & mask);
        }
    }
    return state;
}

uint32_t board_protocol_crc32_finish(uint32_t state) {
    return state ^ UINT32_MAX;
}

uint32_t board_protocol_crc32(const uint8_t *data, size_t size) {
    return board_protocol_crc32_finish(
        board_protocol_crc32_update(board_protocol_crc32_begin(), data, size));
}

board_protocol_error_t board_model_upload_begin(
    board_model_upload_t *upload,
    uint32_t model_bytes,
    uint32_t model_crc32,
    uint32_t maximum_bytes,
    uint32_t required_bytes) {
    if (!upload || !model_bytes || model_bytes > maximum_bytes) {
        return BOARD_ERROR_MODEL_TOO_LARGE;
    }
    if (required_bytes && model_bytes != required_bytes) {
        return BOARD_ERROR_MODEL_INVALID;
    }
    upload->expected_bytes = model_bytes;
    upload->expected_crc32 = model_crc32;
    upload->received_bytes = 0;
    upload->crc_state = board_protocol_crc32_begin();
    upload->active = true;
    return BOARD_ERROR_NONE;
}

board_protocol_error_t board_model_upload_accept(
    board_model_upload_t *upload,
    uint32_t offset,
    const uint8_t *data,
    size_t size) {
    if (!upload || !upload->active || !data || !size ||
        size > BOARD_PROTOCOL_MODEL_CHUNK_BYTES ||
        offset != upload->received_bytes ||
        size > upload->expected_bytes - upload->received_bytes) {
        return BOARD_ERROR_MODEL_SEQUENCE;
    }
    upload->crc_state = board_protocol_crc32_update(
        upload->crc_state, data, size);
    upload->received_bytes += (uint32_t)size;
    return BOARD_ERROR_NONE;
}

board_protocol_error_t board_model_upload_finish(board_model_upload_t *upload) {
    if (!upload || !upload->active ||
        upload->received_bytes != upload->expected_bytes) {
        return BOARD_ERROR_MODEL_INCOMPLETE;
    }
    upload->active = false;
    if (board_protocol_crc32_finish(upload->crc_state) !=
        upload->expected_crc32) return BOARD_ERROR_CHECKSUM;
    return BOARD_ERROR_NONE;
}

void board_model_upload_cancel(board_model_upload_t *upload) {
    if (upload) upload->active = false;
}

size_t board_protocol_encode_frame(uint8_t version,
                                   uint8_t command,
                                   const uint8_t *payload,
                                   size_t payload_size,
                                   uint8_t *output,
                                   size_t output_size) {
    size_t frame_size = BOARD_PROTOCOL_HEADER_SIZE + payload_size +
                        BOARD_PROTOCOL_CRC_SIZE;
    if (!output || payload_size > BOARD_PROTOCOL_MAX_PAYLOAD ||
        output_size < frame_size || (payload_size && !payload)) return 0;
    output[0] = BOARD_PROTOCOL_MAGIC_FIRST;
    output[1] = BOARD_PROTOCOL_MAGIC_SECOND;
    output[2] = version;
    output[3] = command;
    write_u16_le(output + 4, (uint16_t)payload_size);
    if (payload_size) memcpy(output + BOARD_PROTOCOL_HEADER_SIZE,
                             payload, payload_size);
    uint32_t crc = board_protocol_crc32(
        output + 2, 4 + payload_size);
    write_u32_le(output + BOARD_PROTOCOL_HEADER_SIZE + payload_size, crc);
    return frame_size;
}

void board_protocol_init(board_protocol_t *protocol,
                         const board_protocol_backend_t *backend) {
    memset(protocol, 0, sizeof(*protocol));
    if (backend) protocol->backend = *backend;
}

static void emit_frame(uint8_t command,
                       const uint8_t *payload,
                       size_t payload_size,
                       board_protocol_write_fn write,
                       void *write_context) {
    if (!write) return;
    uint8_t frame[BOARD_PROTOCOL_MAX_FRAME];
    size_t frame_size = board_protocol_encode_frame(
        BOARD_PROTOCOL_VERSION, command, payload, payload_size,
        frame, sizeof(frame));
    if (frame_size) write(frame, frame_size, write_context);
}

static void emit_error(uint8_t command,
                       board_protocol_error_t error,
                       board_protocol_write_fn write,
                       void *write_context) {
    uint8_t payload[2] = {command, error};
    emit_frame(BOARD_COMMAND_ERROR, payload, sizeof(payload),
               write, write_context);
}

static void emit_ack(uint8_t command,
                     board_protocol_write_fn write,
                     void *write_context) {
    emit_frame((uint8_t)(command | 0x80u), NULL, 0, write, write_context);
}

static size_t bounded_string_length(const char *text, size_t maximum) {
    size_t length = 0;
    while (length < maximum && text[length]) ++length;
    return length;
}

static void get_device_info(const board_protocol_t *protocol,
                            board_device_info_t *info) {
    memset(info, 0, sizeof(*info));
    if (protocol->backend.get_info) {
        protocol->backend.get_info(protocol->backend.context, info);
    }
    info->firmware_version[BOARD_PROTOCOL_MAX_FIRMWARE_VERSION] = '\0';
}

static void emit_device_info(const board_protocol_t *protocol,
                             uint8_t command,
                             board_protocol_write_fn write,
                             void *write_context) {
    board_device_info_t info;
    get_device_info(protocol, &info);
    uint8_t payload[26 + BOARD_PROTOCOL_MAX_FIRMWARE_VERSION];
    size_t version_size = bounded_string_length(
        info.firmware_version, BOARD_PROTOCOL_MAX_FIRMWARE_VERSION);
    payload[0] = BOARD_PROTOCOL_VERSION;
    payload[1] = info.target;
    payload[2] = info.model_state;
    write_u16_le(payload + 3, info.nnue_format);
    write_u16_le(payload + 5, info.bucket_count);
    write_u16_le(payload + 7, info.hidden_width);
    write_u32_le(payload + 9, info.maximum_model_bytes);
    write_u32_le(payload + 13, info.active_model_bytes);
    write_u32_le(payload + 17, info.active_model_crc32);
    write_u32_le(payload + 21, info.transposition_table_bytes);
    payload[25] = (uint8_t)version_size;
    memcpy(payload + 26, info.firmware_version, version_size);
    emit_frame((uint8_t)(command | 0x80u), payload, 26 + version_size,
               write, write_context);
}

static void emit_firmware_info(const board_protocol_t *protocol,
                               uint8_t command,
                               board_protocol_write_fn write,
                               void *write_context) {
    board_device_info_t info;
    get_device_info(protocol, &info);
    uint8_t payload[1 + BOARD_PROTOCOL_MAX_FIRMWARE_VERSION];
    size_t version_size = bounded_string_length(
        info.firmware_version, BOARD_PROTOCOL_MAX_FIRMWARE_VERSION);
    payload[0] = (uint8_t)version_size;
    memcpy(payload + 1, info.firmware_version, version_size);
    emit_frame((uint8_t)(command | 0x80u), payload, 1 + version_size,
               write, write_context);
}

static void emit_model_info(const board_protocol_t *protocol,
                            uint8_t command,
                            board_protocol_write_fn write,
                            void *write_context) {
    board_device_info_t info;
    get_device_info(protocol, &info);
    uint8_t payload[19];
    payload[0] = info.model_state;
    write_u32_le(payload + 1, info.active_model_bytes);
    write_u32_le(payload + 5, info.active_model_crc32);
    write_u32_le(payload + 9, info.maximum_model_bytes);
    write_u16_le(payload + 13, info.nnue_format);
    write_u16_le(payload + 15, info.bucket_count);
    write_u16_le(payload + 17, info.hidden_width);
    emit_frame((uint8_t)(command | 0x80u), payload, sizeof(payload),
               write, write_context);
}

static void emit_search_result(const board_search_result_t *result,
                               uint8_t command,
                               board_protocol_write_fn write,
                               void *write_context) {
    uint8_t payload[29] = {0};
    size_t move_size = bounded_string_length(result->best_move, 5);
    payload[0] = (uint8_t)move_size;
    memcpy(payload + 1, result->best_move, move_size);
    write_u32_le(payload + 6, (uint32_t)result->score);
    write_u16_le(payload + 10, result->depth);
    write_u64_le(payload + 12, result->nodes);
    write_u32_le(payload + 20, result->elapsed_ms);
    payload[24] = result->model_state;
    write_u32_le(payload + 25, result->model_crc32);
    emit_frame((uint8_t)(command | 0x80u), payload, sizeof(payload),
               write, write_context);
}

static void handle_frame(board_protocol_t *protocol,
                         uint8_t command,
                         const uint8_t *payload,
                         size_t payload_size,
                         board_protocol_write_fn write,
                         void *write_context) {
    board_protocol_error_t error = BOARD_ERROR_NONE;
    switch (command) {
        case BOARD_COMMAND_HELLO: {
            if (payload_size) {
                emit_error(command, BOARD_ERROR_INVALID_PAYLOAD,
                           write, write_context);
                return;
            }
            uint8_t version = BOARD_PROTOCOL_VERSION;
            emit_frame((uint8_t)(command | 0x80u), &version, 1,
                       write, write_context);
            return;
        }
        case BOARD_COMMAND_DEVICE_INFO:
            if (payload_size) break;
            emit_device_info(protocol, command, write, write_context);
            return;
        case BOARD_COMMAND_FIRMWARE_INFO:
            if (payload_size) break;
            emit_firmware_info(protocol, command, write, write_context);
            return;
        case BOARD_COMMAND_MODEL_INFO:
            if (payload_size) break;
            emit_model_info(protocol, command, write, write_context);
            return;
        case BOARD_COMMAND_MODEL_BEGIN:
            if (payload_size != 8 || !protocol->backend.model_begin) break;
            error = protocol->backend.model_begin(
                protocol->backend.context,
                read_u32_le(payload), read_u32_le(payload + 4));
            if (!error) emit_ack(command, write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        case BOARD_COMMAND_MODEL_CHUNK:
            if (payload_size <= 4 || !protocol->backend.model_chunk) break;
            error = protocol->backend.model_chunk(
                protocol->backend.context, read_u32_le(payload),
                payload + 4, payload_size - 4);
            if (!error) emit_ack(command, write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        case BOARD_COMMAND_MODEL_COMMIT:
            if (payload_size || !protocol->backend.model_commit) break;
            error = protocol->backend.model_commit(protocol->backend.context);
            if (!error) emit_ack(command, write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        case BOARD_COMMAND_POSITION: {
            if (!payload_size || payload_size > BOARD_PROTOCOL_MAX_FEN ||
                !protocol->backend.set_position) break;
            char fen[BOARD_PROTOCOL_MAX_FEN + 1];
            memcpy(fen, payload, payload_size);
            fen[payload_size] = '\0';
            error = protocol->backend.set_position(
                protocol->backend.context, fen);
            if (!error) emit_ack(command, write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        }
        case BOARD_COMMAND_GO: {
            if (payload_size != 5 || !protocol->backend.search) break;
            uint8_t budget_type = payload[0];
            uint32_t budget = read_u32_le(payload + 1);
            if (!budget ||
                (budget_type == BOARD_GO_DEPTH &&
                 budget > BOARD_PROTOCOL_MAX_DEPTH) ||
                (budget_type == BOARD_GO_TIME_MS &&
                 budget > BOARD_PROTOCOL_MAX_TIME_MS) ||
                (budget_type != BOARD_GO_DEPTH &&
                 budget_type != BOARD_GO_TIME_MS)) break;
            board_search_result_t result;
            memset(&result, 0, sizeof(result));
            error = protocol->backend.search(
                protocol->backend.context, budget_type, budget, &result);
            if (!error) emit_search_result(&result, command,
                                           write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        }
        case BOARD_COMMAND_BENCH: {
            if (payload_size || !protocol->backend.benchmark) break;
            board_search_result_t result;
            memset(&result, 0, sizeof(result));
            error = protocol->backend.benchmark(
                protocol->backend.context, &result);
            if (!error) emit_search_result(&result, command,
                                           write, write_context);
            else emit_error(command, error, write, write_context);
            return;
        }
        default:
            emit_error(command, BOARD_ERROR_UNKNOWN_COMMAND,
                       write, write_context);
            return;
    }
    emit_error(command, BOARD_ERROR_INVALID_PAYLOAD, write, write_context);
}

static void reset_parser(board_protocol_t *protocol) {
    protocol->frame_size = 0;
    protocol->expected_size = 0;
}

static void accept_sync_byte(board_protocol_t *protocol, uint8_t byte) {
    if (!protocol->frame_size) {
        if (byte == BOARD_PROTOCOL_MAGIC_FIRST) {
            protocol->frame[0] = byte;
            protocol->frame_size = 1;
        }
        return;
    }
    if (protocol->frame_size == 1) {
        if (byte == BOARD_PROTOCOL_MAGIC_SECOND) {
            protocol->frame[1] = byte;
            protocol->frame_size = 2;
        } else if (byte != BOARD_PROTOCOL_MAGIC_FIRST) {
            reset_parser(protocol);
        }
    }
}

void board_protocol_feed(board_protocol_t *protocol,
                         const uint8_t *data,
                         size_t size,
                         board_protocol_write_fn write,
                         void *write_context) {
    if (!protocol || (size && !data)) return;
    for (size_t i = 0; i < size; ++i) {
        uint8_t byte = data[i];
        if (protocol->frame_size < 2) {
            accept_sync_byte(protocol, byte);
            continue;
        }
        protocol->frame[protocol->frame_size++] = byte;
        if (protocol->frame_size == BOARD_PROTOCOL_HEADER_SIZE) {
            size_t payload_size = read_u16_le(protocol->frame + 4);
            if (payload_size > BOARD_PROTOCOL_MAX_PAYLOAD) {
                emit_error(protocol->frame[3], BOARD_ERROR_LENGTH,
                           write, write_context);
                reset_parser(protocol);
                continue;
            }
            protocol->expected_size = BOARD_PROTOCOL_HEADER_SIZE +
                                      payload_size + BOARD_PROTOCOL_CRC_SIZE;
        }
        if (!protocol->expected_size ||
            protocol->frame_size < protocol->expected_size) continue;

        size_t payload_size = read_u16_le(protocol->frame + 4);
        uint32_t expected_crc = read_u32_le(
            protocol->frame + BOARD_PROTOCOL_HEADER_SIZE + payload_size);
        uint32_t actual_crc = board_protocol_crc32(
            protocol->frame + 2, 4 + payload_size);
        uint8_t version = protocol->frame[2];
        uint8_t command = protocol->frame[3];
        if (actual_crc != expected_crc) {
            emit_error(command, BOARD_ERROR_CHECKSUM, write, write_context);
        } else if (version != BOARD_PROTOCOL_VERSION) {
            emit_error(command, BOARD_ERROR_VERSION, write, write_context);
        } else {
            handle_frame(protocol, command,
                         protocol->frame + BOARD_PROTOCOL_HEADER_SIZE,
                         payload_size, write, write_context);
        }
        reset_parser(protocol);
    }
}
