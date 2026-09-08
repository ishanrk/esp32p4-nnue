#include "ch.h"
#include "model_storage.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static esp_partition_t partition = {MODEL_STORAGE_PARTITION_BYTES};
static _Alignas(int16_t) uint8_t flash[MODEL_STORAGE_PARTITION_BYTES];
static bool fail_erase;
static bool fail_write;
static size_t fail_offset = SIZE_MAX;
static bool fail_map;
static bool corrupt_at_activation;
static unsigned mappings;


const esp_partition_t *esp_partition_find_first(int type, int subtype, const char *label) {
	(void)type; (void)subtype; (void)label;
	return &partition;
}


int esp_partition_read(const esp_partition_t *part, size_t offset, void *data, size_t size) {
	if (offset > part->size || size > part->size - offset) return ESP_FAIL;
	memcpy(data, flash + offset, size);
	return ESP_OK;
}


int esp_partition_write(const esp_partition_t *part, size_t offset, const void *data, size_t size) {
	if (fail_write || offset == fail_offset || offset > part->size || size > part->size - offset) return ESP_FAIL;
	memcpy(flash + offset, data, size);
	if (offset == 0 && corrupt_at_activation) flash[MODEL_STORAGE_METADATA_BYTES] ^= 1;
	return ESP_OK;
}


int esp_partition_erase_range(const esp_partition_t *part, size_t offset, size_t size) {
	if (fail_erase || mappings || offset > part->size || size > part->size - offset) return ESP_FAIL;
	memset(flash + offset, 0xff, size);
	return ESP_OK;
}


int esp_partition_mmap(const esp_partition_t *part, size_t offset, size_t size, int type, const void **data, esp_partition_mmap_handle_t *handle) {
	(void)type;
	if (fail_map || offset > part->size || size > part->size - offset) return ESP_FAIL;
	*data = flash + offset;
	*handle = ++mappings;
	return ESP_OK;
}


void esp_partition_munmap(esp_partition_mmap_handle_t handle) {
	(void)handle;
	--mappings;
}


static void check(bool ok, const char *name) {
	if (ok) return;
	fprintf(stderr, "%s failed\n", name);
	exit(1);
}


static void write_le(uint8_t *data, uint32_t value, int size) {
	for (int i = 0; i < size; ++i) data[i] = (uint8_t)(value >> (8 * i));
}


static void prepare_upload(model_storage_t *storage, const uint8_t *model) {
	check(!model_storage_begin(storage, NNUE_FILE_SIZE, board_protocol_crc32(model, NNUE_FILE_SIZE)), "upload begin");
	for (uint32_t offset = 0; offset < NNUE_FILE_SIZE;) {
		size_t size = NNUE_FILE_SIZE - offset;
		if (size > BOARD_PROTOCOL_MODEL_CHUNK_BYTES) size = BOARD_PROTOCOL_MODEL_CHUNK_BYTES;
		check(!model_storage_chunk(storage, offset, model + offset, size), "upload chunk");
		offset += (uint32_t)size;
	}
}


int main(void) {
	uint8_t *fallback = calloc(1, NNUE_FILE_SIZE);
	uint8_t *uploaded = malloc(NNUE_FILE_SIZE);
	check(fallback && uploaded, "model allocation");
	memcpy(fallback, NNUE_MAGIC, NNUE_MAGIC_SIZE);
	const uint16_t fields[] = {NNUE_FORMAT_VERSION, NNUE_BUCKET_COUNT, NNUE_FEATURES_PER_BUCKET,
		NNUE_HIDDEN_SIZE, NNUE_ACTIVATION_CLIP, NNUE_FEATURE_QUANTIZATION,
		NNUE_OUTPUT_QUANTIZATION, NNUE_PERSPECTIVE_COUNT};
	for (int i = 0; i < 8; ++i) write_le(fallback + 8 + i * 2, fields[i], 2);
	write_le(fallback + NNUE_FILE_SIZE_OFFSET, NNUE_FILE_SIZE, 4);
	write_le(fallback + NNUE_OUTPUT_BIAS_OFFSET, 100 * 4096, 4);
	memcpy(uploaded, fallback, NNUE_FILE_SIZE);
	write_le(uploaded + NNUE_OUTPUT_BIAS_OFFSET, (uint32_t)(-100 * 4096), 4);
	write_le(uploaded + NNUE_FEATURE_BIAS_OFFSET, 100, 2);
	model_storage_t storage;
	check(model_storage_init(&storage, fallback, NNUE_FILE_SIZE), "storage init");
	prepare_upload(&storage, uploaded);
	check(!model_storage_commit(&storage), "upload commit");
	position_t position;
	set_start_position(&position);
	transposition_table_t table = {0};
	check(resize_transposition_table(&table, 1), "table allocation");
	search_result_t before = search_position(&position, &table, (search_limits_t){.depth = 2, .move_time_ms = 0}, NULL, NULL);
	check(before.score == -100 && position.accumulator[0][0] == 100, "uploaded evaluation");
	uint64_t generation = nnue_generation();
	check(model_storage_begin(&storage, 1, 0) != BOARD_ERROR_NONE, "bad size");
	synchronize_evaluator(&position, &table);
	check(nnue_generation() == generation, "rejected upload preserves evaluator");
	fail_erase = true;
	check(model_storage_begin(&storage, NNUE_FILE_SIZE, 0) == BOARD_ERROR_STORAGE, "erase failure");
	synchronize_evaluator(&position, &table);
	check(storage.active_state == BOARD_MODEL_EMBEDDED && !mappings, "fallback active after error");
	check(position.accumulator[0][0] == 0, "fallback accumulator refreshed");
	for (size_t i = 0; i < table.count; ++i) check(!table.entries[i].key, "fallback table cleared");
	search_result_t after = search_position(&position, &table, (search_limits_t){.depth = 2, .move_time_ms = 0}, NULL, NULL);
	check(after.score == 100, "fallback search");
	fail_erase = false;
	prepare_upload(&storage, uploaded);
	fail_write = true;
	check(model_storage_commit(&storage) == BOARD_ERROR_STORAGE, "metadata failure");
	check(storage.active_state == BOARD_MODEL_EMBEDDED && !mappings, "failed commit preserves fallback");
	unload_nnue();
	model_storage_deinit(&storage);
	check(model_storage_init(&storage, fallback, NNUE_FILE_SIZE), "restart after failed commit");
	check(storage.active_state == BOARD_MODEL_EMBEDDED, "restart fallback");
	fail_write = false;
	check(!model_storage_begin(&storage, NNUE_FILE_SIZE, board_protocol_crc32(uploaded, NNUE_FILE_SIZE)), "chunk fault begin");
	fail_offset = MODEL_STORAGE_METADATA_BYTES;
	check(model_storage_chunk(&storage, 0, uploaded, 100) == BOARD_ERROR_STORAGE, "chunk write fault");
	check(!storage.upload.active && storage.active_state == BOARD_MODEL_EMBEDDED, "chunk fault fallback");
	fail_offset = SIZE_MAX;
	prepare_upload(&storage, uploaded);
	fail_map = true;
	check(model_storage_commit(&storage) == BOARD_ERROR_STORAGE, "commit mapping fault");
	fail_map = false;
	check(!mappings && storage.active_state == BOARD_MODEL_EMBEDDED, "mapping fault fallback");
	prepare_upload(&storage, uploaded);
	fail_offset = 0;
	check(model_storage_commit(&storage) == BOARD_ERROR_STORAGE, "validity marker fault");
	fail_offset = SIZE_MAX;
	check(!mappings && storage.active_state == BOARD_MODEL_EMBEDDED, "marker fault fallback");
	prepare_upload(&storage, uploaded);
	corrupt_at_activation = true;
	check(model_storage_commit(&storage) == BOARD_ERROR_STORAGE, "activation rejects mutated mapped model");
	corrupt_at_activation = false;
	check(!mappings && storage.active_state == BOARD_MODEL_EMBEDDED, "activation fault fallback");
	model_storage_deinit(&storage);
	check(model_storage_init(&storage, fallback, NNUE_FILE_SIZE), "restart after activation fault");
	check(storage.active_state == BOARD_MODEL_EMBEDDED, "corrupt committed model rejected at boot");
	unload_nnue();
	model_storage_deinit(&storage);
	free_transposition_table(&table);
	free(uploaded);
	free(fallback);
	puts("host storage mock ok");
	return 0;
}
