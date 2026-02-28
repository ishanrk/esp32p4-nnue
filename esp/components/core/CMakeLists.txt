idf_component_register(
    SRCS
        "../../../src/bb.c"
        "../../../src/eval.c"
        "../../../src/gen.c"
        "../../../src/nn.c"
        "../../../src/pos.c"
        "../../../src/search.c"
        "../../../src/sys.c"
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
