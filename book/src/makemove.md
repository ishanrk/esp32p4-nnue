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
length, castling rights, en passant square, moved piece, captured piece, and the
moving side's old NNUE bucket and mirror orientation. undo_t is 24 bytes on the
measured 64-bit host. It no longer stores or copies the two 64-value
accumulators.

The update removes old castling and en passant keys, moves pieces in both the
square array and bitboards, handles en passant capture and rook movement,
applies promotion, updates NNUE features, installs new reversible state keys,
changes side to move, and appends the resulting key to history. Ordinary moves
remove and add feature vectors in both perspectives. Captures remove the actual
captured square, promotion replaces the pawn with the promoted class, en
passant uses the pawn's real square, and castling moves the rook through the
same helpers. A king move refreshes its own perspective only when its bucket or
horizontal orientation changes. A pawn move or capture resets the
halfmove clock, and a Black move increments the fullmove number. Moving a king
or rook and capturing a rook on its home square update castling rights through
the same square masks.

After the state transition, make_move finds the moved side's king. If it is
missing or attacked, undo_move restores the original state and make_move
returns false.

undo_move(position, move, undo) reverses piece motion, including castling,
promotion, capture, and en passant. Those inverse piece operations also reverse
their feature-vector updates. It then restores every saved reversible field and
the original incremental key. If the undone king move changed its view, only
that old perspective is rebuilt after the pieces and view metadata are restored.
The other perspective remains incremental. Ordinary make and undo now copy zero
accumulator bytes instead of 256 bytes in each direction.

The restoration contract covers the twelve piece bitboards, three occupancy
bitboards, square lookup array, side to move, castling rights, en passant
square, both clocks, Zobrist key, and history count. Tests verify these defined
fields plus accumulators and king-view metadata after undoing legal moves and a
complete fixed-seed sequence rather than
comparing structure padding.
