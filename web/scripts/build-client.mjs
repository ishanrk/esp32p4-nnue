import { build } from "vite";
import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const sdk = resolve(root, "sdk");
await build({configFile: false, publicDir: false, root: resolve(root,"web"), build: {
  target: "es2022", outDir: resolve(sdk,"dist"), emptyOutDir: true,
  lib: {entry: resolve(root,"web/src/client.ts"), formats: ["es"], fileName: () => "serial-chess.js"},
  rollupOptions: {external: ["chess.js"]},
}});
execFileSync(resolve(root,"web/node_modules/.bin/tsc"), [
  "--target","ES2022","--module","ESNext","--moduleResolution","Bundler",
  "--declaration","--emitDeclarationOnly","--strict","--skipLibCheck",
  "--outDir",resolve(sdk,"dist"),resolve(root,"web/src/client.ts"),
], {cwd:root,stdio:"inherit"});
copyFileSync(resolve(root,"docs/LICENSE_STATUS.md"),resolve(sdk,"LICENSE_STATUS.md"));
copyFileSync(resolve(root,"web/public/THIRD_PARTY_LICENSES.txt"),resolve(sdk,"THIRD_PARTY_LICENSES.txt"));
const output = readdirSync(resolve(sdk,"dist"));
// Declarations also work for consumers using NodeNext module resolution.
for (const name of output.filter(name => name.endsWith(".d.ts"))) {
  const path = resolve(sdk,"dist",name);
  writeFileSync(path,readFileSync(path,"utf8").replace(/from "(\.\/[^"]+?)(?:\.js)?"/g,'from "$1.js"'));
}
if (!output.includes("client.d.ts") || output.some(name => /private|test|app|guide/i.test(name))) throw new Error("Unexpected client package contents");
const source = readFileSync(resolve(sdk,"dist/serial-chess.js"),"utf8");
if (/from ["']react/.test(source)) throw new Error("Client must not import React");
mkdirSync(resolve(root,"build"), {recursive:true});
execFileSync("tar", ["-czf",resolve(root,"build/serial-chess-adapter-0.1.0-rc.1.tar.gz"),
  "esp/protocol.h","esp/protocol.c","esp/serial_adapter.h","esp/serial_adapter.c",
  "examples/host_device.c","docs/PROTOCOL.md","docs/INTEGRATION.md","docs/LICENSE_STATUS.md",
],{cwd:root,stdio:"inherit"});
console.log("Built local browser client and portable adapter candidate. Nothing published.");
