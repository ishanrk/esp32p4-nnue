# Bitboards

bitboard_t is a 64-bit unsigned value with bit zero representing a1 and bit 63
representing h8. SQUARE_BIT creates a one-square mask, while bit_count,
first_square, and pop_first_square provide the operations used throughout move
generation.

## Initialization

initialize_chess takes no arguments and may be called repeatedly. On its first
call it fills knight_attacks, king_attacks, pawn_attacks, and eight directional
attack_rays. It also creates the deterministic Zobrist key tables. Later calls
return immediately, which lets position initialization safely ensure the
tables exist.

## Sliding attacks

generate_bishop_attacks(square, occupancy) and
generate_rook_attacks(square, occupancy) receive an origin square and the
combined occupancy bitboard. Each returns all reachable squares including the
nearest blocker in each direction.

The internal sliding_line_attacks intersects a precomputed ray with occupancy,
finds the nearest blocker with a leading- or trailing-zero count, and removes
the part of the ray beyond that blocker. Bishops combine four diagonal lines;
rooks combine four orthogonal lines. Queens combine both results in
generate_slider_moves.

The representation remains native 64-bit bitboards. A pair-of-32-bit
experiment for RV32 is deliberately deferred until benchmarking can compare it
against this reference.
