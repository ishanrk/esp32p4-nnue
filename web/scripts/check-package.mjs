import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname,"../..");
const directory = mkdtempSync(join(tmpdir(),"serial-chess-consumer-"));
writeFileSync(join(directory,"package.json"),JSON.stringify({private:true,type:"module"}));
execFileSync("npm",["install","--ignore-scripts","--no-audit","--no-fund",resolve(root,"build/ishanrk-serial-chess-0.1.0-rc.1.tgz")],{cwd:directory,stdio:"inherit"});
writeFileSync(join(directory,"example.ts"),`
import { SerialChess } from '@ishanrk/serial-chess';
async function play(fen: string, signal: AbortSignal) {
  const board = await SerialChess.connect();
  try { const result = await board.search({fen}, {moveTimeMs: 2000, signal});
    const nodes: bigint = result.nodes;
    return {nodes, capabilities:board.capabilities};
  } finally { await board.disconnect(); }
}
void play;
`);
execFileSync(resolve(root,"web/node_modules/.bin/tsc"),["--noEmit","--target","ES2022","--module","NodeNext","--moduleResolution","NodeNext","--strict","example.ts"],{cwd:directory,stdio:"inherit"});
const documentation = readFileSync(resolve(root,"docs/BROWSER_CLIENT.md"),"utf8");
const documentedExample = documentation.match(/```ts\n([\s\S]*?)\n```/);
assert.ok(documentedExample,"public client example exists");
writeFileSync(join(directory,"documented-example.ts"),documentedExample[1]);
execFileSync(resolve(root,"web/node_modules/.bin/tsc"),["--noEmit","--target","ES2022","--module","NodeNext","--moduleResolution","NodeNext","--strict","documented-example.ts"],{cwd:directory,stdio:"inherit"});
const output = execFileSync(process.execPath,["--input-type=module","-e",`import {SerialChess} from '@ishanrk/serial-chess'; try {await SerialChess.connect()} catch(e) {console.log(e.code)}`],{cwd:directory,encoding:"utf8"});
assert.equal(output.trim(),"UNSUPPORTED_BROWSER");
const manifest = JSON.parse(readFileSync(join(directory,"node_modules/@ishanrk/serial-chess/package.json"),"utf8"));
assert.equal(manifest.license,"UNLICENSED");
assert.equal(manifest.private,true);
const contents = execFileSync("tar",["-tzf",resolve(root,"build/ishanrk-serial-chess-0.1.0-rc.1.tgz")],{encoding:"utf8"});
assert.doesNotMatch(contents,/\.private|study|images|\.test\./);
console.log(`Archive import, declarations, example and license status verified in ${directory}. Temporary consumer retained for inspection.`);
