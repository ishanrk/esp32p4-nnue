# Quiescence

quiescence_search is the leaf search used by principal_variation_search. It
receives the shared search context, mutable position, alpha-beta window, and
ply, and returns a side-to-move score. It counts the node and propagates a
deadline stop before doing evaluation. At the protective MAX_PLY bound it
returns evaluate directly. Repetition and fifty-move states return zero at all
other quiescence nodes.

When the side is not in check, evaluate supplies the stand-pat score. A score at
or above beta returns immediately; a score above alpha raises alpha. The
function then asks generate_moves for tactical moves: captures, en passant,
capture promotions, and quiet promotions.

When the side is in check, stand pat is not legal and the generator emits all
pseudo-legal evasions. Every candidate still passes through make_move. If none
is legal, quiescence returns a mate score adjusted by ply.

Move ordering uses the normal scoring helper with no table move. Captures and
promotions therefore lead the tactical list, while killer and history values
can order the full evasion list. Each recursive score is negated, and every
successful make is paired with undo before stop, alpha, or beta handling.
