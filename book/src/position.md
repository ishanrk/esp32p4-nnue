# Position

position_t keeps redundant representations because each serves a hot access
pattern:

- pieces[12] stores one bitboard for each colored piece
- occupancy[WHITE], occupancy[BLACK], and occupancy[ALL_PIECES] store occupancy
- board[64] provides direct piece lookup with NO_PIECE for an empty square
- key is the incremental Zobrist key
- history and history_count support repetition and fifty-move detection
- accumulator[2][64], king_bucket[2], and king_mirror[2] hold both NNUE views
- halfmove_clock and fullmove_number preserve FEN clocks
- side_to_move, castling, and en_passant hold reversible game state

The piece bitboards, occupancy bitboards, and square array must always agree.
position_is_valid reconstructs temporary bitboards from board, checks both
kings and state ranges, and compares key with calculate_position_hash. An en
passant target must be empty and on rank six when White is to move or rank
three when Black is to move. The opponent pawn that made the double advance
must occupy the square immediately behind that target. Tests call this
deliberately thorough helper after construction, make, and undo work; search
does not rebuild this state in its hot path.

## Creating positions

clear_position receives a position, initializes global tables if necessary,
zeros all state, marks every board square empty, clears en passant, and sets the
fullmove number to one.

set_position_fen receives a position and FEN text. It replaces the position,
parses board state, side, castling, en passant, and optional clocks, computes
the initial key, starts the key history, refreshes NNUE, and returns whether the
result passes position_is_valid. Board runs must use digits one through eight,
each rank must contain exactly eight squares, and the board must contain
exactly eight ranks. The parser rejects unknown pieces, invalid side fields,
invalid en passant coordinates, and extra characters attached to the en
passant field. Structural validation then requires one king per side and the
valid en passant rank, empty target, and matching advanced pawn.

set_start_position receives a position and loads the standard initial FEN.
find_king_square returns a side's king square or NO_SQUARE.
square_is_attacked tests pawn, knight, king, bishop, rook, and queen attacks
against a square. It reads the piece and combined occupancy bitboards and does
not change the position. side_in_check connects those queries by finding the
king and testing attacks from the opponent, returning false when no king is
present so position validation can report the malformed state separately.
