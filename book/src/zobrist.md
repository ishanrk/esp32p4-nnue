# Zobrist Hashing

initialize_chess creates deterministic random keys for every colored piece on
every square, all 16 castling masks, each en passant file, and side to move.
Using a fixed SplitMix64 seed makes keys stable across host and firmware builds.

calculate_position_hash(position) receives a read-only position and returns a
key rebuilt from piece bitboards and reversible state. It is used when loading
FEN and as the full recomputation check inside position_is_valid.

make_move updates position.key incrementally. Piece placement and removal xor
piece-square keys. The function removes the old castling and en passant keys,
changes those fields, adds their new keys, and xors the side key. undo_move
restores the saved key directly.

position.history contains keys after each played move up to
POSITION_HISTORY_SIZE. Search walks same-side entries back no farther than the
halfmove clock or the start of the bounded history. The current key is not
compared with itself. A matching earlier same-side key is treated as a search
draw, while a halfmove clock of 100 is treated as a fifty-move draw. These
checks apply at the root and in principal variation and quiescence nodes.

This is an engine search convention: one earlier occurrence is sufficient to
cut the line to zero. It is intentionally earlier than a formal game-level
threefold claim. A later arena layer must count formal outcomes independently
instead of interpreting the search cutoff as the game result.

Transposition entries use the complete key and a power-of-two mask to select
one fixed-size table slot.
