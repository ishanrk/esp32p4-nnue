# Move Encoding

## 1) packed layout
all move info fits in a single `U32`.

```text
bits 0..5    from square
bits 6..11   to square
bits 12..19  flags
bits 20..23  promotion piece
```

## 2) api calls
encode once and decode with cheap masking.

```c
Move m = move_make(SQUARE_E2, SQUARE_E4, MOVE_FLAG_DOUBLE_PAWN, 0);
Square from = move_from(m);
Square to = move_to(m);
U32 flags = move_flags(m);
```

## 3) uci conversion
human and protocol form stays in `e2e4` notation.

```c
char out[6];
move_to_uci(m, out);  // "e2e4"
```

## references
<https://www.chessprogramming.org/Encoding_Moves>
