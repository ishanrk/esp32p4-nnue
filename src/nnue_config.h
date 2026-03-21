#ifndef P4_NNUE_CONFIG_H
#define P4_NNUE_CONFIG_H

#ifndef P4_NNUE_BUCKET_COUNT
#define P4_NNUE_BUCKET_COUNT 8
#endif

#ifndef P4_NNUE_HIDDEN_SIZE
#define P4_NNUE_HIDDEN_SIZE 64
#endif

#if P4_NNUE_BUCKET_COUNT != 4 && \
    P4_NNUE_BUCKET_COUNT != 8 && \
    P4_NNUE_BUCKET_COUNT != 16
#error unsupported nnue bucket count
#endif

#if P4_NNUE_HIDDEN_SIZE <= 0
#error invalid nnue hidden size
#endif

#endif
