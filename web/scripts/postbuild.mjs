import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const routes = ["guide", "architecture", "results", "reference-model", "status"];

for (const route of routes) {
  const directory = resolve(dist, route);
  mkdirSync(directory, { recursive: true });
  copyFileSync(resolve(dist, "index.html"), resolve(directory, "index.html"));
}
copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
