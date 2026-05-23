import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(webRoot, "..");
const generated = resolve(webRoot, "public/generated");
const required = [
  "models/reference.nnue",
  "models/reference.json",
  "results/profile_comparison.json",
  "results/reference.json",
];

for (const relative of required) {
  readFileSync(resolve(root, relative));
}

mkdirSync(generated, { recursive: true });
cpSync(resolve(root, "models/reference.nnue"), resolve(generated, "reference.nnue"));
cpSync(resolve(root, "models/reference.json"), resolve(generated, "reference.json"));
cpSync(
  resolve(root, "results/profile_comparison.json"),
  resolve(generated, "profile_comparison.json"),
);
cpSync(resolve(root, "results/reference.json"), resolve(generated, "reference_result.json"));

const profileText = execFileSync("python3", [resolve(root, "train/profiles.py")], {
  encoding: "utf8",
});
const profiles = JSON.parse(profileText);
for (const profile of profiles) {
  const calculated = 32 + 6 * profile.hidden_width
    + 640 * profile.bucket_count * profile.hidden_width;
  if (calculated !== profile.model_bytes) {
    throw new Error(`profile formula mismatch for ${profile.name}`);
  }
}
writeFileSync(resolve(generated, "profiles.json"), `${JSON.stringify(profiles, null, 2)}\n`);

for (const relative of required.filter((path) => path.endsWith(".json"))) {
  const text = readFileSync(resolve(root, relative), "utf8");
  JSON.parse(text);
  if (text.includes("/home/") || text.includes("build-real-")) {
    throw new Error(`private path in ${relative}`);
  }
}
