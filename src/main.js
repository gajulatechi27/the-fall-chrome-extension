import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import locations from "./locations.json";
import "./style.css";

const caption = document.getElementById("place-name");
const status = document.getElementById("status");
const BUILDINGS_ASSET_ID = 96188;
const QUALITY = {
  low: { sse: 18, globeCache: 100, resolution: 0.75, shadows: false, buildingSse: 18, buildingCache: 96 },
  medium: { sse: 10, globeCache: 180, resolution: 1, shadows: true, buildingSse: 12, buildingCache: 192 },
  high: { sse: 6, globeCache: 280, resolution: 1.2, shadows: true, buildingSse: 7, buildingCache: 320 }
};
const clamp = Cesium.Math.clamp;
const rad = Cesium.Math.toRadians;
const rand = (a, b) => a + Math.random() * (b - a);
let viewer, terrainProvider, imageryProvider, buildings;
let settings = { fallQuality: "medium", osmBuildings: true };
let bag = [], previous = null, current = null, route = null;
let routeProgress = 0, routeDuration = 60, frame = 0, lastFrame = 0;
let running = false, retryDelay = 5000, retryTimer = 0, prefetchName = "", pendingDestination = null, pendingGround = null, preparingNext = false;

async function getSettings() {
  if (globalThis.chrome?.storage?.local) {
    const s = await chrome.storage.local.get(["cesiumIonToken", "fallQuality", "osmBuildings"]);
    return { ...s, fallQuality: s.fallQuality || "medium", osmBuildings: s.osmBuildings !== false };
  }
  return {
    cesiumIonToken: localStorage.getItem("cesiumIonToken"),
    fallQuality: localStorage.getItem("fallQuality") || "medium",
    osmBuildings: localStorage.getItem("osmBuildings") !== "false"
  };
}
function q() { return QUALITY[settings.fallQuality] || QUALITY.medium; }
function errorMessage(message) { status.textContent = message; status.classList.add("visible"); }
function clearMessage() { status.textContent = ""; status.classList.remove("visible"); }

function shuffleBag() {
  bag = [...locations];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  if (previous && bag[0]?.name === previous.name) [bag[0], bag[1]] = [bag[1], bag[0]];
}
function chooseNext() {
  if (!bag.length) shuffleBag();
  const next = bag.shift();
  if (previous && next.name === previous.name) return chooseNext();
  return next;
}
function updateQuality() {
  if (!viewer) return;
  const v = q();
  viewer.resolutionScale = v.resolution;
  viewer.scene.globe.maximumScreenSpaceError = v.sse;
  viewer.scene.globe.tileCacheSize = v.globeCache;
  viewer.scene.shadowMap.enabled = v.shadows;
  if (buildings) {
    buildings.maximumScreenSpaceError = v.buildingSse;
    buildings.cacheBytes = v.buildingCache * 1024 * 1024;
    buildings.maximumCacheOverflowBytes = 64 * 1024 * 1024;
  }
}
function createViewer() {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    requestRenderMode: false, scene3DOnly: true, baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider()
  });
  const scene = viewer.scene;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.fog.density = 0.000018;
  scene.fog.minimumBrightness = 0.25;
  scene.globe.depthTestAgainstTerrain = true;
  scene.postProcessStages.fxaa.enabled = true;
  scene.highDynamicRange = true;
  scene.postProcessStages.bloom.enabled = true;
  scene.postProcessStages.bloom.uniforms.glowOnly = false;
  scene.postProcessStages.bloom.uniforms.contrast = 96;
  scene.postProcessStages.bloom.uniforms.brightness = -0.12;
  scene.postProcessStages.bloom.uniforms.delta = 1.0;
  scene.postProcessStages.bloom.uniforms.sigma = 2.0;
  scene.postProcessStages.bloom.uniforms.stepSize = 1.0;
  scene.screenSpaceCameraController.minimumZoomDistance = 80;
  viewer.clock.shouldAnimate = true;
  updateQuality();
}
async function loadBuildings() {
  if (!viewer || buildings || !settings.osmBuildings) return;
  try {
    buildings = await Cesium.Cesium3DTileset.fromIonAssetId(BUILDINGS_ASSET_ID, {
      maximumScreenSpaceError: q().buildingSse,
      cacheBytes: q().buildingCache * 1024 * 1024,
      maximumCacheOverflowBytes: 64 * 1024 * 1024,
      dynamicScreenSpaceError: true
    });
    viewer.scene.primitives.add(buildings);
    buildings.show = settings.osmBuildings;
  } catch (e) {
    console.error("OSM Buildings asset 96188 failed:", e);
    errorMessage("OSM BUILDINGS UNAVAILABLE — CHECK ION ASSET ACCESS");
  }
}
async function connectWorldData(token) {
  Cesium.Ion.defaultAccessToken = token;
  terrainProvider = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true });
  viewer.terrainProvider = terrainProvider;
  imageryProvider = await Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL });
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(imageryProvider);
  await loadBuildings();
}
async function sampleGround(lat, lon) {
  try {
    const point = Cesium.Cartographic.fromDegrees(lon, lat);
    const result = await Cesium.sampleTerrainMostDetailed(terrainProvider, [point]);
    return Math.max(0, result[0]?.height || 0);
  } catch (e) {
    console.warn("Terrain sample failed; using ellipsoid height:", e);
    return 0;
  }
}
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2*p1 + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3);
}
function spline(keys, t) {
  const x = clamp(t, 0, 1) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(x));
  return catmull(keys[Math.max(0,i-1)], keys[i], keys[i+1], keys[Math.min(keys.length-1,i+2)], x-i);
}
function smooth(t) { return t*t*(3-2*t); }
function makeRoute(from, to, fromGround, toGround, first = false) {
  const start = Cesium.Cartographic.fromDegrees(from.lon, from.lat);
  const end = Cesium.Cartographic.fromDegrees(to.lon, to.lat);
  const geo = new Cesium.EllipsoidGeodesic(start, end);
  const distance = Math.max(1, geo.surfaceDistance);
  const cruise = clamp(distance * rand(0.075,0.13), 9000, 28000);
  const finalHeight = toGround + clamp(to.arrivalAltitude || 600, 300, 900);
  const initialHeight = first ? fromGround + rand(8500,11500) : fromGround + (from.arrivalAltitude || 600);
  const heights = [
    initialHeight,
    Math.max(initialHeight+1200, cruise*.55),
    cruise,
    cruise*rand(.82,1.08),
    Math.max(toGround+4500, cruise*.48),
    toGround+rand(1800,3200),
    finalHeight
  ];
  return {
    geo, distance, heights,
    duration: first ? rand(24,34) : clamp(distance/rand(220,340),38,105),
    pitch: rad(to.pitch ?? -28),
    lateral: rand(-0.018,0.018),
    drift: rand(.4,1.4),
    bank: rand(.012,.03),
    toGround
  };
}
function poseAt(t, now) {
  const r = route;
  const c = r.geo.interpolateUsingFraction(t);
  const height = Math.max(r.toGround + 300, spline(r.heights, t));
  const before = r.geo.interpolateUsingFraction(Math.max(0,t-.001));
  const after = r.geo.interpolateUsingFraction(Math.min(1,t+.001));
  const tangent = new Cesium.EllipsoidGeodesic(before, after);
  const heading = tangent.startHeading + Math.sin(now*.00012)*rad(r.drift);
  const offset = Math.sin(t*Math.PI)*r.distance*r.lateral;
  c.latitude += (offset/6378137)*Math.cos(heading);
  c.longitude += (offset/(6378137*Math.max(.15,Math.cos(c.latitude))))*Math.sin(heading);
  c.height = height;
  return {
    destination: Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,height),
    heading,
    pitch: Cesium.Math.lerp(rad(-12),r.pitch,smooth(t)),
    roll: Math.sin(t*Math.PI)*r.bank*Math.sin(now*.0003)
  };
}
function setInitialCamera(place, ground, altitude) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(place.lon,place.lat,ground+altitude),
    orientation: { heading:rad(place.heading||0), pitch:rad(-25), roll:0 }
  });
}
function changeCaption(place) {
  const el = document.getElementById("place-caption");
  el.classList.add("changing");
  window.setTimeout(() => { caption.textContent=place.name; el.classList.remove("changing"); },260);
}
async function prefetchAhead(place) {
  if (prefetchName === place.name) return;
  prefetchName = place.name;
  try {
    const samples=[];
    for (const d of [-.012,0,.012]) for (const e of [-.012,0,.012]) {
      samples.push(Cesium.Cartographic.fromDegrees(place.lon+e,place.lat+d));
    }
    const tasks=[Cesium.sampleTerrainMostDetailed(terrainProvider,samples)];
    if (imageryProvider?.tilingScheme) {
      const scheme=imageryProvider.tilingScheme;
      const center=Cesium.Cartographic.fromDegrees(place.lon,place.lat);
      for (const level of [9,11,13]) {
        const tile=scheme.positionToTileXY(center,level);
        if (tile) tasks.push(Promise.resolve(imageryProvider.requestImage(tile.x,tile.y,level)).catch(()=>null));
      }
    }
    await Promise.allSettled(tasks);
  } catch(e) { console.debug("Ahead-of-route cache warm-up skipped:",e); }
}
function prepareNextDestination() {
  if (pendingDestination) return;
  pendingDestination = chooseNext();
  pendingGround = sampleGround(pendingDestination.lat, pendingDestination.lon);
  prefetchAhead(pendingDestination);
}
async function nextLeg() {
  if (!pendingDestination) prepareNextDestination();
  const next = pendingDestination;
  const ground = await pendingGround;
  const from = current;
  route = makeRoute(from, next, from._ground || 0, ground);
  current = { ...next, _ground: ground };
  previous = next;
  pendingDestination = null;
  pendingGround = null;
  preparingNext = false;
  changeCaption(next);
  routeProgress = 0;
  routeDuration = route.duration;
  prepareNextDestination();
}
async function initialLeg() {
  const first=chooseNext();
  const ground=await sampleGround(first.lat,first.lon);
  current={...first,_ground:ground};
  previous=first;
  const initialAltitude = rand(8500,11500);
  const start = { ...first, lat: first.lat + 0.018, lon: first.lon - 0.018, arrivalAltitude: initialAltitude };
  setInitialCamera(start,ground,initialAltitude);
  route=makeRoute(start,first,ground,ground,false);
  prepareNextDestination();
  routeProgress=0;
  routeDuration=route.duration;
  caption.textContent=first.name;
}
function animate(now) {
  if (!running || document.hidden || !route) return;
  frame=requestAnimationFrame(animate);
  if (!lastFrame) lastFrame=now;
  const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));
  lastFrame=now;
  routeProgress=Math.min(1,routeProgress+dt/routeDuration);
  if (routeProgress >= 0.68 && !pendingDestination) prepareNextDestination();
  const p=poseAt(routeProgress,now);
  viewer.camera.setView({destination:p.destination,orientation:{heading:p.heading,pitch:p.pitch,roll:p.roll}});
  viewer.clock.currentTime=Cesium.JulianDate.fromDate(new Date());
  viewer.scene.fog.density=.000018;
  viewer.scene.requestRender();
  if (routeProgress>=1 && !preparingNext) {
    preparingNext=true;
    lastFrame=now;
    nextLeg().catch(e=>{
      console.error("Preparing next flight route failed:",e);
      preparingNext=false;
      errorMessage("ROUTE DATA TEMPORARILY UNAVAILABLE — RETRYING");
      window.setTimeout(()=>nextLeg().catch(console.error),2500);
    });
  }
}
function resume() {
  if (running || document.hidden || !route) return;
  running=true;
  lastFrame=0;
  frame=requestAnimationFrame(animate);
}
function pause() {
  running=false;
  cancelAnimationFrame(frame);
  lastFrame=0;
}
document.addEventListener("visibilitychange",()=>{ if(document.hidden) pause(); else resume(); });
window.addEventListener("resize",()=>viewer?.resize());

async function boot() {
  try {
    settings=await getSettings();
    if (!settings.cesiumIonToken) {
      errorMessage("ADD A CESIUM ION TOKEN IN SETTINGS TO START THE FLIGHT");
      return;
    }
    if (!viewer) createViewer();
    await connectWorldData(settings.cesiumIonToken);
    await initialLeg();
    clearMessage();
    retryDelay=5000;
    resume();
  } catch(e) {
    console.error("THE FALL startup error:",e);
    errorMessage("WORLD DATA CONNECTION FAILED — CHECK TOKEN OR NETWORK; RETRYING");
    clearTimeout(retryTimer);
    retryTimer=setTimeout(async()=>{
      try {
        settings=await getSettings();
        if (!settings.cesiumIonToken) return;
        await connectWorldData(settings.cesiumIonToken);
        if (!route) await initialLeg();
        clearMessage();
        resume();
      } catch(err) {
        console.error("THE FALL retry error:",err);
        retryDelay=Math.min(60000,retryDelay*2);
        errorMessage("STILL OFFLINE — AUTOMATIC RETRY CONTINUES");
        retryTimer=setTimeout(boot,retryDelay);
      }
    },retryDelay);
  }
}
if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(changes=>{
  if (changes.fallQuality) { settings.fallQuality=changes.fallQuality.newValue||"medium"; updateQuality(); }
  if (changes.osmBuildings) {
    settings.osmBuildings=changes.osmBuildings.newValue!==false;
    if (buildings) buildings.show=settings.osmBuildings;
    else if (settings.osmBuildings) loadBuildings();
  }
});
boot();
