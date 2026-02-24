# Position

## 1) state layout
the engine keeps mailbox and bitboards in one explicit struct.

```c
typedef struct {
    int8_t board[64];
    U64 pieces[2][6];
    U64 occupancy[2];
    U64 all;
    U16 castling;
    Square ep_square;
    Color side_to_move;
} Position;
```

## 2) fen entry
positions are loaded from fen for testing, uci, and regression.

```c
Position pos;
pos_from_fen(&pos, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
```

## 3) attack checks
legality and check status are direct queries on position.

```c
bool in_check = pos_in_check(&pos, pos.side_to_move);
bool attacked = pos_square_attacked(&pos, SQUARE_E4, COLOR_BLACK);
```

## references
<https://www.chessprogramming.org/Board_Representation>
