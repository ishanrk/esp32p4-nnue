import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const required = ["index.html", "CNAME", ".nojekyll", "THIRD_PARTY_LICENSES.txt"];
const removedRoutes = ["guide", "architecture", "results", "reference-model", "status"];

for (const file of required) {
  if (!existsSync(resolve(dist, file))) throw new Error(`missing build output ${file}`);
}

if (readFileSync(resolve(dist, "CNAME"), "utf8").trim() !== "nnue.ishankumthekar.com") {
  throw new Error("custom domain mismatch");
}

const output = readdirSync(dist, { recursive: true }).map(String);
for (const route of removedRoutes) {
  if (output.some((file) => file === route || file.startsWith(`${route}/`))) {
    throw new Error(`obsolete route emitted ${route}`);
  }
}
if (output.some((file) => file === "generated" || file.startsWith("generated/"))) {
  throw new Error("obsolete generated data emitted");
}
if (output.some((file) => file === "fonts" || file.startsWith("fonts/"))) {
  throw new Error("obsolete guide font emitted");
}

const html = readFileSync(resolve(dist, "index.html"), "utf8");
if (!html.includes('id="root"')) throw new Error("invalid root output");

console.log(`validated root app and ${output.length} production entries`);
