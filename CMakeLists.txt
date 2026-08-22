cmake_minimum_required(VERSION 3.20)
project(esp32p4_nnue C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

option(P4_NATIVE "use host cpu flags" OFF)
option(P4_SAN "use sanitizers" OFF)

set(P4_SRC
    src/bb.c
    src/eval.c
    src/gen.c
    src/nn.c
    src/pos.c
    src/search.c
    src/sys.c
)

add_library(p4core STATIC ${P4_SRC})
target_include_directories(p4core PUBLIC src)

if(MSVC)
    target_compile_options(p4core PRIVATE /O2 /W4)
else()
    target_compile_options(p4core PRIVATE
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

include(CheckIPOSupported)
check_ipo_supported(RESULT P4_IPO)
if(P4_IPO)
    set_property(TARGET p4core PROPERTY INTERPROCEDURAL_OPTIMIZATION TRUE)
endif()

add_executable(p4nnue src/main.c src/uci.c)
target_link_libraries(p4nnue PRIVATE p4core)

include(CTest)
if(BUILD_TESTING)
    add_executable(p4test test/test.c)
    target_link_libraries(p4test PRIVATE p4core)
    add_test(NAME p4test COMMAND p4test)
endif()
