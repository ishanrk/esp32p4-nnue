# Make and Undo

make_move(position, move, undo) receives a mutable position, a packed candidate,
and storage for reversible state. It returns false for malformed moves and
moves that leave the moving king attacked. A true result means the position now
contains the move and the caller must eventually pass the same move and undo
record to undo_move.

The fast validation prefix reads the packed fields and current board state. It
rejects reserved bits, unsupported flag combinations, empty or enemy sources,
capture-flag mismatches, king captures, invalid promotion ranks, malformed
double pushes, malformed en passant geometry, and malformed castles before
piece state changes. Source and destination fields need no range branch because
their six-bit decoders always return zero through 63. Ordinary bishop, rook,
queen, and knight geometry remains the generator's responsibility rather than
being duplicated here.

en_passant_move_is_valid requires a pawn on the correct rank, a diagonal move
to the current empty target, and the opponent pawn on the captured square.
double_pawn_move_is_valid requires the starting rank, exact two-square delta,
and empty intermediate and destination squares. castle_move_is_valid requires the correct
side, origin, destination, right, rook, and empty path. It also rejects a king
starting in check or crossing an attacked square; the common final king-safety
test rejects a castle into check after the pieces move.

Before changing the board, make_move stores the Zobrist key, clocks, history
length, castling rights, en passant square, NNUE king buckets, moved piece, and
captured piece. When NNUE is loaded it also stores both accumulators. This fixed
undo_t record avoids rebuilding full state in the search hot path.

The update removes old castling and en passant keys, moves pieces in both the
square array and bitboards, handles en passant capture and rook movement,
applies promotion, updates NNUE features, installs new reversible state keys,
changes side to move, and appends the resulting key to history. A king move
refreshes only its own NNUE perspective. A pawn move or capture resets the
halfmove clock, and a Black move increments the fullmove number. Moving a king
or rook and capturing a rook on its home square update castling rights through
the same square masks.

After the state transition, make_move finds the moved side's king. If it is
missing or attacked, undo_move restores the original state and make_move
returns false.

undo_move(position, move, undo) reverses piece motion, including castling,
promotion, capture, and en passant. It then restores every saved reversible
field and the original incremental key. Restoring the saved accumulators makes
undo exact without a full NNUE refresh.

The restoration contract covers the twelve piece bitboards, three occupancy
bitboards, square lookup array, side to move, castling rights, en passant
square, both clocks, Zobrist key, and history count. Tests verify these defined
fields individually after undoing a complete legal sequence rather than
comparing structure padding.
