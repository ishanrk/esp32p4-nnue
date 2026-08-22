#include "ch.h"

#ifdef ESP_PLATFORM
#include "esp_timer.h"
#else
#include <time.h>
#endif

u64 sys_ms(void) {
#ifdef ESP_PLATFORM
    return (u64)esp_timer_get_time() / 1000u;
#else
    struct timespec t;
    timespec_get(&t, TIME_UTC);
    return (u64)t.tv_sec * 1000u + (u64)t.tv_nsec / 1000000u;
#endif
}
