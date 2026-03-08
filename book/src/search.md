# Search

search_position receives a mutable position, an optional transposition table,
search_limits_t, an optional information callback, and its callback context. It
returns search_result_t with best_move, score, completed depth, node count,
elapsed milliseconds, and the principal variation.

The function allocates one search_context_t at search start. This context owns
killer moves, history scores, principal variation arrays, timing state, and
node count; recursive search performs no heap allocation. Iterative deepening
calls principal_variation_search once for each depth and publishes only fully
completed iterations through the callback.

principal_variation_search is negamax alpha-beta. It checks time, the ply bound,
repetition and fifty-move state, then extends one ply when the side is in check.
At depth zero it enters quiescence_search. Otherwise it probes the
transposition table, orders pseudo-legal moves, and filters them with make_move.

The first legal move receives a full window. Later moves receive a null window,
with late quiet moves reduced by one ply under the baseline conditions. A
reduced move that improves alpha is searched again at full depth, and a
null-window improvement inside the alpha-beta window receives a full-window
search. Cutoffs update killer and history ordering.

probe_transposition_table adjusts stored mate scores relative to the current
ply and returns a usable exact or bound score, or SCORE_INFINITY for no cutoff.
store_transposition_entry performs the inverse mate adjustment and replaces the
single indexed slot unless a deeper same-key nonexact entry should survive.

resize_transposition_table rounds the requested megabytes down to a power-of-two
entry count and owns the allocation. clear_transposition_table keeps the
allocation but removes entries. free_transposition_table releases it.
