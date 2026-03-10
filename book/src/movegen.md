# Move Generation

generate_moves(position, list, tactical_only) reads the position without
changing it, clears the supplied move_list_t, and emits candidate moves for the
side to move. With tactical_only false it emits every pseudo-legal move. With
tactical_only true it emits captures, en passant captures, capture promotions,
and quiet promotions. Quiescence uses this tactical set when the side is not in
check and requests all candidate evasions when the side is in check.

generate_pawn_moves reads the side's pawn bitboard, square lookup, enemy
occupancy, en passant target, and precomputed pawn attacks. It emits single
pushes, double pushes only when both squares are empty, captures, en passant,
and all four promotion choices. Quiet nonpromotion pushes are omitted from the
tactical set, while quiet promotions remain because they are tactically
forcing.

generate_leaper_moves receives the colored piece and its fixed attack table.
It intersects each piece's attacks with either enemy occupancy or all
nonfriendly squares, then emits packed moves. generate_slider_moves follows the
same target-mask rule and calls the bishop or rook attack function once per
piece direction set. A queen uses the union of both results, so it needs no
separate attack table. Neither helper changes the position.

generate_castling_moves emits a candidate only when the corresponding right is
set, the king and rook occupy their expected squares, and every required path
square is empty. make_move owns the remaining legality checks: the king may not
start in check, cross an attacked square, or finish in check. This avoids
repeating destination attack generation before make_move performs the normal
exposed-king check. An attacked b-file square does not prevent queenside
castling because the king never occupies it.

All candidate moves pass through make_move for king-safety filtering. Pins,
ordinary king destinations, en passant discovered attacks, and non-evasions
therefore share one legality gate across parsing, perft, tests, and search.
