# Search

## 1) baseline algorithm
the engine runs negamax alpha beta with legal move expansion.

```c
I32 score = negamax(pos, -30000, 30000, depth, 0, &ctx, pv, &pv_len);
```

## 2) root output
search result reports best move, score, nodes, and principal variation.

```c
SearchResult r = search_position(&pos, &tt, 5);
```

## 3) uci integration
the `go` command triggers root search and prints best move.

```text
go depth 5
bestmove e2e4
```

## references
<https://www.chessprogramming.org/Alpha-Beta>
