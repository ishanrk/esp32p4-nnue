# Zobrist

## 1) current status
hash api exists and is called through the position subsystem.

```c
void zobrist_init(void);
U64 zobrist_hash(const Position *pos);
```

## 2) incremental target
the end goal is to update keys inside make and unmake without full recompute.

```c
undo->zobrist = pos->zobrist;
pos->zobrist ^= piece_square_key;
```

## 3) usage with tt
transposition table entries depend on stable position keys.

```c
TTEntry e;
if (tt_probe(&tt, pos.zobrist, &e)) {
    // reuse cached search info
}
```

## references
<https://www.chessprogramming.org/Zobrist_Hashing>
