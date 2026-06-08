idf_component_register(
    SRCS "app.c" "model_storage.c" "../protocol.c"
    INCLUDE_DIRS "../../src" ".." "."
    REQUIRES core esp_app_format esp_driver_uart esp_partition
)

target_compile_options(${COMPONENT_LIB} PRIVATE
    -Wall
    -Wextra
    -Wshadow
    -Wstrict-prototypes
    -Wconversion
    -Wno-sign-conversion
    -fno-math-errno
)
