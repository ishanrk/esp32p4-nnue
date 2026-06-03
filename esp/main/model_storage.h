#ifndef P4_MODEL_STORAGE_H
#define P4_MODEL_STORAGE_H

#include "esp_partition.h"
#include "protocol.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum {
    MODEL_STORAGE_METADATA_BYTES = 0x1000,
    MODEL_STORAGE_PARTITION_BYTES = 0x52000
};

typedef struct {
    const esp_partition_t *partition;
    const uint8_t *fallback_model;
    size_t fallback_bytes;
    const uint8_t *mapped_model;
    esp_partition_mmap_handle_t map_handle;
    board_model_upload_t upload;
    uint32_t fallback_crc32;
    uint32_t active_crc32;
    uint8_t active_state;
    bool mapped;
} model_storage_t;

bool model_storage_init(model_storage_t *storage,
                        const void *fallback_model,
                        size_t fallback_bytes);
void model_storage_deinit(model_storage_t *storage);
board_protocol_error_t model_storage_begin(model_storage_t *storage,
                                           uint32_t model_bytes,
                                           uint32_t model_crc32);
board_protocol_error_t model_storage_chunk(model_storage_t *storage,
                                           uint32_t offset,
                                           const uint8_t *data,
                                           size_t size);
board_protocol_error_t model_storage_commit(model_storage_t *storage);

#endif
