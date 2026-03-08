idf_component_register(
    SRCS
        "../../../src/bitboard.c"
        "../../../src/evaluate.c"
        "../../../src/movegen.c"
        "../../../src/nnue.c"
        "../../../src/position.c"
        "../../../src/search.c"
        "../../../src/system.c"
        "../../../src/uci.c"
    INCLUDE_DIRS "../../../src"
    REQUIRES esp_timer
)

target_compile_options(${COMPONENT_LIB} PRIVATE
    -O3
    -flto
    -Wall
    -Wextra
    -Wshadow
    -Wconversion
    -Wno-sign-conversion
    -fno-math-errno
)
