import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const required = [
  "index.html",
  "CNAME",
  ".nojekyll",
  "THIRD_PARTY_LICENSES.txt",
  "favicon.svg",
  "fonts/bungee-regular.ttf",
  "fonts/BUNGEE_LICENSE.txt",
  "images/esp32-p4-module-dev-kit.jpg",
  "images/esp32-p4-test-setup.jpg",
];
const removedRoutes = ["architecture", "results", "reference-model", "status"];

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
const html = readFileSync(resolve(dist, "index.html"), "utf8");
if (!html.includes('id="root"')) throw new Error("invalid root output");

const stylesheets = output.filter((file) => file.startsWith("assets/") && file.endsWith(".css"));
if (stylesheets.length !== 1) throw new Error("unexpected stylesheet output");
const stylesheet = readFileSync(resolve(dist, stylesheets[0]), "utf8");
if (!stylesheet.includes("grid-template-rows:repeat(8,minmax(0,1fr))")) {
  throw new Error("chessboard rows are not fixed to equal tracks");
}
const gradientFunction = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i;
if (gradientFunction.test(stylesheet)) {
  throw new Error("gradient styling reintroduced");
}

const vectorSources = [
  resolve(root, "src/pieces.tsx"),
  ...output.filter((file) => file.endsWith(".svg")).map((file) => resolve(dist, file)),
];
for (const file of vectorSources) {
  const vectorSource = readFileSync(file, "utf8");
  if (/<(?:linearGradient|radialGradient)\b|(?:fill|stroke)=["']url\(#/i.test(vectorSource)) {
    throw new Error(`gradient vector styling reintroduced in ${file}`);
  }
}

const guideSource = readFileSync(resolve(root, "src/guide.tsx"), "utf8");
if (/\b(?:how|why)\b/i.test(guideSource)) {
  throw new Error("guide contains forbidden question wording");
}

console.log(`validated play guide and ${output.length} production entries`);
