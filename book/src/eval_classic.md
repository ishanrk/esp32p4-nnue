# Classical Evaluation

evaluate(position) is the evaluation entry point used by search. It receives a
read-only position and returns a centipawn-style score from the side-to-move
perspective. When nnue_is_loaded is true it delegates to evaluate_nnue.
Otherwise it computes the classical fallback.

The fallback adds material values of 100, 320, 330, 500, and 900 for pawn
through queen. A compact procedural piece-square term rewards pawn advancement,
central knights, bishops and queens, advanced rooks, and king placement. Black
squares are rank-mirrored so both sides share the same calculation.

White contributions are positive and black contributions negative. The final
white-relative total is negated when black is to move. This sign convention
matches negamax and the NNUE result.

The fallback contains no heap allocation or mutable state. It iterates the
piece bitboards with pop_first_square and remains available when no exported
network has been loaded.
