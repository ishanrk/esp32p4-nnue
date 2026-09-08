import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname,"../..");
const paths = ["README.md","sdk/README.md",...readdirSync(resolve(root,"docs")).filter(name=>name.endsWith(".md")).map(name=>`docs/${name}`)];
const failures = [];
for (const path of paths) {
  let fenced = false;
  readFileSync(resolve(root,path),"utf8").split("\n").forEach((line,index)=>{
    if (/^\s*```/.test(line)) {fenced=!fenced;return;}
    if (fenced || /^\s*\|?[\s:|\-]+$/.test(line)) return;
    const prose = line.replace(/`[^`]*`/g,"").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/^\s*[-*]\s+/,"");
    if (/[-–—/]/.test(prose)) failures.push(`${path}:${index+1}: ${line}`);
  });
}
if(failures.length) throw new Error("Public prose punctuation violations:\n"+failures.join("\n"));
console.log(`Checked authored prose in ${paths.length} Markdown documents. Code, paths and link targets are preserved.`);
