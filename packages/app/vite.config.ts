import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The dev server proxies API and sprite requests to the PixyGoat server so the
// app can be developed with hot reload while the catalog and sprites come from
// the real spritesheet directory.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4600",
      "/sprites": "http://localhost:4600",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  worker: {
    format: "es",
  },
});
