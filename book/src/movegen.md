# Movegen

## 1) two stage generation
the engine first emits pseudo legal moves, then filters to legal moves.

```c
MoveList pseudo;
MoveList legal;
movegen_pseudo_legal(&pos, &pseudo);
movegen_legal(&pos, &legal);
```

## 2) legal filter path
every candidate is validated by make and unmake plus king safety.

```c
for (U32 i = 0; i < pseudo.count; i++) {
    Position tmp = pos;
    Undo u;
    if (make_move(&tmp, pseudo.moves[i], &u)) {
        legal.moves[legal.count++] = pseudo.moves[i];
    }
}
```

## 3) supported move classes
normal, capture, promotion, en passant, castling, and double pawn push are encoded.

```c
MOVE_FLAG_CAPTURE
MOVE_FLAG_PROMO
MOVE_FLAG_ENPASSANT
MOVE_FLAG_CASTLE
MOVE_FLAG_DOUBLE_PAWN
```

## references
<https://www.chessprogramming.org/Move_Generation>
