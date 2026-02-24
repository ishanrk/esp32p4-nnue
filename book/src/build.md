# Build

## 1) configure and compile
use cmake to build all binaries from the `engine` directory.

```powershell
cmake -S engine -B build
cmake --build build
```

## 2) run test suite
all c tests run through ctest.

```powershell
ctest --test-dir build
```

## 3) build docs
mdbook emits static docs into `book/book`.

```powershell
mdbook build book
```

## references
<https://cmake.org/documentation/>
<https://rust-lang.github.io/mdBook/>
