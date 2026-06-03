cmake_minimum_required(VERSION 3.22)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
set(PROJECT_VER "1.1.0")
project(esp32p4_nnue)

set(reference_model "${CMAKE_CURRENT_LIST_DIR}/../models/reference.nnue")
target_add_binary_data(
    ${PROJECT_NAME}.elf "${reference_model}" BINARY
    RENAME_TO reference_nnue
)
