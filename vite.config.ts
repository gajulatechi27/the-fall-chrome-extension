import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: {
    format: "es",
    plugins: () => []
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022"
  }
});
