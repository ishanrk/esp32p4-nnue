#include "ch.h"

#ifdef ESP_PLATFORM
#include "esp_timer.h"
#else
#include <time.h>
#endif

uint64_t current_time_ms(void) {
#ifdef ESP_PLATFORM
    return (uint64_t)esp_timer_get_time() / 1000u;
#else
    struct timespec now;
    timespec_get(&now, TIME_UTC);
    return (uint64_t)now.tv_sec * 1000u +
           (uint64_t)now.tv_nsec / 1000000u;
#endif
}
