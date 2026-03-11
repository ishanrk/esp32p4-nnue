# Benchmarks

There is no separate benchmark target in the current repository. This keeps
the root build limited to the shared core, desktop UCI executable, and
regression test.

The UCI perft command reports legal-move node count and elapsed milliseconds.
Normal go commands report depth, nodes, elapsed milliseconds, and nodes per
second through print_search_info. A small repeatable host search set uses these
commands after `ucinewgame` before each position:

```text
position startpos
go depth 6

position fen r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1
go depth 4

position fen 7k/8/5K2/4Q3/8/8/8/8 w - - 0 1
go depth 5
```

A GCC release run on the current x86-64 host produced:

| position | completed depth | best move | score | nodes | time | nodes per second |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| start | 6 | b1c3 | 0 cp | 34,946 | 6 ms | 5,824,333 |
| kiwipete | 4 | e2a6 | -22 cp | 68,088 | 21 ms | 3,242,285 |
| forced mate | 2 | f6g6 | mate 2 | 822 | 0 ms | not reported |

The mate search stops when iterative deepening proves mate, before the requested
depth five. Millisecond timing and derived throughput are directional host
measurements only. Best move, score, and node count are the stable comparison
values while the search algorithm is unchanged. The start and kiwipete node
counts are identical to the pre-change baseline, confirming that the principal
variation memory reduction did not change their search trees.

ESP32 P4 cycle counts, native 64-bit versus paired 32-bit bitboards, and portable
scalar versus PIE kernels all remain future measurement tasks. These host
numbers must not be presented as device performance.
