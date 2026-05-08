cmake_minimum_required(VERSION 3.22)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(esp32p4_nnue)

idf_build_get_property(idf_python PYTHON)
set(smoke_model "${CMAKE_BINARY_DIR}/firmware_smoke.nnue")
add_custom_command(
    OUTPUT "${smoke_model}"
    COMMAND "${idf_python}"
        "${CMAKE_CURRENT_LIST_DIR}/generate_smoke_model.py"
        "${smoke_model}"
    DEPENDS
        "${CMAKE_CURRENT_LIST_DIR}/generate_smoke_model.py"
        "${CMAKE_CURRENT_LIST_DIR}/../train/profiles.py"
    VERBATIM
)
target_add_binary_data(
    ${PROJECT_NAME}.elf "${smoke_model}" BINARY
    RENAME_TO firmware_smoke_nnue
    DEPENDS "${smoke_model}"
)
