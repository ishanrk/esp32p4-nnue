#include "model_storage.h"

#include "ch.h"

#include <string.h>

enum {
    MODEL_METADATA_VERSION = 1,
    MODEL_METADATA_SIZE = 20,
    MODEL_DATA_OFFSET = MODEL_STORAGE_METADATA_BYTES
};

static const uint8_t model_metadata_magic[8] = {
    'P', '4', 'M', 'O', 'D', 'E', 'L', '1'
};

_Static_assert(NNUE_FILE_SIZE <=
               MODEL_STORAGE_PARTITION_BYTES - MODEL_DATA_OFFSET,
               "nnue partition capacity");

static uint32_t read_u32_le(const uint8_t *data) {
    return (uint32_t)data[0] |
           (uint32_t)data[1] << 8 |
           (uint32_t)data[2] << 16 |
           (uint32_t)data[3] << 24;
}

static void write_u32_le(uint8_t *data, uint32_t value) {
    data[0] = (uint8_t)value;
    data[1] = (uint8_t)(value >> 8);
    data[2] = (uint8_t)(value >> 16);
    data[3] = (uint8_t)(value >> 24);
}

static void unmap_model(model_storage_t *storage) {
    if (storage->mapped) esp_partition_munmap(storage->map_handle);
    storage->mapped_model = NULL;
    storage->map_handle = 0;
    storage->mapped = false;
}

static bool activate_fallback(model_storage_t *storage) {
    if (!bind_nnue(storage->fallback_model, storage->fallback_bytes)) {
        return false;
    }
    unmap_model(storage);
    storage->active_state = BOARD_MODEL_EMBEDDED;
    storage->active_crc32 = storage->fallback_crc32;
    return true;
}

static bool map_uploaded_model(model_storage_t *storage,
                               const uint8_t **model,
                               esp_partition_mmap_handle_t *handle) {
    const void *mapped = NULL;
    if (!storage->partition ||
        esp_partition_mmap(storage->partition, MODEL_DATA_OFFSET,
                           NNUE_FILE_SIZE, ESP_PARTITION_MMAP_DATA,
                           &mapped, handle) != ESP_OK) return false;
    *model = mapped;
    return true;
}

static bool load_committed_model(model_storage_t *storage) {
    uint8_t metadata[MODEL_METADATA_SIZE];
    if (!storage->partition ||
        esp_partition_read(storage->partition, 0, metadata,
                           sizeof(metadata)) != ESP_OK ||
        memcmp(metadata, model_metadata_magic, sizeof(model_metadata_magic)) ||
        read_u32_le(metadata + 8) != MODEL_METADATA_VERSION ||
        read_u32_le(metadata + 12) != NNUE_FILE_SIZE) return false;

    uint32_t expected_crc32 = read_u32_le(metadata + 16);
    const uint8_t *model;
    esp_partition_mmap_handle_t handle;
    if (!map_uploaded_model(storage, &model, &handle)) return false;
    if (board_protocol_crc32(model, NNUE_FILE_SIZE) != expected_crc32 ||
        !validate_nnue(model, NNUE_FILE_SIZE) ||
        !bind_nnue(model, NNUE_FILE_SIZE)) {
        esp_partition_munmap(handle);
        return false;
    }
    storage->mapped_model = model;
    storage->map_handle = handle;
    storage->mapped = true;
    storage->active_state = BOARD_MODEL_UPLOADED;
    storage->active_crc32 = expected_crc32;
    return true;
}

bool model_storage_init(model_storage_t *storage,
                        const void *fallback_model,
                        size_t fallback_bytes) {
    memset(storage, 0, sizeof(*storage));
    if (!validate_nnue(fallback_model, fallback_bytes)) return false;
    storage->fallback_model = fallback_model;
    storage->fallback_bytes = fallback_bytes;
    storage->fallback_crc32 = board_protocol_crc32(
        fallback_model, fallback_bytes);
    storage->partition = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "nnue");
    if (storage->partition &&
        storage->partition->size >= MODEL_STORAGE_PARTITION_BYTES &&
        load_committed_model(storage)) return true;
    return activate_fallback(storage);
}

void model_storage_deinit(model_storage_t *storage) {
    unmap_model(storage);
    memset(storage, 0, sizeof(*storage));
}

board_protocol_error_t model_storage_begin(model_storage_t *storage,
                                           uint32_t model_bytes,
                                           uint32_t model_crc32) {
    board_protocol_error_t error = board_model_upload_begin(
        &storage->upload, model_bytes, model_crc32,
        NNUE_FILE_SIZE, NNUE_FILE_SIZE);
    if (error) return error;
    if (!storage->partition ||
        storage->partition->size < MODEL_STORAGE_PARTITION_BYTES) {
        board_model_upload_cancel(&storage->upload);
        return BOARD_ERROR_STORAGE;
    }
    if (!activate_fallback(storage)) {
        board_model_upload_cancel(&storage->upload);
        return BOARD_ERROR_STORAGE;
    }
    if (esp_partition_erase_range(storage->partition, 0,
                                  MODEL_STORAGE_PARTITION_BYTES) != ESP_OK) {
        board_model_upload_cancel(&storage->upload);
        return BOARD_ERROR_STORAGE;
    }
    return BOARD_ERROR_NONE;
}

board_protocol_error_t model_storage_chunk(model_storage_t *storage,
                                           uint32_t offset,
                                           const uint8_t *data,
                                           size_t size) {
    board_protocol_error_t error = board_model_upload_accept(
        &storage->upload, offset, data, size);
    if (error) return error;
    if (esp_partition_write(storage->partition,
                            MODEL_DATA_OFFSET + offset,
                            data, size) != ESP_OK) {
        board_model_upload_cancel(&storage->upload);
        return BOARD_ERROR_STORAGE;
    }
    return BOARD_ERROR_NONE;
}

board_protocol_error_t model_storage_commit(model_storage_t *storage) {
    board_protocol_error_t error = board_model_upload_finish(&storage->upload);
    if (error) return error;

    const uint8_t *model;
    esp_partition_mmap_handle_t handle;
    if (!map_uploaded_model(storage, &model, &handle)) {
        return BOARD_ERROR_STORAGE;
    }
    if (!validate_nnue(model, storage->upload.expected_bytes)) {
        esp_partition_munmap(handle);
        return BOARD_ERROR_MODEL_INVALID;
    }

    uint8_t metadata[MODEL_METADATA_SIZE] = {0};
    memcpy(metadata, model_metadata_magic, sizeof(model_metadata_magic));
    write_u32_le(metadata + 8, MODEL_METADATA_VERSION);
    write_u32_le(metadata + 12, storage->upload.expected_bytes);
    write_u32_le(metadata + 16, storage->upload.expected_crc32);
    if (esp_partition_write(storage->partition, 8,
                            metadata + 8, sizeof(metadata) - 8) != ESP_OK) {
        esp_partition_munmap(handle);
        return BOARD_ERROR_STORAGE;
    }
    // write validity marker last
    if (esp_partition_write(storage->partition, 0, metadata, 8) != ESP_OK ||
        !bind_nnue(model, storage->upload.expected_bytes)) {
        esp_partition_munmap(handle);
        return BOARD_ERROR_STORAGE;
    }
    storage->mapped_model = model;
    storage->map_handle = handle;
    storage->mapped = true;
    storage->active_state = BOARD_MODEL_UPLOADED;
    storage->active_crc32 = storage->upload.expected_crc32;
    return BOARD_ERROR_NONE;
}
