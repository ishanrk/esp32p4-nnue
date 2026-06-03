#include "protocol.h"

#include <stdbool.h>
#include <stdio.h>
#include <string.h>

typedef struct {
    uint8_t data[BOARD_PROTOCOL_MAX_FRAME * 4];
    size_t size;
} output_t;

typedef struct {
    board_device_info_t info;
    uint8_t model[64];
    board_model_upload_t upload;
    bool position_valid;
} mock_device_t;

static int failures;

static void expect_true(const char *name, bool condition) {
    if (condition) return;
    fprintf(stderr, "fail %s\n", name);
    ++failures;
}

static uint16_t read_u16_le(const uint8_t *data) {
    return (uint16_t)((uint16_t)data[0] | (uint16_t)((uint16_t)data[1] << 8));
}

static uint32_t read_u32_le(const uint8_t *data) {
    return (uint32_t)data[0] |
           (uint32_t)data[1] << 8 |
           (uint32_t)data[2] << 16 |
           (uint32_t)data[3] << 24;
}

static uint64_t read_u64_le(const uint8_t *data) {
    uint64_t value = 0;
    for (int i = 0; i < 8; ++i) value |= (uint64_t)data[i] << (8 * i);
    return value;
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

static void collect_output(const uint8_t *data, size_t size, void *context) {
    output_t *output = context;
    expect_true("output capacity", output->size + size <= sizeof(output->data));
    if (output->size + size > sizeof(output->data)) return;
    memcpy(output->data + output->size, data, size);
    output->size += size;
}

static void clear_output(output_t *output) {
    output->size = 0;
}

static size_t response_size(const output_t *output, size_t offset) {
    if (output->size - offset < BOARD_PROTOCOL_HEADER_SIZE) return 0;
    return BOARD_PROTOCOL_HEADER_SIZE + read_u16_le(output->data + offset + 4) +
           BOARD_PROTOCOL_CRC_SIZE;
}

static const uint8_t *expect_response(const char *name,
                                      const output_t *output,
                                      size_t offset,
                                      uint8_t command,
                                      size_t payload_size) {
    size_t size = response_size(output, offset);
    expect_true(name, size == BOARD_PROTOCOL_HEADER_SIZE + payload_size +
                             BOARD_PROTOCOL_CRC_SIZE);
    if (!size || offset + size > output->size) return NULL;
    const uint8_t *frame = output->data + offset;
    expect_true("response first magic", frame[0] == BOARD_PROTOCOL_MAGIC_FIRST);
    expect_true("response second magic", frame[1] == BOARD_PROTOCOL_MAGIC_SECOND);
    expect_true("response version", frame[2] == BOARD_PROTOCOL_VERSION);
    expect_true("response command", frame[3] == command);
    expect_true("response payload size", read_u16_le(frame + 4) == payload_size);
    expect_true("response crc",
                read_u32_le(frame + BOARD_PROTOCOL_HEADER_SIZE + payload_size) ==
                    board_protocol_crc32(frame + 2, 4 + payload_size));
    return frame + BOARD_PROTOCOL_HEADER_SIZE;
}

static void expect_error(const char *name,
                         const output_t *output,
                         uint8_t command,
                         uint8_t error) {
    const uint8_t *payload = expect_response(
        name, output, 0, BOARD_COMMAND_ERROR, 2);
    if (!payload) return;
    expect_true("error command", payload[0] == command);
    expect_true("error code", payload[1] == error);
}

static void get_info(void *context, board_device_info_t *info) {
    mock_device_t *device = context;
    *info = device->info;
}

static board_protocol_error_t model_begin(void *context,
                                          uint32_t model_bytes,
                                          uint32_t model_crc32) {
    mock_device_t *device = context;
    board_protocol_error_t error = board_model_upload_begin(
        &device->upload, model_bytes, model_crc32,
        sizeof(device->model), 0);
    if (error) return error;
    memset(device->model, 0, sizeof(device->model));
    device->info.model_state = BOARD_MODEL_EMBEDDED;
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t model_chunk(void *context,
                                          uint32_t offset,
                                          const uint8_t *data,
                                          size_t size) {
    mock_device_t *device = context;
    board_protocol_error_t error = board_model_upload_accept(
        &device->upload, offset, data, size);
    if (error) return error;
    memcpy(device->model + offset, data, size);
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t model_commit(void *context) {
    static const uint8_t magic[8] = {'P', '4', 'N', 'N', 'U', 'E', '1', 0};
    mock_device_t *device = context;
    board_protocol_error_t error = board_model_upload_finish(&device->upload);
    if (error) return error;
    if (device->upload.expected_bytes < sizeof(magic) ||
        memcmp(device->model, magic, sizeof(magic))) {
        return BOARD_ERROR_MODEL_INVALID;
    }
    device->info.model_state = BOARD_MODEL_UPLOADED;
    device->info.active_model_bytes = device->upload.expected_bytes;
    device->info.active_model_crc32 = device->upload.expected_crc32;
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t set_position(void *context, const char *fen) {
    mock_device_t *device = context;
    if (!strcmp(fen, "invalid")) return BOARD_ERROR_POSITION_INVALID;
    device->position_valid = true;
    return BOARD_ERROR_NONE;
}

static void fill_result(mock_device_t *device,
                        board_search_result_t *result,
                        uint16_t depth) {
    memcpy(result->best_move, "e2e4", 5);
    result->score = -37;
    result->depth = depth;
    result->nodes = 123456;
    result->elapsed_ms = 42;
    result->model_state = device->info.model_state;
    result->model_crc32 = device->info.active_model_crc32;
}

static board_protocol_error_t search(void *context,
                                     uint8_t budget_type,
                                     uint32_t budget,
                                     board_search_result_t *result) {
    mock_device_t *device = context;
    if (!device->position_valid) return BOARD_ERROR_POSITION_REQUIRED;
    fill_result(device, result,
                budget_type == BOARD_GO_DEPTH ? (uint16_t)budget : 5);
    return BOARD_ERROR_NONE;
}

static board_protocol_error_t benchmark(void *context,
                                        board_search_result_t *result) {
    mock_device_t *device = context;
    fill_result(device, result, 5);
    return BOARD_ERROR_NONE;
}

static board_protocol_backend_t make_backend(mock_device_t *device) {
    board_protocol_backend_t backend = {
        .context = device,
        .get_info = get_info,
        .model_begin = model_begin,
        .model_chunk = model_chunk,
        .model_commit = model_commit,
        .set_position = set_position,
        .search = search,
        .benchmark = benchmark,
    };
    return backend;
}

static size_t encode_request(uint8_t version,
                             uint8_t command,
                             const uint8_t *payload,
                             size_t payload_size,
                             uint8_t frame[BOARD_PROTOCOL_MAX_FRAME]) {
    size_t size = board_protocol_encode_frame(
        version, command, payload, payload_size,
        frame, BOARD_PROTOCOL_MAX_FRAME);
    expect_true("request encoded", size != 0);
    return size;
}

static void send_request(board_protocol_t *protocol,
                         output_t *output,
                         uint8_t command,
                         const uint8_t *payload,
                         size_t payload_size) {
    uint8_t frame[BOARD_PROTOCOL_MAX_FRAME];
    size_t size = encode_request(
        BOARD_PROTOCOL_VERSION, command, payload, payload_size, frame);
    board_protocol_feed(protocol, frame, size, collect_output, output);
}

static void test_frames(board_protocol_t *protocol, output_t *output) {
    uint8_t frame[BOARD_PROTOCOL_MAX_FRAME];
    size_t size = encode_request(
        BOARD_PROTOCOL_VERSION, BOARD_COMMAND_HELLO, NULL, 0, frame);
    for (size_t i = 0; i < size; ++i) {
        board_protocol_feed(protocol, frame + i, 1, collect_output, output);
    }
    const uint8_t *payload = expect_response(
        "partial frame", output, 0, BOARD_COMMAND_HELLO | 0x80u, 1);
    if (payload) expect_true("hello version", payload[0] == BOARD_PROTOCOL_VERSION);

    clear_output(output);
    uint8_t multiple[BOARD_PROTOCOL_MAX_FRAME * 2];
    memcpy(multiple, frame, size);
    memcpy(multiple + size, frame, size);
    board_protocol_feed(protocol, multiple, size * 2, collect_output, output);
    size_t first_size = response_size(output, 0);
    expect_response("first multiple frame", output, 0,
                    BOARD_COMMAND_HELLO | 0x80u, 1);
    expect_response("second multiple frame", output, first_size,
                    BOARD_COMMAND_HELLO | 0x80u, 1);
    expect_true("multiple response size",
                first_size + response_size(output, first_size) == output->size);

    clear_output(output);
    size = encode_request(2, BOARD_COMMAND_HELLO, NULL, 0, frame);
    board_protocol_feed(protocol, frame, size, collect_output, output);
    expect_error("bad version", output, BOARD_COMMAND_HELLO,
                 BOARD_ERROR_VERSION);

    clear_output(output);
    size = encode_request(
        BOARD_PROTOCOL_VERSION, BOARD_COMMAND_HELLO, NULL, 0, frame);
    frame[size - 1] ^= 1u;
    board_protocol_feed(protocol, frame, size, collect_output, output);
    expect_error("bad checksum", output, BOARD_COMMAND_HELLO,
                 BOARD_ERROR_CHECKSUM);

    clear_output(output);
    uint8_t bad_length[BOARD_PROTOCOL_HEADER_SIZE] = {
        BOARD_PROTOCOL_MAGIC_FIRST, BOARD_PROTOCOL_MAGIC_SECOND,
        BOARD_PROTOCOL_VERSION, BOARD_COMMAND_HELLO, 0, 0
    };
    write_u16_le(bad_length + 4, BOARD_PROTOCOL_MAX_PAYLOAD + 1);
    board_protocol_feed(protocol, bad_length, sizeof(bad_length),
                        collect_output, output);
    expect_error("bad length", output, BOARD_COMMAND_HELLO,
                 BOARD_ERROR_LENGTH);

    clear_output(output);
    send_request(protocol, output, 0x55, NULL, 0);
    expect_error("unknown command", output, 0x55,
                 BOARD_ERROR_UNKNOWN_COMMAND);
}

static void test_info(board_protocol_t *protocol, output_t *output) {
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_DEVICE_INFO, NULL, 0);
    const uint8_t *payload = expect_response(
        "device info", output, 0, BOARD_COMMAND_DEVICE_INFO | 0x80u, 34);
    if (!payload) return;
    expect_true("device protocol", payload[0] == BOARD_PROTOCOL_VERSION);
    expect_true("device target", payload[1] == BOARD_TARGET_ESP32_P4);
    expect_true("device model", payload[2] == BOARD_MODEL_EMBEDDED);
    expect_true("device format", read_u16_le(payload + 3) == 3);
    expect_true("device buckets", read_u16_le(payload + 5) == 4);
    expect_true("device width", read_u16_le(payload + 7) == 128);
    expect_true("device max model", read_u32_le(payload + 9) == 64);
    expect_true("device tt", read_u32_le(payload + 21) == 262144);
    expect_true("firmware text", payload[25] == 8 &&
                !memcmp(payload + 26, "test-1.0", 8));
}

static void begin_upload(board_protocol_t *protocol,
                         output_t *output,
                         const uint8_t *model,
                         size_t size) {
    uint8_t payload[8];
    write_u32_le(payload, (uint32_t)size);
    write_u32_le(payload + 4, board_protocol_crc32(model, size));
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_BEGIN,
                 payload, sizeof(payload));
    expect_response("model begin", output, 0,
                    BOARD_COMMAND_MODEL_BEGIN | 0x80u, 0);
}

static void send_chunk(board_protocol_t *protocol,
                       output_t *output,
                       uint32_t offset,
                       const uint8_t *data,
                       size_t size) {
    uint8_t payload[4 + 64];
    write_u32_le(payload, offset);
    memcpy(payload + 4, data, size);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_CHUNK,
                 payload, 4 + size);
}

static void test_model_upload(board_protocol_t *protocol, output_t *output) {
    static const uint8_t valid_model[12] = {
        'P', '4', 'N', 'N', 'U', 'E', '1', 0, 1, 2, 3, 4
    };
    uint8_t begin[8];
    write_u32_le(begin, 65);
    write_u32_le(begin + 4, 0);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_BEGIN,
                 begin, sizeof(begin));
    expect_error("oversized model", output, BOARD_COMMAND_MODEL_BEGIN,
                 BOARD_ERROR_MODEL_TOO_LARGE);

    begin_upload(protocol, output, valid_model, sizeof(valid_model));
    uint8_t out_of_range[13] = {0};
    send_chunk(protocol, output, 0, out_of_range, sizeof(out_of_range));
    expect_error("out of range model chunk", output,
                 BOARD_COMMAND_MODEL_CHUNK, BOARD_ERROR_MODEL_SEQUENCE);
    send_chunk(protocol, output, 1, valid_model, 4);
    expect_error("bad model offset", output, BOARD_COMMAND_MODEL_CHUNK,
                 BOARD_ERROR_MODEL_SEQUENCE);

    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_COMMIT, NULL, 0);
    expect_error("incomplete commit", output, BOARD_COMMAND_MODEL_COMMIT,
                 BOARD_ERROR_MODEL_INCOMPLETE);

    uint8_t wrong_checksum[8];
    write_u32_le(wrong_checksum, sizeof(valid_model));
    write_u32_le(wrong_checksum + 4,
                 board_protocol_crc32(valid_model, sizeof(valid_model)) ^ 1u);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_BEGIN,
                 wrong_checksum, sizeof(wrong_checksum));
    send_chunk(protocol, output, 0, valid_model, sizeof(valid_model));
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_COMMIT, NULL, 0);
    expect_error("model checksum", output, BOARD_COMMAND_MODEL_COMMIT,
                 BOARD_ERROR_CHECKSUM);

    static const uint8_t invalid_model[8] = {
        'n', 'o', 't', 'n', 'n', 'u', 'e', 0
    };
    begin_upload(protocol, output, invalid_model, sizeof(invalid_model));
    send_chunk(protocol, output, 0, invalid_model, sizeof(invalid_model));
    expect_response("invalid model chunk", output, 0,
                    BOARD_COMMAND_MODEL_CHUNK | 0x80u, 0);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_COMMIT, NULL, 0);
    expect_error("invalid model header", output, BOARD_COMMAND_MODEL_COMMIT,
                 BOARD_ERROR_MODEL_INVALID);

    begin_upload(protocol, output, valid_model, sizeof(valid_model));
    send_chunk(protocol, output, 0, valid_model, 6);
    expect_response("first valid chunk", output, 0,
                    BOARD_COMMAND_MODEL_CHUNK | 0x80u, 0);
    send_chunk(protocol, output, 0, valid_model, 6);
    expect_error("overlapping model chunk", output,
                 BOARD_COMMAND_MODEL_CHUNK, BOARD_ERROR_MODEL_SEQUENCE);
    send_chunk(protocol, output, 6, valid_model + 6, sizeof(valid_model) - 6);
    expect_response("second valid chunk", output, 0,
                    BOARD_COMMAND_MODEL_CHUNK | 0x80u, 0);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_MODEL_COMMIT, NULL, 0);
    expect_response("valid model commit", output, 0,
                    BOARD_COMMAND_MODEL_COMMIT | 0x80u, 0);
}

static void test_position_and_search(board_protocol_t *protocol,
                                     output_t *output) {
    uint8_t go[5] = {BOARD_GO_DEPTH, 0, 0, 0, 0};
    write_u32_le(go + 1, 5);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_GO, go, sizeof(go));
    expect_error("search before position", output, BOARD_COMMAND_GO,
                 BOARD_ERROR_POSITION_REQUIRED);

    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_POSITION,
                 (const uint8_t *)"invalid", 7);
    expect_error("invalid position", output, BOARD_COMMAND_POSITION,
                 BOARD_ERROR_POSITION_INVALID);

    const char *fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_POSITION,
                 (const uint8_t *)fen, strlen(fen));
    expect_response("valid position", output, 0,
                    BOARD_COMMAND_POSITION | 0x80u, 0);

    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_GO, go, sizeof(go));
    const uint8_t *payload = expect_response(
        "search result", output, 0, BOARD_COMMAND_GO | 0x80u, 29);
    if (payload) {
        expect_true("result move", payload[0] == 4 &&
                    !memcmp(payload + 1, "e2e4", 4));
        expect_true("result score", (int32_t)read_u32_le(payload + 6) == -37);
        expect_true("result depth", read_u16_le(payload + 10) == 5);
        expect_true("result nodes", read_u64_le(payload + 12) == 123456);
        expect_true("result time", read_u32_le(payload + 20) == 42);
        expect_true("result model", payload[24] == BOARD_MODEL_UPLOADED);
    }

    go[0] = BOARD_GO_TIME_MS;
    write_u32_le(go + 1, 100);
    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_GO, go, sizeof(go));
    expect_response("timed result", output, 0,
                    BOARD_COMMAND_GO | 0x80u, 29);

    clear_output(output);
    send_request(protocol, output, BOARD_COMMAND_BENCH, NULL, 0);
    expect_response("bench result", output, 0,
                    BOARD_COMMAND_BENCH | 0x80u, 29);
}

int main(void) {
    mock_device_t device;
    memset(&device, 0, sizeof(device));
    device.info.target = BOARD_TARGET_ESP32_P4;
    device.info.model_state = BOARD_MODEL_EMBEDDED;
    device.info.nnue_format = 3;
    device.info.bucket_count = 4;
    device.info.hidden_width = 128;
    device.info.maximum_model_bytes = sizeof(device.model);
    device.info.active_model_bytes = 12;
    device.info.active_model_crc32 = UINT32_C(0x12345678);
    device.info.transposition_table_bytes = 262144;
    memcpy(device.info.firmware_version, "test-1.0", 9);

    board_protocol_backend_t backend = make_backend(&device);
    board_protocol_t protocol;
    board_protocol_init(&protocol, &backend);
    output_t output = {0};

    test_frames(&protocol, &output);
    test_info(&protocol, &output);
    test_model_upload(&protocol, &output);
    test_position_and_search(&protocol, &output);

    if (failures) {
        fprintf(stderr, "%d protocol tests failed\n", failures);
        return 1;
    }
    puts("protocol tests passed");
    return 0;
}
