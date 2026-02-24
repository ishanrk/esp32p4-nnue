# Makemove

## 1) make path
make updates board, castling, en passant, clocks, and side to move.

```c
Undo u;
if (make_move(&pos, m, &u)) {
    // search deeper
}
```

## 2) unmake path
undo restores exact reversible state from stack data.

```c
unmake_move(&pos, m, &u);
```

## 3) legality gate
moves that leave own king in check are rejected at make time.

```c
Color moved_side = pos->side_to_move;
pos->side_to_move = moved_side == COLOR_WHITE ? COLOR_BLACK : COLOR_WHITE;
if (pos_in_check(pos, moved_side)) {
    unmake_move(pos, m, undo);
    return false;
}
```

## references
<https://www.chessprogramming.org/Make_Move>
