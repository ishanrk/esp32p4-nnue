cmake_minimum_required(VERSION 3.20)
project(esp32p4_nnue C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

option(P4_NATIVE "use host cpu flags" OFF)
option(P4_SAN "use sanitizers" OFF)
set(P4_SANITIZERS "address,undefined" CACHE STRING "gcc or clang sanitizers")
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_C_COMPILER_ID MATCHES "GNU|Clang" OR NOT UNIX)
	message(FATAL_ERROR "host build requires gcc or clang on a posix host")
endif()

set(P4_NNUE_PROFILE "4x128" CACHE STRING "compile time nnue profile")
set_property(CACHE P4_NNUE_PROFILE PROPERTY STRINGS 4x128 8x64 8x96 16x48)
if(P4_NNUE_PROFILE STREQUAL "4x128")
    set(P4_NNUE_BUCKETS 4)
    set(P4_NNUE_WIDTH 128)
elseif(P4_NNUE_PROFILE STREQUAL "8x64")
    set(P4_NNUE_BUCKETS 8)
    set(P4_NNUE_WIDTH 64)
elseif(P4_NNUE_PROFILE STREQUAL "8x96")
    set(P4_NNUE_BUCKETS 8)
    set(P4_NNUE_WIDTH 96)
elseif(P4_NNUE_PROFILE STREQUAL "16x48")
    set(P4_NNUE_BUCKETS 16)
    set(P4_NNUE_WIDTH 48)
else()
    message(FATAL_ERROR "unsupported P4_NNUE_PROFILE ${P4_NNUE_PROFILE}")
endif()

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
target_compile_definitions(
    p4core PUBLIC
    P4_NNUE_BUCKET_COUNT=${P4_NNUE_BUCKETS}
    P4_NNUE_HIDDEN_SIZE=${P4_NNUE_WIDTH}
)

    set(P4_WARNINGS
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
add_library(p4diagnostics INTERFACE)
if(P4_SAN)
	target_compile_options(p4diagnostics INTERFACE -fsanitize=${P4_SANITIZERS} -fno-omit-frame-pointer)
	target_link_options(p4diagnostics INTERFACE -fsanitize=${P4_SANITIZERS})
endif()
target_link_libraries(p4core PUBLIC p4diagnostics)
target_compile_options(p4core PRIVATE ${P4_WARNINGS})

include(CheckIPOSupported)
check_ipo_supported(RESULT P4_IPO)
if(P4_IPO AND NOT P4_SAN)
    set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELEASE TRUE)
    set_property(TARGET p4core PROPERTY INTERPROCEDURAL_OPTIMIZATION_RELEASE TRUE)
endif()

add_executable(p4nnue src/main.c src/uci.c)
find_package(Threads REQUIRED)
target_link_libraries(p4nnue PRIVATE p4core Threads::Threads)
target_compile_options(p4nnue PRIVATE ${P4_WARNINGS})

add_executable(p4eval src/eval_tool.c)
target_link_libraries(p4eval PRIVATE p4core)
target_compile_options(p4eval PRIVATE ${P4_WARNINGS})

add_executable(p4bench src/profile_bench.c)
target_link_libraries(p4bench PRIVATE p4core)
target_compile_options(p4bench PRIVATE ${P4_WARNINGS})

add_executable(p4hostdevice examples/host_device.c esp/protocol.c esp/serial_adapter.c)
target_include_directories(p4hostdevice PRIVATE esp)
target_link_libraries(p4hostdevice PRIVATE p4core)
target_compile_options(p4hostdevice PRIVATE ${P4_WARNINGS})
add_executable(p4trace examples/inference_trace.c)
target_include_directories(p4trace PRIVATE esp)
target_link_libraries(p4trace PRIVATE p4core)
target_compile_options(p4trace PRIVATE ${P4_WARNINGS})

include(CTest)
if(BUILD_TESTING)
    # Assertions in executable tests must run in Release builds too.
    add_compile_options(-UNDEBUG)
    if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
        add_executable(p4allocationtest test/allocator_fail_test.c)
        target_link_libraries(p4allocationtest PRIVATE p4core)
        target_link_options(p4allocationtest PRIVATE -Wl,--wrap=calloc)
        add_test(NAME p4allocation COMMAND p4allocationtest)
    endif()
    add_executable(p4test test/test.c)
    target_link_libraries(p4test PRIVATE p4core)
    target_compile_options(p4test PRIVATE ${P4_WARNINGS})
    target_compile_definitions(
        p4test PRIVATE
        P4_NNUE_FIXTURE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/test/nnue_features.txt"
    )
    add_test(NAME p4test COMMAND p4test)

    add_executable(p4protocoltest test/protocol_test.c esp/protocol.c)
    target_include_directories(p4protocoltest PRIVATE esp)
    target_link_libraries(p4protocoltest PRIVATE p4diagnostics)
    target_compile_options(p4protocoltest PRIVATE ${P4_WARNINGS})
    add_test(NAME p4protocol COMMAND p4protocoltest)
    add_executable(p4vectors test/vector_test.c esp/protocol.c)
    target_include_directories(p4vectors PRIVATE esp)
    target_link_libraries(p4vectors PRIVATE p4diagnostics)
    target_compile_options(p4vectors PRIVATE ${P4_WARNINGS})
    add_test(NAME p4vectors COMMAND p4vectors ${CMAKE_CURRENT_SOURCE_DIR}/test/protocol_vectors.tsv)
    add_executable(p4serialadapter test/serial_adapter_test.c esp/serial_adapter.c esp/protocol.c)
    target_include_directories(p4serialadapter PRIVATE esp)
    target_link_libraries(p4serialadapter PRIVATE p4diagnostics)
    target_compile_options(p4serialadapter PRIVATE ${P4_WARNINGS})
    add_test(NAME p4serialadapter COMMAND p4serialadapter)

	# Storage is the reference firmware partition, not a generic host profile.
	if(P4_NNUE_PROFILE STREQUAL "4x128")
	add_executable(p4storagetest test/model_storage_test.c esp/main/model_storage.c esp/protocol.c)
	target_include_directories(p4storagetest PRIVATE test/stubs esp esp/main)
	target_link_libraries(p4storagetest PRIVATE p4core)
	target_compile_options(p4storagetest PRIVATE ${P4_WARNINGS})
	add_test(NAME p4storage COMMAND p4storagetest)
	endif()

    find_package(Python3 COMPONENTS Interpreter)
    if(Python3_Interpreter_FOUND)
		if(P4_NNUE_PROFILE STREQUAL "4x128")
			add_test(NAME p4trace COMMAND p4trace ${CMAKE_CURRENT_SOURCE_DIR}/models/reference.nnue)
			add_test(NAME p4uci COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_uci.py $<TARGET_FILE:p4nnue>)
		endif()
        add_test(
            NAME p4boardclient
            COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_board_client.py
        )
        add_test(
            NAME p4hostdevice
            COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/test/test_host_device.py
                $<TARGET_FILE:p4hostdevice>
        )
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
                    P4_NNUE_PROFILE=${P4_NNUE_PROFILE}
                    ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_model.py
            )
            add_test(
                NAME p4arena
                COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_arena.py
            )
            execute_process(
                COMMAND ${Python3_EXECUTABLE} -c "import torch"
                RESULT_VARIABLE P4_TORCH_DEPS
                OUTPUT_QUIET
                ERROR_QUIET
            )
            if(P4_TORCH_DEPS EQUAL 0)
                add_test(NAME p4erroranalysis COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/train/test_error_analysis.py)
                add_test(
                    NAME p4training
                    COMMAND ${Python3_EXECUTABLE}
                        ${CMAKE_CURRENT_SOURCE_DIR}/train/test_training.py
                )
            else()
				message(STATUS "skipped p4training because torch is unavailable")
                add_test(NAME p4training COMMAND ${CMAKE_COMMAND} -E echo "SKIP torch unavailable")
                set_tests_properties(p4training PROPERTIES SKIP_REGULAR_EXPRESSION "SKIP")
            endif()
        else()
			message(STATUS "skipped optional python suites because chess or numpy is unavailable")
            foreach(P4_TEST p4data p4model p4arena p4training)
                add_test(NAME ${P4_TEST} COMMAND ${CMAKE_COMMAND} -E echo "SKIP chess or numpy unavailable")
                set_tests_properties(${P4_TEST} PROPERTIES SKIP_REGULAR_EXPRESSION "SKIP")
            endforeach()
        endif()
    else()
		message(STATUS "skipped python suites because python is unavailable")
    endif()
endif()
