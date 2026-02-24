# Bitboards

## 1) representation
each bit in `U64` maps to a square and supports branch light occupancy checks.

```c
typedef uint64_t U64;
U64 white_occ = pos->occupancy[COLOR_WHITE];
U64 all_occ = pos->all;
```

## 2) low level ops
the core helpers are small and inline friendly.

```c
U32 bb_popcount(U64 bb);
Square bb_lsb(U64 bb);
U64 bb_pop_lsb(U64 *bb);
```

## 3) practical usage
bitboards are rebuilt from mailbox state for correctness now, and can later be
updated incrementally for speed.

```c
pos_rebuild_bitboards(pos);
if (pos->pieces[COLOR_WHITE][PIECE_KNIGHT] & (1ULL << SQUARE_F3)) {
    // square has a white knight
}
```

## references
<https://www.chessprogramming.org/Bitboards>
