# Overview

This repository contains one compact chess engine core for desktop hosts and the
ESP32 P4. The core is C11 and has no Linux dependency. The desktop executable
and ESP-IDF component compile the same files, so host testing exercises the code
that firmware will run.

## Repository layout

    .github/        continuous integration
    book/           mdBook configuration and source
    esp/            thin ESP-IDF wrapper
    src/            shared chess core and desktop UCI entry point
    test/           host regression test
    train/          teacher labeling training and export
    CMakeLists.txt  host build
    README.md       project entry point

Generated mdBook output belongs in book/book but is ignored. Host build
directories, Python caches, datasets, checkpoints, and exported networks are
also ignored rather than stored as source.

## Runtime flow

initialize_chess prepares attack tables and deterministic Zobrist keys.
set_start_position or set_position_fen creates a synchronized position_t.
generate_moves emits pseudo-legal packed moves, and make_move rejects any move
that exposes the moving king. search_position uses this same make and undo
path. evaluate selects NNUE when a network is loaded and otherwise uses the
classical fallback.

The desktop main and ESP app_main both initialize the tables and enter
run_uci_loop. Only their process and serial startup differ.

## Chosen baseline

The search is single threaded iterative deepening principal variation search
with quiescence, a fixed-size transposition table, killer moves, history
ordering, check extension, and late move reduction.

The NNUE has two perspectives, eight mirrored king buckets, 640 nonking
piece-square features per bucket, and 64 hidden values. Its 328096-byte integer
network is shared by host inference and firmware. The current implementation is
portable scalar C and remains the correctness reference for later ESP32 P4 PIE
work.
