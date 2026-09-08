import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";
import { tsImport } from "tsx/esm/api";
import { Chess } from "chess.js";
const {FrameDecoder,encodeFrame} = await tsImport("../src/protocol.ts",import.meta.url);

const root = resolve(import.meta.dirname,"../..");
const evidence = resolve(root,".private/evidence");
execFileSync("git",["check-ignore","-q",resolve(evidence,"after-play.png")],{cwd:root});
mkdirSync(evidence,{recursive:true});
const server = await preview({root:resolve(root,"web"),preview:{host:"127.0.0.1",port:4173,strictPort:true}});
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
const errors = [];
let host;
let scriptedMoves = [];
let currentFen;
try {
  const page = await browser.newPage({baseURL:"http://127.0.0.1:4173",viewport:{width:1366,height:900},reducedMotion:"reduce"});
  page.on("pageerror", error => errors.push(error.message));
  if(process.env.TRACE_HOST) page.on("console", message => console.log("browser",message.text()));
  for (const route of ["play","setup","integration","how-it-works","recorded","results"]) {
    await page.goto(`http://127.0.0.1:4173/#${route}`);
    await page.locator("h1").waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,route);
    const prose = await page.locator("main").evaluate(main => {
      const clone = main.cloneNode(true);
      clone.querySelectorAll("pre,code").forEach(node => node.remove());
      return clone.textContent;
    });
    assert.doesNotMatch(prose,/[-–—/]/,`public prose in ${route}`);
    assert.doesNotMatch(prose,/Physical engine|Game ready|The chip chooses each move/i);
    assert.doesNotMatch(await page.locator("main h1, main h2, main h3").allTextContents().then(texts => texts.join("\n")), /(?:^|\n)Why\b|\bis not\b/i);
    assert.doesNotMatch(await page.locator("main figcaption").allTextContents().then(texts => texts.join("\n")), /Photograph by Ishan Kumthekar/i);
    if (route === "play") {
      assert.equal(await page.locator("h1").innerText(), "ESP microcontroller chess engine");
      assert.equal(await page.locator('.connection-instructions li').count(), 2);
      assert.doesNotMatch(prose, /Board connection/);
    }
    assert.equal(await page.locator('main a[href*=".md"]').count(),0,`no raw Markdown destinations in ${route}`);
    const contrastFailures = await page.evaluate(() => {
      const rgb = value => value.match(/[\d.]+/g)?.map(Number);
      const luminance = color => color.slice(0,3).map(value => {
        const s = value/255; return s <= .04045 ? s/12.92 : ((s+.055)/1.055)**2.4;
      }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
      return [...document.querySelectorAll("main p, main h1, main h2, main h3, main a, main label, main summary, main th, main td, main button:not(:disabled), nav a")].flatMap(element => {
        if (!element.getBoundingClientRect().width || !element.textContent.trim()) return [];
        const style = getComputedStyle(element);
        const foreground = rgb(style.color);
        let ancestor = element, background;
        while (ancestor) {
          const color = rgb(getComputedStyle(ancestor).backgroundColor);
          if(color && (color.length===3 || color[3]===1)) { background=color; break; }
          ancestor=ancestor.parentElement;
        }
        if(!foreground || !background) return [];
        const values = [luminance(foreground),luminance(background)].sort((a,b)=>a-b);
        const ratio = (values[1]+.05)/(values[0]+.05);
        const large = parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && Number(style.fontWeight)>=700);
        return ratio + .01 >= (large ? 3 : 4.5) ? [] : [{text:element.textContent.slice(0,60),ratio}];
      });
    });
    assert.deepEqual(contrastFailures,[],`text contrast in ${route}`);
    const assets = await page.locator("main img").evaluateAll(images => images.map(image => image.getAttribute("src")));
    for (const asset of assets) assert.equal((await page.request.get(asset)).status(),200,asset);
    for (const link of await page.locator('main a[href^="/docs/"]').evaluateAll(xs=>xs.map(x=>x.getAttribute("href")))) assert.equal((await page.request.get(link)).status(),200,link);
    if (["play","setup","integration","how-it-works"].includes(route)) await page.screenshot({path:resolve(evidence,`after-${route}.png`)});
  }
  await page.goto("http://127.0.0.1:4173/#setup");
  await page.locator(".setup-connector img").scrollIntoViewIfNeeded();
  await page.locator(".setup-connector img").evaluate(image => image.decode());
  await page.locator(".setup-connector").screenshot({path:resolve(evidence,"after-setup-connector.png")});
  await page.locator(".setup-playing").scrollIntoViewIfNeeded();
  await page.locator(".setup-playing img").evaluate(image => image.decode());
  await page.locator(".setup-playing").screenshot({path:resolve(evidence,"after-setup-game-photo.png")});
  await page.goto("http://127.0.0.1:4173/#how-it-works");
  await page.getByRole("link",{name:"Search",exact:true}).click();
  assert.ok(await page.locator("#guide-search").evaluate(section => Math.abs(section.getBoundingClientRect().top) < 200));
  await page.goto("http://127.0.0.1:4173/#guide-inference");
  await page.locator("#guide-inference").waitFor();
  await page.waitForFunction(() => Math.abs(document.getElementById("guide-inference").getBoundingClientRect().top) < 200);
  for(const width of [390,768]) {
    await page.setViewportSize({width,height:844});
    await page.goto("http://127.0.0.1:4173/#play");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`play width ${width}`);
    await page.screenshot({path:resolve(evidence,`after-play-narrow-${width}.png`)});
    await page.goto("http://127.0.0.1:4173/#setup"); await page.locator("h1").waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`width ${width}`);
    await page.screenshot({path:resolve(evidence,`after-narrow-${width}.png`)});
    for (const route of ["integration", "how-it-works"]) {
      await page.goto(`http://127.0.0.1:4173/#${route}`);
      await page.locator("h1").waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`${route} width ${width}`);
      await page.screenshot({path:resolve(evidence,`after-${route}-narrow-${width}.png`)});
    }
  }
  await page.setViewportSize({width:1366,height:768});
  await page.goto("http://127.0.0.1:4173/#play");
  const boardBox = await page.locator(".chessboard").boundingBox();
  assert.ok(boardBox && boardBox.y + boardBox.height <= 768,"board fits laptop viewport");
  await page.screenshot({path:resolve(evidence,"after-play-laptop.png")});
  await page.setViewportSize({width:1366,height:900});
  await page.evaluate(()=>document.body.style.zoom="2");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,"200 percent CSS zoom");
  await page.screenshot({path:resolve(evidence,"after-zoom.png")});
  await page.evaluate(()=>document.body.style.zoom="");
  // Controlled bridge is only inside this test. The production page is unchanged.
  host = spawn(resolve(root,"build/p4hostdevice"), [], {stdio:["pipe","pipe","inherit"]});
  await page.exposeFunction("writeHost", async data => {
    const frame = new FrameDecoder().feed(Uint8Array.from(data))[0];
    if(frame.command===0x20) currentFen = new TextDecoder().decode(frame.payload);
    if(frame.command===0x21 && scriptedMoves.length) {
      // Deliberate legal promotion fixture, never represented as engine search.
      const move = scriptedMoves.shift();
      const game = new Chess(currentFen);
      game.move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]});
      const payload = new Uint8Array(29);
      payload[0]=move.length; payload.set(new TextEncoder().encode(move),1);
      const response = encodeFrame(0xa1,payload);
      await page.evaluate(bytes=>window.hostInput.enqueue(Uint8Array.from(bytes)),Array.from(response));
      return;
    }
    if(process.env.TRACE_HOST) console.log("write", Buffer.from(data).toString("hex"));
    await new Promise((resolve,reject)=>host.stdin.write(Buffer.from(data), error => error ? reject(error) : resolve()));
  });
  await page.addInitScript(() => {
    class HostPort extends EventTarget {
      async open() {
        console.debug("HostPort open");
        this.readable = new ReadableStream({start: controller => { window.hostInput = controller; }});
        this.writable = new WritableStream({write: data => window.writeHost(Array.from(data))});
      }
      async close() { window.hostInput = null; }
    }
    const port = new HostPort();
    Object.defineProperty(navigator,"serial",{configurable:true,value:Object.assign(new EventTarget(),{requestPort:async()=>{
      if(window.cancelNextChooser) { window.cancelNextChooser=false; throw new DOMException("Cancelled fixture","NotFoundError"); }
      console.debug("HostPort chooser"); return port;
    }})});
  });
  host.stdout.on("data", data => {
    if(process.env.TRACE_HOST) console.log("read",data.toString("hex"));
    void page.evaluate(bytes => window.hostInput?.enqueue(Uint8Array.from(bytes)),Array.from(data)).catch(error=>errors.push(error.message));
  });
  // Hash changes do not create a new document, so install the test bridge
  // through an actual navigation before loading the unchanged application.
  await page.goto("about:blank");
  await page.goto("http://127.0.0.1:4173/#play");
  await page.evaluate(()=>window.cancelNextChooser=true);
  await page.getByRole("button",{name:"Connect board",exact:true}).click();
  await page.getByText("No port was selected. Choose Connect board when you are ready.").waitFor();
  assert.equal(await page.locator(".game-status").evaluate(element=>element===document.activeElement),true);
  await page.getByRole("button",{name:"Connect board",exact:true}).click();
  try {
    await page.getByText("P4 classical host",{exact:true}).last().waitFor({timeout:15000});
  } catch (error) {
    console.error(await page.locator(".game-status").innerText(), errors);
    throw error;
  }
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await page.locator(".engine-response").waitFor({timeout:15000});
  assert.equal(await page.locator(".move-history li").count(),1);
  assert.ok((await page.locator(".move-history li").innerText()).includes("e4"));
  await page.screenshot({path:resolve(evidence,"custom-host-live-app-test.png")});
  await page.getByRole("button",{name:"Black",exact:true}).click();
  await page.locator(".engine-response").waitFor({timeout:15000});
  assert.equal(await page.locator(".chessboard").getAttribute("aria-label"),"chessboard from black side");
  assert.equal(await page.locator(".chessboard [data-square]").first().getAttribute("data-square"),"h1");
  await page.getByRole("button",{name:"disconnect board",exact:true}).click();
  await page.getByRole("button",{name:"Connect board",exact:true}).waitFor();
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),"BODY");
  await page.goto("http://127.0.0.1:4173/client-example.html");
  await page.locator("#connect").click();
  await page.getByText("Reply received. See the browser console for the move and device time.").waitFor({timeout:15000});
  await page.goto("http://127.0.0.1:4173/#play");
  scriptedMoves = ["h7h5","h5h4","h4h3","h3g2","g2h1q"];
  await page.getByRole("button",{name:"Connect board",exact:true}).click();
  await page.getByText("P4 classical host",{exact:true}).last().waitFor({timeout:15000});
  for(const move of ["a2a4","a4a5","a5a6","a6b7"]) {
    await page.locator(`[data-square="${move.slice(0,2)}"]`).click();
    await page.locator(`[data-square="${move.slice(2)}"]`).click();
    await page.waitForFunction(()=>!document.querySelector('[data-square="b7"]').disabled);
  }
  await page.locator('[data-square="b7"]').click();
  await page.locator('[data-square="a8"]').click();
  const dialog = page.getByRole("dialog",{name:"Choose promotion piece"});
  await dialog.waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.activeElement?.getAttribute("data-square")==="b7");
  await page.locator('[data-square="b7"]').click();
  await page.locator('[data-square="a8"]').click();
  await page.getByRole("button",{name:"Knight",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-square="a8"]').disabled);
  assert.match(await page.locator('[data-square="a8"]').getAttribute("aria-label"),/white knight/);
  await page.getByRole("button",{name:"disconnect board",exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log("Production app passed host engine exchange, both colors, legal promotion fixture, chooser cancellation, focus restoration, route assets, public copy, text contrast, laptop and narrow layouts, CSS zoom and keyboard smoke checks. No physical serial tested.");
} finally {
  host?.stdin.end();
  host?.kill();
  await browser.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
