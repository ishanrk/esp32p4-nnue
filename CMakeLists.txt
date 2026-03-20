cmake_minimum_required(VERSION 3.20)
project(esp32p4_nnue C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

option(P4_NATIVE "use host cpu flags" OFF)
option(P4_SAN "use sanitizers" OFF)

set(P4_SRC
    src/bitboard.c
    src/evaluate.c
    src/movegen.c
    src/nnue.c
    src/position.c
    src/search.c
    src/system.c
)

add_library(p4core STATIC ${P4_SRC})
target_include_directories(p4core PUBLIC src)

if(MSVC)
    set(P4_WARNINGS /W4)
else()
    set(P4_WARNINGS
        -O3
        -Wall
        -Wextra
        -Wshadow
        -Wstrict-prototypes
        -Wconversion
        -Wno-sign-conversion
        -fno-math-errno
    )
    if(P4_NATIVE)
        target_compile_options(p4core PRIVATE -march=native)
    endif()
    if(P4_SAN)
        target_compile_options(p4core PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
        target_link_options(p4core PUBLIC -fsanitize=address,undefined)
    endif()
endif()
target_compile_options(p4core PRIVATE ${P4_WARNINGS})

include(CheckIPOSupported)
check_ipo_supported(RESULT P4_IPO)
if(P4_IPO)
    set_property(TARGET p4core PROPERTY INTERPROCEDURAL_OPTIMIZATION TRUE)
endif()

add_executable(p4nnue src/main.c src/uci.c)
target_link_libraries(p4nnue PRIVATE p4core)
target_compile_options(p4nnue PRIVATE ${P4_WARNINGS})

add_executable(p4eval src/eval_tool.c)
target_link_libraries(p4eval PRIVATE p4core)
target_compile_options(p4eval PRIVATE ${P4_WARNINGS})

include(CTest)
if(BUILD_TESTING)
    add_executable(p4test test/test.c)
    target_link_libraries(p4test PRIVATE p4core)
    target_compile_options(p4test PRIVATE ${P4_WARNINGS})
    target_compile_definitions(
        p4test PRIVATE
        P4_NNUE_FIXTURE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/test/nnue_features.txt"
    )
    add_test(NAME p4test COMMAND p4test)
    find_package(Python3 COMPONENTS Interpreter)
    if(Python3_Interpreter_FOUND)
        add_test(
            NAME p4features
            COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_features.py
        )
        execute_process(
            COMMAND ${Python3_EXECUTABLE} -c "import chess, numpy"
            RESULT_VARIABLE P4_TRAIN_DEPS
            OUTPUT_QUIET
            ERROR_QUIET
        )
        if(P4_TRAIN_DEPS EQUAL 0)
            add_test(
                NAME p4data
                COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_data.py
            )
            add_test(
                NAME p4model
                COMMAND ${CMAKE_COMMAND} -E env
                    P4_EVAL_TOOL=$<TARGET_FILE:p4eval>
                    ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_model.py
            )
            execute_process(
                COMMAND ${Python3_EXECUTABLE} -c "import torch"
                RESULT_VARIABLE P4_TORCH_DEPS
                OUTPUT_QUIET
                ERROR_QUIET
            )
            if(P4_TORCH_DEPS EQUAL 0)
                add_test(
                    NAME p4training
                    COMMAND ${Python3_EXECUTABLE}
                        ${CMAKE_CURRENT_SOURCE_DIR}/train/test_training.py
                )
            endif()
        endif()
    endif()
endif()
