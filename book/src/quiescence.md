# Quiescence

## 1) stand pat
qsearch starts from static eval and updates alpha immediately.

```c
I32 stand_pat = eval_position(pos);
if (stand_pat > alpha) alpha = stand_pat;
```

## 2) capture only expansion
the current path searches captures only at q nodes.

```c
if ((move_flags(m) & MOVE_FLAG_CAPTURE) == 0) {
    continue;
}
```

## 3) tactical stability
this removes many horizon artifacts at leaf depth.

```c
I32 score = -search_qsearch(pos, -beta, -alpha, depth - 1);
```

## references
<https://www.chessprogramming.org/Quiescence_Search>
