from __future__ import annotations

from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "train"))

from profiles import (
    ACTIVATION_CLIP,
    DEFAULT_PROFILE,
    FEATURES_PER_BUCKET,
    FEATURE_QUANTIZATION,
    MODEL_FORMAT_VERSION,
    OUTPUT_QUANTIZATION,
    PERSPECTIVE_COUNT,
)


MAGIC = b"P4NNUE1\0"


def build_smoke_model() -> bytes:
    profile = DEFAULT_PROFILE
    header = struct.pack(
        "<8s8HI",
        MAGIC,
        MODEL_FORMAT_VERSION,
        profile.bucket_count,
        FEATURES_PER_BUCKET,
        profile.hidden_width,
        ACTIVATION_CLIP,
        FEATURE_QUANTIZATION,
        OUTPUT_QUANTIZATION,
        PERSPECTIVE_COUNT,
        profile.model_bytes,
    )
    return header + bytes(profile.model_bytes - len(header))


def main() -> None:
    output = Path(sys.argv[1])
    output.write_bytes(build_smoke_model())


if __name__ == "__main__":
    main()
