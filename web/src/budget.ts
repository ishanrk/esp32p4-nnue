export const FEATURES_PER_BUCKET = 640;
export const MODEL_FIXED_BYTES = 32;
export const MODEL_WIDTH_BYTES = 6;
export const MODEL_CEILING_BYTES = 512 * 1024;

export type Profile = {
  name: string;
  bucket_count: number;
  hidden_width: number;
  model_bytes: number;
  accumulator_bytes: number;
  training_parameter_count: number;
  within_512_kib: boolean;
};

export type HardwareBudget = {
  modelBytes: number;
  accumulatorBytes: number;
  transpositionBytes: number;
  withinModelCeiling: boolean;
  compatibleProfile: string | null;
};

export function modelBytes(bucketCount: number, hiddenWidth: number): number {
  return MODEL_FIXED_BYTES
    + MODEL_WIDTH_BYTES * hiddenWidth
    + FEATURES_PER_BUCKET * bucketCount * hiddenWidth;
}

export function calculateBudget(
  bucketCount: number,
  hiddenWidth: number,
  transpositionMib: number,
  profiles: Profile[],
): HardwareBudget {
  const bytes = modelBytes(bucketCount, hiddenWidth);
  const compatible = profiles.find(
    (profile) => profile.bucket_count === bucketCount
      && profile.hidden_width === hiddenWidth,
  );
  return {
    modelBytes: bytes,
    accumulatorBytes: 4 * hiddenWidth,
    transpositionBytes: Math.round(transpositionMib * 1024 * 1024),
    withinModelCeiling: bytes <= MODEL_CEILING_BYTES,
    compatibleProfile: compatible?.name ?? null,
  };
}
