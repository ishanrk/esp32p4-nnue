#ifndef P4_SERIAL_ADAPTER_H
#define P4_SERIAL_ADAPTER_H
#include "protocol.h"

/* Callbacks return 0 on success (including no progress), 1 on orderly EOF,
 * and -1 on IO failure. Buffers are borrowed only during the call. */
typedef struct {
    void *context;
    int (*read)(void *context, uint8_t *dst, size_t capacity, size_t *count);
    int (*write)(void *context, const uint8_t *src, size_t length, size_t *count);
    uint64_t (*monotonic_ms)(void *context);
    void (*yield)(void *context);
} chess_serial_io_t;

typedef struct {
    board_protocol_t protocol;
    chess_serial_io_t io;
    uint8_t rx[256];
    size_t rx_count, rx_offset;
    uint8_t tx[BOARD_PROTOCOL_MAX_FRAME];
    size_t tx_count, tx_offset;
    uint64_t write_started_ms;
    bool failed;
} chess_serial_adapter_t;

/* The caller owns this object and the engine context until polling stops.
 * No allocation. One execution context only. No wire reset or stop command. */
int chess_serial_adapter_init(chess_serial_adapter_t *adapter,
                             const board_protocol_backend_t *engine,
                             const chess_serial_io_t *io);
/* One bounded IO step, apart from synchronous engine search. Returns the IO
 * codes above. A stalled response write fails after 1000 ms. */
int chess_serial_adapter_poll(chess_serial_adapter_t *adapter);
void chess_serial_adapter_reset(chess_serial_adapter_t *adapter);
#endif
