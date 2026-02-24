# Factorized HalfKP

## 1) factorization goal
factorized halfkp style modeling separates piece features from deeper dense
blocks so runtime updates stay cheap and the model stays small.

```text
input planes -> compact hidden layer -> scalar score
```

## 2) practical baseline here
this engine currently uses a minimal nnue style 12x64 encoding and a small relu
network as the stable baseline while feature factorization evolves.

```python
self.fc1 = torch.nn.Linear(768, 64)
self.fc2 = torch.nn.Linear(64, 1)
```

## 3) migration path
the training and export format already isolate the model shape so factorized
halfkp indexing can be introduced without changing uci behavior.

```python
export_nnue_weights(model, "train/nnue_weights.bin")
```

## references
<https://www.chessprogramming.org/NNUE>
<https://www.chessprogramming.org/HalfKP>
