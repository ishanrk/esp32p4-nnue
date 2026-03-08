# Perft

perft(position, depth) counts legal leaf nodes from a mutable position. Depth
zero returns one. At higher depth it calls generate_moves, tries each candidate
through make_move, recurses after legal moves, and always calls undo_move before
continuing.

Because perft shares generation, legality, state transition, and restoration
with search, its known node counts protect the complete chess core rather than
a separate test-only implementation.

The regression binary checks these standard positions:

- start position through depth four
- Kiwipete through depth three
- the standard perft positions three through six through depth three

Together they exercise castling, en passant, promotions, checks, pins, and
unusual occupancy patterns. After every depth, the test calls
position_is_valid to ensure recursive make and undo restored the complete
position.

Run the suite with:

    ctest --test-dir build --output-on-failure

The UCI loop also accepts perft followed by a depth and reports nodes and
elapsed milliseconds for interactive diagnosis.
