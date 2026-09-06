#define _POSIX_C_SOURCE 200809L
#include "ch.h"
#include <stdlib.h>

#ifdef ESP_PLATFORM
#include "esp_timer.h"
#else
#include <stdio.h>
#include <time.h>
#endif

uint64_t current_time_us(void) {
#ifdef ESP_PLATFORM
	int64_t now = esp_timer_get_time();
	if (now < 0) abort();
	return (uint64_t)now;
#else
    struct timespec now;
	if (clock_gettime(CLOCK_MONOTONIC, &now) || now.tv_sec < 0 ||
		now.tv_nsec < 0 || now.tv_nsec >= 1000000000 ||
		(uint64_t)now.tv_sec > (UINT64_MAX - 999999u) / 1000000u) {
		fputs("monotonic clock failed\n", stderr);
		abort();
	}
	return (uint64_t)now.tv_sec * 1000000u + (uint64_t)now.tv_nsec / 1000u;
#endif
}


uint64_t current_time_ms(void) {
	return current_time_us() / 1000u;
}
