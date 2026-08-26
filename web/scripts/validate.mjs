import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const pieceAssets = [
  "bB", "bK", "bN", "bP", "bQ", "bR",
  "wB", "wK", "wN", "wP", "wQ", "wR",
]
  .map((piece) => `images/pieces/${piece}.svg`);
const required = [
  "index.html",
  "CNAME",
  ".nojekyll",
  "THIRD_PARTY_LICENSES.txt",
  "favicon.svg",
  "fonts/bodoni-moda-latin.woff2",
  "fonts/libre-baskerville-latin.woff2",
  "fonts/BODONI_MODA_OFL.txt",
  "fonts/LIBRE_BASKERVILLE_OFL.txt",
  "fonts/SOURCES.txt",
  "images/esp32-p4-module-dev-kit.jpg",
  "images/esp32-p4-test-setup.jpg",
  "images/esp32-p4-browser-game.jpg",
  "images/reference/SOURCES.txt",
  "images/reference/alpha-beta-tree.svg",
  "images/reference/chess-coordinates.svg",
  "images/reference/minimax-tree.svg",
  "images/reference/neural-network-layers.svg",
  "images/pieces/APACHE-2.0.txt",
  "images/pieces/COPYRIGHT.txt",
  "images/pieces/SOURCES.txt",
  ...pieceAssets,
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
if (output.some((file) => file.toLowerCase().includes("bungee"))) {
  throw new Error("obsolete Bungee font emitted");
}
if (output.some((file) => file.toLowerCase().includes("block-blueprint"))) {
  throw new Error("obsolete Block Blueprint font emitted");
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
  if (/<script\b|javascript:|(?:xlink:)?href=["']https?:/i.test(vectorSource)) {
    throw new Error(`active or remote vector content found in ${file}`);
  }
}

const guideSource = readFileSync(resolve(root, "src/guide.tsx"), "utf8");
if (!guideSource.includes("A Small Guide on How to Build Your Own Neural Networks Under Hardware Constraints")) {
  throw new Error("requested guide title is missing");
}
if (!guideSource.includes("Chess Programming Wiki") || !guideSource.includes("Code Monkey King")) {
  throw new Error("primary guide references are missing");
}
for (const codeReference of [
  "typedef uint64_t bitboard_t",
  "principal_variation_search",
  "quiescence_search",
  "class NnueNetwork",
  "build_model_blob",
  "app_main",
  "FrameDecoder",
]) {
  if (!guideSource.includes(codeReference)) {
    throw new Error(`guide code study missing ${codeReference}`);
  }
}
if (!guideSource.includes("/images/esp32-p4-browser-game.jpg")) {
  throw new Error("completed browser game photo is missing");
}

const appSource = readFileSync(resolve(root, "src/app.tsx"), "utf8");
if (!appSource.includes("Playing Your Own Chess Neural Network Hosted on a Microcontroller")) {
  throw new Error("requested play title is missing");
}
if (!appSource.includes("Waveshare") || !appSource.includes("ESP32 P4NRW32")) {
  throw new Error("play page hardware subtitle is missing");
}
if (!appSource.includes("uses NNUE inference")) {
  throw new Error("play page NNUE explanation is missing");
}
for (const removedDecoration of [
  "hero-chess-mark",
  "hero-piece",
  "connection-mark",
  "status-mark",
]) {
  if (appSource.includes(removedDecoration)) {
    throw new Error(`obsolete decoration remains ${removedDecoration}`);
  }
}

console.log(`validated play guide and ${output.length} production entries`);
