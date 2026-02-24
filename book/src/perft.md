# Perft

## 1) purpose
perft verifies legal move generation by counting leaf nodes at fixed depth.

```text
fen | depth | expected_nodes
```

## 2) suite input
the test runner reads `engine/tests/perft_suite.txt`.

```text
startpos | 1 | 20
```

## 3) test command
run perft stub through ctest target.

```powershell
ctest --test-dir build -R test_perft
```

## references
<https://www.chessprogramming.org/Perft>
