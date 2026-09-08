import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const publicDocs = ["PROTOCOL.md", "INTEGRATION.md", "BROWSER_CLIENT.md", "QUICKSTART.md", "MEASUREMENTS.md", "WORK_STATUS.md", "LICENSE_STATUS.md"];

export default defineConfig({
  plugins: [react(), {
    name: "public-reference-documents",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.replace(/^\/docs\//, "");
        if (!request.url?.startsWith("/docs/") || !publicDocs.includes(name ?? "")) return next();
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(readFileSync(resolve(import.meta.dirname, "../docs", name!)));
      });
    },
    generateBundle() {
      for (const name of publicDocs) this.emitFile({type: "asset", fileName: `docs/${name}`, source: readFileSync(resolve(import.meta.dirname, "../docs", name))});
    },
  }],
  build: {
    target: "es2022",
    rollupOptions: {input: {app: resolve(import.meta.dirname,"index.html"), example: resolve(import.meta.dirname,"client-example.html")}},
  },
});
