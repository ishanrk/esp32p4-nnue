import type { Profile } from "./budget";

export type ProfileResult = {
  name: string;
  bucket_count: number;
  hidden_width: number;
  parameter_count: number;
  model_bytes: number;
  accumulator_bytes: number;
  seed_7: { best_epoch: number; validation_loss: number; validation_cp_mae: number };
  host: {
    integer_evaluations_per_second: number;
    position_bytes: number;
    undo_bytes: number;
    search: Record<string, { nodes: number; microseconds: number; nodes_per_second: number }>;
  };
  versus_8x64_depth_4: {
    games: number;
    wins?: number;
    draws?: number;
    losses?: number;
    score_percent?: number;
    elo?: number;
    elo_uncertainty_95?: number;
    note?: string;
  };
};

export type Comparison = {
  measurement_scope: Record<string, string>;
  common_training: Record<string, string | number | boolean>;
  profiles: ProfileResult[];
  finalist_match: Record<string, unknown>;
  selection: { profile: string; checkpoint_seed: number; reason: string; provisional_until_physical_hardware: boolean };
};

export type ReferenceManifest = {
  profile: string;
  model_format_version: number;
  feature_mapping_version: number;
  bucket_count: number;
  hidden_width: number;
  training_parameter_count: number;
  model_byte_size: number;
  activation: { name: string; clip: number };
  quantization: Record<string, string | number>;
  dataset: Record<string, string | number>;
  perspective_check: Record<string, string | number>;
  training: Record<string, string | number>;
  validation: Record<string, number>;
  test: Record<string, number | boolean>;
  export_saturation_counts: Record<string, number>;
  integer_parity: { positions: number; mismatches: number };
  arena_summary: Record<string, number>;
  host_benchmark: Record<string, string | number | boolean>;
  selection: { reason: string; provisional_until_physical_esp32_p4: boolean };
};

export type ReferenceResult = {
  final_test: { positions: number; transformed_loss: number; centipawn_mae: number };
  integer_parity: { positions: number; mismatches: number };
  arena: Record<string, unknown>;
  hardware: { esp32_p4: string };
};

export type SiteData = {
  profiles: Profile[];
  comparison: Comparison;
  reference: ReferenceManifest;
  referenceResult: ReferenceResult;
};

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`failed to load ${path}`);
  return response.json() as Promise<T>;
}

export async function loadSiteData(): Promise<SiteData> {
  const [profiles, comparison, reference, referenceResult] = await Promise.all([
    readJson<Profile[]>("/generated/profiles.json"),
    readJson<Comparison>("/generated/profile_comparison.json"),
    readJson<ReferenceManifest>("/generated/reference.json"),
    readJson<ReferenceResult>("/generated/reference_result.json"),
  ]);
  return { profiles, comparison, reference, referenceResult };
}
