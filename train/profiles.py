from __future__ import annotations

from dataclasses import dataclass
import json

ACTIVATION_CLIP = 127
FEATURES_PER_BUCKET = 640
FEATURE_MAPPING_VERSION = 2
FEATURE_QUANTIZATION = 64
MAX_ACTIVE_FEATURES = 30
MODEL_FORMAT_VERSION = 3
MODEL_HEADER_SIZE = 28
MODEL_OUTPUT_BIAS_SIZE = 4
MODEL_SIZE_LIMIT = 512 * 1024
OUTPUT_QUANTIZATION = 64
PERSPECTIVE_COUNT = 2
ACCUMULATOR_BIAS_MIN = -28928
ACCUMULATOR_BIAS_MAX = 28957


@dataclass(frozen=True)
class NnueProfile:
    name: str
    bucket_count: int
    hidden_width: int

    @property
    def accumulator_bytes(self) -> int:
        return 2 * 2 * self.hidden_width

    @property
    def feature_count(self) -> int:
        return self.bucket_count * FEATURES_PER_BUCKET

    @property
    def model_bytes(self) -> int:
        return (
            MODEL_HEADER_SIZE
            + MODEL_OUTPUT_BIAS_SIZE
            + self.feature_count * self.hidden_width
            + 3 * self.hidden_width * 2
        )

    @property
    def padding_feature(self) -> int:
        return self.feature_count

    @property
    def training_parameter_count(self) -> int:
        return (self.feature_count + 4) * self.hidden_width + 1


PROFILES = (
    NnueProfile("4x128", 4, 128),
    NnueProfile("8x64", 8, 64),
    NnueProfile("8x96", 8, 96),
    NnueProfile("16x48", 16, 48),
)
PROFILE_BY_NAME = {profile.name: profile for profile in PROFILES}
DEFAULT_PROFILE = PROFILE_BY_NAME["4x128"]


def get_profile(name: str) -> NnueProfile:
    try:
        return PROFILE_BY_NAME[name]
    except KeyError as error:
        raise ValueError(f"unknown nnue profile {name}") from error


def profile_from_dimensions(bucket_count: int, hidden_width: int) -> NnueProfile:
    for profile in PROFILES:
        if (
            profile.bucket_count == bucket_count
            and profile.hidden_width == hidden_width
        ):
            return profile
    raise ValueError(
        f"unsupported nnue profile {bucket_count}x{hidden_width}"
    )


def main() -> None:
    records = [
        {
            "accumulator_bytes": profile.accumulator_bytes,
            "bucket_count": profile.bucket_count,
            "hidden_width": profile.hidden_width,
            "model_bytes": profile.model_bytes,
            "name": profile.name,
            "training_parameter_count": profile.training_parameter_count,
            "within_512_kib": profile.model_bytes <= MODEL_SIZE_LIMIT,
        }
        for profile in PROFILES
    ]
    print(json.dumps(records, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
