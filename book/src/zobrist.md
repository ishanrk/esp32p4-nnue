# Zobrist Hashing

initialize_chess creates deterministic random keys for every colored piece on
every square, all 16 castling masks, each en passant file, and side to move.
Using a fixed SplitMix64 seed makes keys stable across host and firmware builds.

calculate_position_hash(position) receives a read-only position and returns a
key rebuilt from piece bitboards and reversible state. It is used when loading
FEN and as the correctness oracle inside position_is_valid.

make_move updates position.key incrementally. Piece placement and removal xor
piece-square keys. The function removes the old castling and en passant keys,
changes those fields, adds their new keys, and xors the side key. undo_move
restores the saved key directly.

position.history contains keys after each played move up to
POSITION_HISTORY_SIZE. Search walks same-side entries back no farther than the
halfmove clock. A matching key is treated as repetition, while a halfmove clock
of 100 is treated as a fifty-move draw.

Transposition entries use the complete key and a power-of-two mask to select
one fixed-size table slot.
