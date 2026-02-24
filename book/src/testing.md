# Testing

## 1) unit target
the unit binary validates base harness and assertions.

```powershell
ctest --test-dir build -R test_unit
```

## 2) perft target
perft target verifies suite parsing and depth loop plumbing.

```powershell
ctest --test-dir build -R test_perft
```

## 3) search target
search test accepts fen and depth and runs engine search path.

```powershell
build/test_search "startpos" 4
```

## references
<https://cmake.org/cmake/help/latest/manual/ctest.1.html>
