import {defineConfig} from "vite";
import {viteStaticCopy} from "vite-plugin-static-copy";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=dirname(fileURLToPath(import.meta.url));
const cesiumSource=resolve(root,"node_modules/cesium/Build/Cesium");
export default defineConfig({
 root,base:"/",
 define:{CESIUM_BASE_URL:JSON.stringify("/cesium/")},
 plugins:[viteStaticCopy({targets:["Workers","ThirdParty","Assets","Widgets"].map(name=>({src:resolve(cesiumSource,name),dest:"cesium"}))})],
 build:{outDir:"dist",emptyOutDir:true,assetsInlineLimit:0,chunkSizeWarningLimit:5000,rollupOptions:{input:{newtab:resolve(root,"index.html"),settings:resolve(root,"settings.html")}}}
});