import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const cesiumBuild = resolve(root, "node_modules/cesium/Build/Cesium");

export default defineConfig({
  root,
  base: "/",
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  plugins: [
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((folder) => ({
        src: resolve(cesiumBuild, folder),
        dest: "cesium"
      }))
    })
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: {
        newtab: resolve(root, "index.html"),
        settings: resolve(root, "settings.html")
      }
    }
  }
});
