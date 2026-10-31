import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const cesiumBuild = resolve(root, "node_modules/cesium/Build/Cesium");

const knockoutCspPatch = {
  name: "knockout-csp-global-probe",
  renderChunk(code) {
    // Knockout 3.5.1 uses (0, eval)("this") only to obtain the global object.
    // Replace that exact probe; keep MV3's prohibition on dynamic evaluation.
    return {
      code: code.replace(/\(0,\s*eval\)\(["']this["']\)/g, "window"),
      map: null
    };
  }
};

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
    }),
    knockoutCspPatch
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
