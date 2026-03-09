# Bitboards

bitboard_t is a 64-bit unsigned value. Squares advance by file and then rank:
a1 is bit 0, h1 is bit 7, a2 is bit 8, and h8 is bit 63. SQUARE_BIT creates a
one-square mask, while bit_count, first_square, and pop_first_square provide
the operations used throughout move generation. Callers only pass a nonzero
value to the square-scan helpers.

## Initialization

initialize_chess takes no arguments and may be called repeatedly. On its first
call it fills the public knight, king, and pawn attack tables and the private
eight-direction ray table. It also creates the deterministic Zobrist key
tables. Later calls return immediately, which lets position initialization
safely ensure the tables exist without repeated writes.

The fixed attack tables cost 2,048 bytes: 512 bytes each for knight and king
attacks and 1,024 bytes for both pawn colors. They replace coordinate work in
every fixed-piece attack query. The eight rays cost another 4,096 bytes. Their
direction names define north as increasing rank and east as increasing file,
which keeps initialization and blocker scans consistent with the square
numbering.

## Sliding attacks

generate_bishop_attacks(square, occupancy) and
generate_rook_attacks(square, occupancy) receive an origin square and the
combined occupancy bitboard. Each returns all reachable squares including the
nearest blocker in each direction.

The internal sliding_line_attacks intersects a precomputed ray with occupancy,
returns the full ray immediately when there is no blocker, and otherwise finds
the nearest blocker with a leading- or trailing-zero count. It removes only the
part of the ray beyond that blocker, so the blocker square remains in the
result for later friendly-occupancy filtering. The empty-blocker check ensures
that no zero value reaches either bit scan. Bishops combine four diagonal
lines; rooks combine four orthogonal lines. Queens combine both results in move
generation.

This design uses 6,144 bytes of attack data and four compact directional
queries per bishop or rook. Square walking would save the ray table but add a
branch and coordinate update for every traversed square. Larger indexed slider
tables would spend substantially more memory. The ray design is therefore the
scalar baseline, without assuming that host timing proves it best on RV32.

The representation remains native 64-bit bitboards. A pair-of-32-bit
experiment for RV32 is deliberately deferred until benchmarking can compare it
against this reference.
