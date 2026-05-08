# Search

search_position receives a mutable position, an optional transposition table,
search_limits_t, an optional information callback, and its callback context. It
returns search_result_t with best_move, score, completed depth, node count,
elapsed milliseconds, and the principal variation.

The function allocates one zeroed search_context_t before entering the recursive
search. The context owns the table pointer, two killer moves per ply, the
piece-to-destination history scores, one position used only for principal
variation reconstruction, the node and deadline state, and the current root
move. Recursive nodes perform no heap allocation and do not copy positions.

On a 64-bit host the context is 6,640 bytes. The previous 69,800-byte context
contained a 128 by 128 move matrix for principal variations. Removing that
matrix saves 63,160 bytes. With the 24-byte snapshot-free undo record, a
principal_variation_search frame is about 1,216 bytes and a quiescence_search
frame about 1,184 bytes in the measured GCC release object. The 1,028-byte
move_list_t now dominates both frames. That recursive stack cost is separate
from the heap-owned context and remains an important embedded measurement.

Iterative deepening calls principal_variation_search once for each depth. Alpha
is the best score already proved for the side to move and beta is the cutoff
limit the opponent will not allow. Only a fully completed iteration updates the
returned score, depth, move, and variation or reaches the information callback.
A stopped partial iteration cannot replace that result. If timing stops the
first iteration, search_position generates and validates one legal fallback
move. Every recursive path undoes its move before propagating the stop flag, so
the caller's root position is unchanged.

principal_variation_search is negamax alpha-beta. It checks time, the ply bound,
repetition and fifty-move state, then extends one ply when the side is in check.
At depth zero it enters quiescence_search. Otherwise it probes the
transposition table, orders pseudo-legal moves, and filters them with make_move.
Checkmate returns -30000 plus ply, while a position with no legal move outside
check returns zero for stalemate.

The first legal move receives a full window. Later moves receive a null window,
`[-alpha - 1, -alpha]`. A quiet fifth or later legal move is reduced by one ply
when depth is at least three, the parent is not in check, and the move does not
give check. A reduced move that improves alpha is searched again at full depth
with the null window. Any null-window result strictly between alpha and beta is
then searched with the full window. The thresholds are deliberately small and
fixed; this baseline adds no other pruning family.

score_move gives priority to the keyed table move, captures, promotions, two
killer moves at the current ply, and finally the history score for the moving
piece and destination. select_next_move scans only the unsearched tail and
places its highest-scoring move at the current index. A quiet beta cutoff
updates killers and adds depth squared to history. Large history values are
halved together to retain their relative ordering.

probe_transposition_table adjusts stored mate scores relative to the current
ply. A sufficient-depth exact entry is reusable directly. A lower bound is
reusable at or above beta, and an upper bound is reusable at or below alpha.
Other hits still supply their move for ordering. The root always searches its
moves instead of returning a table score, which keeps the completed root move
explicit.

store_transposition_entry selects an upper bound when the best score did not
raise the original alpha, a lower bound after a beta cutoff, and an exact entry
otherwise. It performs the inverse mate adjustment so the score keeps the same
mate distance when probed at a different ply. Stored depth is clamped to the
signed eight-bit field after check extensions. The direct-mapped 16-byte entry
replaces a collision. For the same key only a deeper entry blocks a shallower
nonexact replacement; an exact entry may replace it.

resize_transposition_table_bytes receives a table and byte budget. It releases
the old allocation, rounds the budget down to a power-of-two entry count, and
allocates zeroed entries so indexing remains `key & (count - 1)`. A budget below
one entry leaves a valid empty table. The firmware passes 262144 bytes directly,
which produces 16384 entries. resize_transposition_table receives a MiB count
for the desktop UCI option and forwards the converted budget to the byte form.
clear_transposition_table keeps the allocation and zeroes every entry.
free_transposition_table releases the entries and resets both public fields.

The completed root move seeds the displayed principal variation. After the
recursive stack has unwound, reconstruct_principal_variation copies the root
once into the context-owned position and follows keyed table moves. Each move
must still appear in the generated list and pass make_move, so a collision or
stale illegal move cannot enter the output. Reconstruction stops at a draw, a
missing key, an illegal move, an empty table, or MAX_PLY. Without a table the
result still contains the best root move as a one-move variation.
