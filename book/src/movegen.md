# Move Generation

generate_moves(position, list, captures_only) reads the position without
changing it, clears the supplied move_list_t, and emits pseudo-legal moves for
the side to move. With captures_only set, it limits ordinary generation to
captures; search passes false in normal nodes and quiescence passes true when
the side is not in check.

Pawn generation handles single and double advances, both captures, en passant,
and all four promotion choices. Leaper generation intersects precomputed
knight or king attacks with friendly occupancy. Slider generation calls
generate_bishop_attacks and generate_rook_attacks, then removes friendly
squares and optionally noncaptures. A queen uses the union of the bishop and
rook results, so it shares the same directional blocker convention without a
separate attack table.

Castling is the only move class whose generator performs attack checks. It
requires the castling right, king and rook on their expected squares, empty
travel squares, the king not currently in check, and no attack on either king
travel square.

All other king-safety filtering belongs to make_move. This single legality gate
is shared by parsing, perft, tests, and search, avoiding a second legal move
implementation.
