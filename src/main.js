import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./style.css";
const PLACES=[
{name:"Everest Region, Nepal",lat:27.9881,lon:86.9250,heading:35},
{name:"Varanasi Ghats, Uttar Pradesh",lat:25.3176,lon:83.0068,heading:15},
{name:"Mumbai, Maharashtra",lat:19.0760,lon:72.8777,heading:120},
{name:"Goa Coast, Goa",lat:15.4909,lon:73.8278,heading:35},
{name:"Hyderabad, Telangana",lat:17.3850,lon:78.4867,heading:25}];
const $=id=>document.getElementById(id),caption=$("place-name"),status=$("status"),fade=$("fade");
const QUALITY={low:{sse:20,res:.75,shadows:false},medium:{sse:12,res:1,shadows:true},high:{sse:6,res:1.25,shadows:true}};
async function getSettings(){if(globalThis.chrome?.storage?.local)return chrome.storage.local.get(["cesiumIonToken","googleMapsApiKey","fallQuality"]);return {cesiumIonToken:localStorage.getItem("cesiumIonToken"),googleMapsApiKey:localStorage.getItem("googleMapsApiKey"),fallQuality:localStorage.getItem("fallQuality")||"medium"};}
let viewer,terrain,tileset,quality="medium",active=false,raf=0,last=0,place,ground=0,height=9000,previous=-1;
const setStatus=s=>status.textContent=s;
function choose(){let n;do{n=Math.floor(Math.random()*PLACES.length)}while(n===previous);previous=n;return PLACES[n];}
async function initViewer(token){
 Cesium.Ion.defaultAccessToken=token;
 viewer=new Cesium.Viewer("cesiumContainer",{animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,requestRenderMode:false,scene3DOnly:true,baseLayer:false});
 const q=QUALITY[quality]||QUALITY.medium;viewer.resolutionScale=q.res;viewer.scene.globe.enableLighting=true;viewer.scene.globe.showGroundAtmosphere=true;viewer.scene.skyAtmosphere.show=true;viewer.scene.fog.enabled=true;viewer.scene.fog.density=.00016;viewer.scene.globe.depthTestAgainstTerrain=true;viewer.scene.shadowMap.enabled=q.shadows;viewer.scene.shadowMap.softShadows=true;viewer.scene.postProcessStages.fxaa.enabled=true;viewer.scene.postProcessStages.bloom.enabled=true;viewer.scene.highDynamicRange=true;viewer.scene.globe.maximumScreenSpaceError=q.sse;const brightness=viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createBrightnessStage());brightness.uniforms.brightness=0.035;const contrast=viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createContrastStage());contrast.uniforms.contrast=0.08;
 try{terrain=await Cesium.createWorldTerrainAsync({requestVertexNormals:true,requestWaterMask:true});viewer.terrainProvider=terrain;setStatus("CESIUM WORLD TERRAIN CONNECTED");}catch(e){console.warn("Terrain fallback",e);setStatus("WORLD TERRAIN UNAVAILABLE — ELLIPSOID FALLBACK");}
 try{const imagery=await Cesium.createWorldImageryAsync({style:Cesium.IonWorldImageryStyle.AERIAL});viewer.imageryLayers.removeAll();viewer.imageryLayers.addImageryProvider(imagery);}catch(e){console.warn("Satellite imagery unavailable",e);}
}
async function addGoogleTiles(key){
 if(!key){setStatus("REAL TERRAIN + SATELLITE IMAGERY · GOOGLE KEY OPTIONAL");return;}
 try{tileset=await Cesium.Cesium3DTileset.fromUrl("https://tile.googleapis.com/v1/3dtiles/root.json?key="+encodeURIComponent(key),{showCreditsOnScreen:true,maximumScreenSpaceError:QUALITY[quality].sse,maximumMemoryUsage:512,dynamicScreenSpaceError:true});viewer.scene.primitives.add(tileset);viewer.scene.globe.show=false;setStatus("GOOGLE PHOTOREALISTIC 3D TILES CONNECTED");}
 catch(e){console.warn("Google tiles unavailable; using real terrain + imagery",e);viewer.scene.globe.show=true;setStatus("3D CITY TILES UNAVAILABLE · REAL TERRAIN FALLBACK");}
}
async function sampleGround(p){try{if(!terrain)return 0;const c=Cesium.Cartographic.fromDegrees(p.lon,p.lat);const result=await Cesium.sampleTerrainMostDetailed(terrain,[c]);return result[0]?.height||0;}catch(e){console.warn("Height sample failed",e);return 0;}}
function setCamera(h,now){const dest=Cesium.Cartesian3.fromDegrees(place.lon,place.lat,h);const heading=Cesium.Math.toRadians(place.heading+Math.sin(now*.00013)*1.6);const progress=Cesium.Math.clamp((9000-height)/8500,0,1);const pitch=Cesium.Math.toRadians(-70+progress*7);viewer.camera.setView({destination:dest,orientation:{heading,pitch,roll:Math.sin(now*.0002)*.005}});}
async function startDescent(){if(!viewer||document.hidden)return;active=false;cancelAnimationFrame(raf);fade.classList.add("visible");await new Promise(r=>setTimeout(r,800));if(document.hidden)return;place=choose();caption.textContent=place.name;ground=await sampleGround(place);if(document.hidden)return;height=9000;setCamera(ground+height,performance.now());fade.classList.remove("visible");active=true;last=performance.now();setStatus("DESCENDING · "+place.name.toUpperCase());animate();}
function animate(now){if(!active||document.hidden)return;raf=requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;height=Math.max(350,height-155*dt);setCamera(ground+height,now);const progress=1-height/9000;viewer.scene.fog.density=.00012+progress*.00024;const q=QUALITY[quality]||QUALITY.medium;viewer.scene.globe.maximumScreenSpaceError=Cesium.Math.lerp(q.sse,Math.max(2,q.sse*.45),progress);viewer.clock.currentTime=Cesium.JulianDate.fromDate(new Date());viewer.scene.requestRender();if(height<=350){active=false;fade.classList.add("visible");setStatus("LANDING · "+place.name.toUpperCase());setTimeout(startDescent,1800);}}
document.addEventListener("visibilitychange",()=>{if(document.hidden){active=false;cancelAnimationFrame(raf);}else if(viewer)startDescent();});
window.addEventListener("resize",()=>viewer?.resize());
async function boot(){try{const s=await getSettings();quality=s.fallQuality||"medium";if(!s.cesiumIonToken){setStatus("ADD CESIUM ION TOKEN IN SETTINGS");caption.textContent="Real-world descent awaits your API keys";return;}await initViewer(s.cesiumIonToken);await addGoogleTiles(s.googleMapsApiKey);await startDescent();}catch(e){console.error(e);setStatus("SCENE LOAD FAILED · CHECK API KEYS");caption.textContent="Open settings to verify access";}}
boot();