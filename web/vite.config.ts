import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/mbo-automation/",
  resolve: {
    alias: {
      "@data": path.resolve(rootDir, "../data")
    }
  },
  server: {
    fs: {
      allow: [path.resolve(rootDir, "..")]
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
