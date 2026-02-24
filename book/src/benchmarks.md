# Benchmarks

## 1) nps bench
this target is where search throughput reporting will live.

```powershell
build/bench_nps
```

## 2) eval bench
this target measures pure eval speed, with and without nnue weights loaded.

```powershell
build/bench_eval
```

## 3) tt bench
this target tracks table probe hit ratio behavior under repeated searches.

```powershell
build/bench_tt
```

## references
<https://www.chessprogramming.org/Nodes_per_Second>
