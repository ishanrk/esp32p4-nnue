# Move Encoding

move_t is a packed 32-bit unsigned value. The current layout is:

    bits 0..5    source square
    bits 6..11   destination square
    bits 12..14  promotion selector
    bits 15..18  move flags
    bits 19..31  unused

PACK_MOVE constructs a value. MOVE_FROM, MOVE_TO, MOVE_PROMOTION, and
MOVE_FLAGS decode it without memory access. Promotion selectors zero through
four mean none, knight, bishop, rook, and queen. Flags identify capture, en
passant, castling, and a double pawn move.

move_list_t stores up to MAX_MOVES packed values in moves and records the used
length in count. Generation silently stops at that fixed capacity, so search
never allocates a move list on the heap.

move_to_uci receives a packed move and a six-byte output buffer. It writes
coordinate notation such as e2e4 or a7a8q and terminates the string.
parse_uci_move receives a mutable position and UCI text. It generates
candidates, uses make_move and undo_move to find the matching legal move, and
returns zero when the text does not identify a legal move.
