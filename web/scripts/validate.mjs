import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const routes = ["guide", "architecture", "results", "reference-model", "status"];
const files = [
  "index.html",
  "404.html",
  "CNAME",
  "fonts/block-blueprint.ttf",
  "generated/reference.nnue",
  "generated/reference.json",
  "generated/profile_comparison.json",
  "generated/reference_result.json",
  "generated/profiles.json",
  ...routes.map((route) => `${route}/index.html`),
];

for (const file of files) {
  const path = resolve(dist, file);
  if (!existsSync(path)) throw new Error(`missing build output ${file}`);
}
if (statSync(resolve(dist, "generated/reference.nnue")).size !== 328480) {
  throw new Error("reference model size mismatch");
}
if (readFileSync(resolve(dist, "CNAME"), "utf8").trim() !== "nnue.ishankumthekar.com") {
  throw new Error("custom domain mismatch");
}
const htmlFiles = ["index.html", ...routes.map((route) => `${route}/index.html`)];
for (const file of htmlFiles) {
  const html = readFileSync(resolve(dist, file), "utf8");
  if (!html.includes("id=\"root\"")) throw new Error(`invalid route output ${file}`);
}
console.log(`validated ${files.length} production files`);
