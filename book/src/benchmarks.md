# Benchmarks

There is no separate benchmark target in the current repository. This keeps
the root build limited to the shared core, desktop UCI executable, and
regression test.

The UCI perft command reports legal-move node count and elapsed milliseconds.
Normal go commands report depth, nodes, elapsed milliseconds, and nodes per
second through print_search_info. These measurements are useful for local
comparisons but are not a stable benchmark suite.

Later focused work can add deterministic search, evaluation, and transposition
table benchmarks when there is hardware or algorithm work to compare. ESP32 P4
cycle counts, native 64-bit versus paired 32-bit bitboards, and portable scalar
versus PIE kernels all remain future measurement tasks.
