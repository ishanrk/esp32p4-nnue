#include "serial_adapter.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
typedef struct {
    uint8_t input[64], output[64];
    size_t input_count, read_offset, output_count;
    uint64_t clock;
    bool stall;
} io_context_t;
static void check(bool condition) { if (!condition) { fputs("serial adapter check failed\n",stderr); exit(1); } }
static void info(void *ctx, board_device_info_t *out) { (void)ctx; memset(out,0,sizeof(*out)); }
static board_protocol_error_t position(void *ctx, const char *fen) { (void)ctx; (void)fen; return BOARD_ERROR_NONE; }
static board_protocol_error_t search(void *ctx, uint8_t kind, uint32_t budget, board_search_result_t *out) {
    (void)ctx; (void)kind; (void)budget; (void)out; return BOARD_ERROR_POSITION_REQUIRED;
}
static int read_bytes(void *arg,uint8_t *dst,size_t capacity,size_t *count) {
    io_context_t *ctx = arg;
    *count = ctx->input_count - ctx->read_offset;
    if (*count > capacity) *count = capacity;
    memcpy(dst,ctx->input+ctx->read_offset,*count); ctx->read_offset += *count;
    return 0;
}
static int write_bytes(void *arg,const uint8_t *src,size_t length,size_t *count) {
    io_context_t *ctx = arg;
    *count = ctx->stall ? 0 : (length > 2 ? 2 : length);
    check(ctx->output_count + *count <= sizeof(ctx->output));
    memcpy(ctx->output+ctx->output_count,src,*count); ctx->output_count += *count;
    return 0;
}
static uint64_t clock_ms(void *arg) { return ((io_context_t *)arg)->clock; }
static void yield_cpu(void *arg) { ((io_context_t *)arg)->clock += 100; }
int main(void) {
    io_context_t ctx = {0};
    ctx.input_count = board_protocol_encode_frame(1,1,NULL,0,ctx.input,sizeof(ctx.input));
    memcpy(ctx.input+ctx.input_count,ctx.input,ctx.input_count); ctx.input_count *= 2;
    board_protocol_backend_t backend = {.get_info=info,.set_position=position,.search=search};
    chess_serial_io_t io = {.context=&ctx,.read=read_bytes,.write=write_bytes,.monotonic_ms=clock_ms,.yield=yield_cpu};
    chess_serial_adapter_t adapter;
    check(!chess_serial_adapter_init(&adapter,&backend,&io));
    for(int i=0;i<30;i++) check(!chess_serial_adapter_poll(&adapter));
    uint8_t expected[16], version=1;
    size_t length=board_protocol_encode_frame(1,129,&version,1,expected,sizeof(expected));
    check(ctx.output_count == 2*length);
    check(!memcmp(ctx.output,expected,length) && !memcmp(ctx.output+length,expected,length));
    chess_serial_adapter_reset(&adapter); ctx.read_offset=0; ctx.stall=true;
    int status=0;
    for(int i=0;i<20 && !status;i++) status=chess_serial_adapter_poll(&adapter);
    check(status == -1 && ctx.clock >= 1000);
    puts("partial writes, combined requests, idle yield and stalled write deadline passed");
    return 0;
}
