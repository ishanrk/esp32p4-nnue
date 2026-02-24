# Overview

## 1) product shape
the repo has three execution layers that are wired end to end.

```text
engine/    c runtime with uci and cli play mode
train/     python data, labeling, training, export
book/      mdbook docs with implementation notes
```

## 2) execution entry points
the engine speaks uci and can also run a local human playable cli.

```c
int main(int argc, char **argv) {
    if (argc > 1 && strcmp(argv[1], "--cli") == 0) {
        cli_loop();
        return 0;
    }
    uci_loop();
    return 0;
}
```

## 3) neural net flow
weights are trained in python and exported to a flat binary consumed by c.

```python
model = FactorizedHalfKP(input_dim=768, hidden_dim=64, output_dim=1)
export_nnue_weights(model, "train/nnue_weights.bin")
```

## references
<https://www.chessprogramming.org/>
<https://www.chessprogramming.org/NNUE>
