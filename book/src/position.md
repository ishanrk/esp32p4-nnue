# Position

position_t keeps redundant representations because each serves a hot access
pattern:

- pieces[12] stores one bitboard for each colored piece
- occupancy[WHITE], occupancy[BLACK], and occupancy[ALL_PIECES] store occupancy
- board[64] provides direct piece lookup with NO_PIECE for an empty square
- key is the incremental Zobrist key
- history and history_count support repetition and fifty-move detection
- accumulator[2][64] and king_bucket[2] hold both NNUE perspectives
- halfmove_clock and fullmove_number preserve FEN clocks
- side_to_move, castling, and en_passant hold reversible game state

The piece bitboards, occupancy bitboards, and square array must always agree.
position_is_valid reconstructs temporary bitboards from board, checks both
kings and state ranges, and compares key with calculate_position_hash. Tests
call it after recursive make and undo work.

## Creating positions

clear_position receives a position, initializes global tables if necessary,
zeros all state, marks every board square empty, clears en passant, and sets the
fullmove number to one.

set_position_fen receives a position and FEN text. It replaces the position,
parses board state, side, castling, en passant, and optional clocks, computes
the initial key, starts the key history, refreshes NNUE, and returns whether the
result passes position_is_valid.

set_start_position receives a position and loads the standard initial FEN.
find_king_square returns a side's king square or NO_SQUARE.
square_is_attacked tests pawn, knight, king, bishop, rook, and queen attacks
against a square. side_in_check connects those queries by finding the king and
testing attacks from the opponent.
