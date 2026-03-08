# Make and Undo

make_move(position, move, undo) receives a mutable position, a packed candidate,
and storage for reversible state. It returns false for malformed moves and
moves that leave the moving king attacked. A true result means the position now
contains the move and the caller must eventually pass the same move and undo
record to undo_move.

Before changing the board, make_move stores the Zobrist key, clocks, history
length, castling rights, en passant square, NNUE king buckets, moved piece, and
captured piece. When NNUE is loaded it also stores both accumulators. This fixed
undo_t record avoids rebuilding full state in the search hot path.

The update removes old castling and en passant keys, moves pieces in both the
square array and bitboards, handles en passant capture and rook movement,
applies promotion, updates NNUE features, installs new reversible state keys,
changes side to move, and appends the resulting key to history. A king move
refreshes only its own NNUE perspective.

After the state transition, make_move finds the moved side's king. If it is
missing or attacked, undo_move restores the original state and make_move
returns false.

undo_move(position, move, undo) reverses piece motion, including castling,
promotion, capture, and en passant. It then restores every saved reversible
field and the original incremental key. Restoring the saved accumulators makes
undo exact without a full NNUE refresh.
