# Eval Classic

## 1) current terms
classic eval currently uses material only, signed by side to move.

```c
static const I32 piece_value[7] = {0, 100, 320, 330, 500, 900, 0};
```

## 2) fallback behavior
when nnue weights are missing, classic eval is the active path.

```c
if (nnue_is_loaded()) return eval_nnue(pos);
return eval_classic(pos);
```

## 3) next terms
piece square tables and structure terms can be appended without api changes.

```c
score += pst[piece][square];
score += king_safety_term;
```

## references
<https://www.chessprogramming.org/Evaluation>
