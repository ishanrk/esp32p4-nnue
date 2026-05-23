import { readFileSync } from "node:fs";

import { calculateBudget, modelBytes, type Profile } from "./budget";
import { migration } from "./migration";

const profiles = JSON.parse(
  readFileSync(new URL("../public/generated/profiles.json", import.meta.url), "utf8"),
) as Profile[];

for (const profile of profiles) {
  if (modelBytes(profile.bucket_count, profile.hidden_width) !== profile.model_bytes) {
    throw new Error(`model byte mismatch for ${profile.name}`);
  }
  const budget = calculateBudget(
    profile.bucket_count,
    profile.hidden_width,
    0.25,
    profiles,
  );
  if (budget.compatibleProfile !== profile.name) {
    throw new Error(`compatibility mismatch for ${profile.name}`);
  }
  if (budget.accumulatorBytes !== profile.accumulator_bytes) {
    throw new Error(`accumulator mismatch for ${profile.name}`);
  }
}

const expectedPages = [
  "overview", "build", "firmware", "bitboards", "position",
  "move_encoding", "movegen", "makemove", "zobrist", "perft", "search",
  "quiescence", "eval_classic", "nnue_inference", "factorized_halfkp",
  "nnue_profiles", "train_model", "training_parameters", "training_pipeline",
  "testing", "benchmarks",
];
const migrated = new Set(migration.map((entry) => entry.source));
for (const page of expectedPages) {
  if (!migrated.has(page as (typeof migration)[number]["source"])) {
    throw new Error(`missing migration for ${page}`);
  }
}
if (migration.length !== expectedPages.length) throw new Error("unexpected migration count");

console.log(`checked ${profiles.length} profiles and ${migration.length} migrated pages`);
