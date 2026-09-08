#include "serial_adapter.h"
#include <string.h>

static void queue_reply(const uint8_t *data, size_t size, void *context) {
    chess_serial_adapter_t *adapter = context;
    if (adapter->tx_count || size > sizeof(adapter->tx)) {
        adapter->failed = true;
        return;
    }
    memcpy(adapter->tx, data, size);
    adapter->tx_count = size;
    adapter->tx_offset = 0;
    adapter->write_started_ms = adapter->io.monotonic_ms(adapter->io.context);
}

int chess_serial_adapter_init(chess_serial_adapter_t *adapter,
                             const board_protocol_backend_t *engine,
                             const chess_serial_io_t *io) {
    if (!adapter || !engine || !engine->get_info || !engine->set_position ||
        !engine->search || !io || !io->read || !io->write ||
        !io->monotonic_ms || !io->yield) return -1;
    memset(adapter, 0, sizeof(*adapter));
    board_protocol_init(&adapter->protocol, engine);
    adapter->io = *io;
    return 0;
}

void chess_serial_adapter_reset(chess_serial_adapter_t *adapter) {
    board_protocol_backend_t backend = adapter->protocol.backend;
    board_protocol_init(&adapter->protocol, &backend);
    adapter->rx_count = adapter->rx_offset = 0;
    adapter->tx_count = adapter->tx_offset = 0;
    adapter->failed = false;
}

int chess_serial_adapter_poll(chess_serial_adapter_t *adapter) {
    if (!adapter || adapter->failed) return -1;
    chess_serial_io_t *io = &adapter->io;
    if (adapter->tx_count) {
        size_t remaining = adapter->tx_count - adapter->tx_offset, count = 0;
        if (io->write(io->context, adapter->tx + adapter->tx_offset, remaining, &count) ||
            count > remaining) { adapter->failed = true; return -1; }
        adapter->tx_offset += count;
        if (adapter->tx_offset == adapter->tx_count) {
            adapter->tx_count = adapter->tx_offset = 0;
        } else if (io->monotonic_ms(io->context) - adapter->write_started_ms >= 1000) {
            adapter->failed = true;
            return -1;
        }
        if (!count) io->yield(io->context);
        return 0;
    }
    if (adapter->rx_offset == adapter->rx_count) {
        adapter->rx_offset = adapter->rx_count = 0;
        int status = io->read(io->context, adapter->rx, sizeof(adapter->rx), &adapter->rx_count);
        if (status || adapter->rx_count > sizeof(adapter->rx)) {
            adapter->failed = status != 1;
            return status == 1 ? 1 : -1;
        }
        if (!adapter->rx_count) { io->yield(io->context); return 0; }
    }
    /* Feed only until one reply exists. Combined requests cannot overwrite TX. */
    while (adapter->rx_offset < adapter->rx_count && !adapter->tx_count && !adapter->failed) {
        board_protocol_feed(&adapter->protocol, adapter->rx + adapter->rx_offset++, 1,
                            queue_reply, adapter);
    }
    return adapter->failed ? -1 : 0;
}
