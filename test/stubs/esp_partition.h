#ifndef P4_TEST_ESP_PARTITION_H
#define P4_TEST_ESP_PARTITION_H
#include <stddef.h>
#include <stdint.h>

typedef struct { size_t size; } esp_partition_t;
typedef unsigned esp_partition_mmap_handle_t;
enum { ESP_OK, ESP_FAIL, ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, ESP_PARTITION_MMAP_DATA };
const esp_partition_t *esp_partition_find_first(int type, int subtype, const char *label);
int esp_partition_read(const esp_partition_t *partition, size_t offset, void *data, size_t size);
int esp_partition_write(const esp_partition_t *partition, size_t offset, const void *data, size_t size);
int esp_partition_erase_range(const esp_partition_t *partition, size_t offset, size_t size);
int esp_partition_mmap(const esp_partition_t *partition, size_t offset, size_t size, int type, const void **data, esp_partition_mmap_handle_t *handle);
void esp_partition_munmap(esp_partition_mmap_handle_t handle);
#endif
