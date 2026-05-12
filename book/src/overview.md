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

The desktop main initializes a one MiB transposition table and passes it to
run_uci_loop. ESP app_main initializes the same chess tables, binds the
flash-mapped smoke model, allocates its fixed 256 KiB table, prints the firmware
banner, and passes the table to the same loop. run_uci_loop owns the current
position and command parsing while each entry point owns the table and active
network lifetime.

## Chosen baseline

The search is single threaded iterative deepening principal variation search
with quiescence, a fixed-size transposition table, killer moves, history
ordering, check extension, and late move reduction.

The NNUE has two vertically normalized perspectives, horizontal king symmetry,
four king buckets, 640 nonking piece-square features per bucket, and 128 hidden
values. Its version 3 328480-byte integer network is shared by host inference
and firmware. Make and undo maintain accumulators through reversible feature
updates without snapshots. The current implementation is portable scalar C and
remains the correctness reference for later ESP32 P4 PIE work.

Four compile-time profiles were trained on the same ten-million-position corpus
and measured under a 512 KiB ceiling. The selected 4x128 baseline matched the
larger 8x96 finalist over 512 games and produced comparable validation results
across three seeds while using 163648 fewer serialized bytes. Experimental
profiles remain reproducible without runtime branches. Physical ESP32 P4 timing
may revise this pre-hardware choice.
