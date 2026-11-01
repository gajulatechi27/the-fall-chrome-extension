import * as THREE from "three";
import { createSky } from "./sky.js";
import { CloudField } from "./clouds.js";
import { Terrain } from "./terrain.js";
import { CinematicEffects } from "./effects.js";
import "./style.css";

const canvas = document.querySelector("#world");
const fade = document.querySelector("#fade");
const label = document.createElement("div");
label.id = "scene-label";
document.body.appendChild(label);

const isSmall = matchMedia("(max-width:700px)").matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false, alpha: false, logarithmicDepthBuffer: true });
let quality = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(quality);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 1.5, 30000);
const sceneTypes = [
  { id: "himalayas", name: "Himalayan Peaks & Glaciers" },
  { id: "green", name: "Green Hills & Terraced Valleys" },
  { id: "delta", name: "Winding River & Farmland" },
  { id: "lake", name: "Alpine Lake & Mountains" },
  { id: "coast", name: "Coast, Beaches & Islands" },
  { id: "desert", name: "Desert Dunes & Red Canyons" },
  { id: "forest", name: "Dense Forest & Waterfall" },
  { id: "rainforest", name: "Misty Rainforest Valley" }
];
const weatherTypes = ["clear", "light clouds", "heavy clouds", "mist", "rain", "storm"];
let sky, clouds, terrain, effects;
let seed = 0, activeScene = sceneTypes[0], weather = "clear";
let elapsed = 0, altitude = 4000, speed = 145, sceneDuration = 24;
let running = false, paused = false, transitioning = false, frame = 0;
let fps = 0, fpsFrames = 0, fpsElapsed = 0, pitchDegrees = -48;
let previousSceneId = "";
let sceneClock = new THREE.Clock();
let transitionTimer = 0;
let worldDistance = 0;
let verticalVelocity = 0;
let terrainHeightUnder = 0;
let cameraClearance = 0;
let groundWarning = "";

const params = new URLSearchParams(location.search);
const testMode = ["scene","seed","time","weather","freeze","speed"].some(k => params.has(k));
let terrainDebugOptions = { wireframe:false, lodColors:false, chunkBorders:false, trees:true };
const sceneAliases = { himalaya:"himalayas", hills:"green", river:"delta", lake:"lake", coast:"coast", desert:"desert", forest:"forest", rainforest:"rainforest" };
const sceneParam = id => ({himalayas:"himalaya",green:"hills",delta:"river"}[id] || id);
const weatherParam = value => value === "clouds" ? "light clouds" : value;
const testSettings = {
  scene: params.get("scene") || "hills",
  seed: params.has("seed") && Number.isFinite(Number(params.get("seed"))) ? Number(params.get("seed")) : Math.floor(Math.random() * 0x7fffffff),
  time: ["dawn","noon","sunset","night"].includes(params.get("time")) ? params.get("time") : "noon",
  weather: ["clear","clouds","mist","rain","storm"].includes(params.get("weather")) ? params.get("weather") : "clear",
  freeze: params.get("freeze") === "1",
  speed: params.has("speed") && Number.isFinite(Number(params.get("speed"))) ? Math.max(0, Number(params.get("speed"))) : null
};


const debug = document.createElement("pre");
debug.id = "fall-debug";
debug.style.cssText = "display:none;position:fixed;z-index:30;left:12px;top:12px;margin:0;padding:12px 14px;max-width:min(520px,calc(100vw - 24px));background:rgba(3,12,20,.84);color:#d8f3ff;border:1px solid rgba(180,220,240,.35);border-radius:8px;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
document.body.appendChild(debug);
let debugVisible = false;
document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "d" && !event.repeat) {
    debugVisible = !debugVisible;
    debug.style.display = debugVisible ? "block" : "none";
  }
});

const randomSeed = () => Math.floor(Math.random() * 0x7fffffff);
function chooseScene() {
  const choices = sceneTypes.filter(item => item.id !== previousSceneId);
  const next = choices[Math.floor(Math.random() * choices.length)];
  previousSceneId = next.id;
  return next;
}
function disposeScene() {
  try { effects?.dispose(); } catch (error) { console.warn("Effects cleanup", error); }
  effects = undefined;
  try { sky?.dispose(); } catch (error) { console.warn("Sky cleanup", error); }
  sky = undefined;
  try { clouds?.dispose(); } catch (error) { console.warn("Cloud cleanup", error); }
  clouds = undefined;
  try { terrain?.dispose(); } catch (error) { console.warn("Terrain cleanup", error); }
  terrain = undefined;
  scene.clear();
}
function createScene(nextScene, nextSeed, forcedWeather = null) {
  activeScene = nextScene;
  seed = nextSeed;
  elapsed = 0;
  sceneDuration = 22 + (seed % 5000) / 625; // 22–30 seconds
  weather = forcedWeather || weatherTypes[(seed >>> 5) % weatherTypes.length];
  altitude = 4000;
  verticalVelocity = 0;
  sky = createSky(scene, renderer, seed, activeScene.id, weather, testMode ? testSettings.time : "noon");
  scene.background = sky.horizonColor.clone();
  scene.fog = activeScene.id === "himalayas" ? new THREE.FogExp2(sky.horizonColor, weather === "mist" ? 0.000052 : 0.000027) : new THREE.Fog(sky.horizonColor, 900, weather === "mist" || weather === "storm" ? 8500 : 18500);
  terrain = new Terrain(scene, seed, activeScene.id);
  const initialGround = Math.max(terrain.getHeightAt(camera.position.x, camera.position.z), terrain.getWaterLevel());
  camera.position.y = initialGround + (testMode && testSettings.freeze ? 80 : 400);
  clouds = new CloudField(scene, seed, weather);
  try {
    effects = new CinematicEffects(renderer, scene, camera, quality, weather);
  } catch (error) {
    console.error("Effects unavailable; using direct renderer.", error);
    effects = undefined;
  }
  label.textContent = activeScene.name;
  label.classList.add("visible");
  if (testMode && testSettings.freeze) {
    camera.lookAt(camera.position.x + 1350, camera.position.y - Math.tan(THREE.MathUtils.degToRad(25)) * 1350, camera.position.z - 1350);
    camera.rotation.z = 0;
  }
}
function beginTransition() {
  if (transitioning) return;
  transitioning = true;
  transitionTimer = 0;
  fade.classList.add("dissolve");
}
function altitudeAt(t) {
  const fallEnd = 7.2;
  const lowEnd = sceneDuration - 5.5;
  if (t < fallEnd) return THREE.MathUtils.lerp(4000, 600, THREE.MathUtils.smoothstep(t, 0, fallEnd));
  if (t < lowEnd) return 600 + Math.sin(t * 0.8) * 35;
  return THREE.MathUtils.lerp(600, 3200, THREE.MathUtils.smoothstep(t, lowEnd, sceneDuration));
}
function speedAt(t) {
  if (t < 7.2) return THREE.MathUtils.lerp(195, 135, THREE.MathUtils.smoothstep(t, 0, 7.2));
  if (t < sceneDuration - 5.5) return 78 + Math.sin(t * 1.7) * 12;
  return THREE.MathUtils.lerp(82, 155, THREE.MathUtils.smoothstep(t, sceneDuration - 5.5, sceneDuration));
}
function animate() {
  if (!running || paused || document.hidden) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min(sceneClock.getDelta(), 0.033);
  elapsed += dt;
  speed = testMode && testSettings.speed !== null ? testSettings.speed : speedAt(elapsed);

  worldDistance += speed * dt;

  const fall = THREE.MathUtils.smoothstep(elapsed, 0, 7.2);
  const climb = THREE.MathUtils.smoothstep(elapsed, sceneDuration - 5.5, sceneDuration);
  const turn = Math.sin(elapsed * 0.22) * 0.62 + Math.sin(elapsed * 0.51) * 0.12;
  const lateral = Math.sin(elapsed * 0.31) * 210 + Math.sin(elapsed * 0.83) * 42;
  if (!(testMode && testSettings.freeze)) {
    camera.position.x = lateral;
    camera.position.z -= speed * 0.1 * dt;
  }
  // A small banking turn and a stronger downward attitude during the initial dive.
  // Aim below and ahead so every biome occupies the view, not just the horizon.
  const verticalDrop = THREE.MathUtils.lerp(420, 65, fall) + climb * 45;
  const lookAhead = 1500;
  const bank = Math.sin(elapsed * 0.27) * 0.13;
  camera.rotation.order = "YXZ";
  if (testMode && testSettings.freeze) {
    camera.lookAt(camera.position.x + 1350, camera.position.y - Math.tan(THREE.MathUtils.degToRad(25)) * 1350, camera.position.z - 1350);
  } else {
    camera.lookAt(camera.position.x + Math.sin(turn * 0.28) * lookAhead, camera.position.y - verticalDrop, camera.position.z - lookAhead);
    camera.rotateZ(-bank);
  }
  pitchDegrees = -THREE.MathUtils.radToDeg(Math.atan2(verticalDrop, lookAhead));

  const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  const h0 = terrain.getHeightAt(camera.position.x, camera.position.z);
  const h50 = terrain.getHeightAt(camera.position.x + forward.x * 5, camera.position.z + forward.z * 5);
  const h150 = terrain.getHeightAt(camera.position.x + forward.x * 15, camera.position.z + forward.z * 15);
  const h400 = terrain.getHeightAt(camera.position.x + forward.x * 40, camera.position.z + forward.z * 40);
  terrainHeightUnder = h0;
  const ridgeHeight = Math.max(h0, h50, h150, h400);
  const ridgeClearance = ridgeHeight > 180 || ridgeHeight - h0 > 35 ? 15 : 6;
  const waterFloor = terrain.getWaterLevel() + 4;
  const collisionFloor = Math.max(ridgeHeight + ridgeClearance, waterFloor);
  const lowTargetX = camera.position.x + forward.x * 120;
  const lowTargetZ = camera.position.z + forward.z * 120;
  const targetGround = Math.max(terrain.getHeightAt(lowTargetX, lowTargetZ), terrain.getWaterLevel());
  const fallPhase = THREE.MathUtils.smoothstep(elapsed, 0, 7.2);
  const climbPhase = THREE.MathUtils.smoothstep(elapsed, sceneDuration - 5.5, sceneDuration);
  const plannedClearance = targetGround > 180 ? 15 : 8;
  const plannedY = targetGround + THREE.MathUtils.lerp(400, plannedClearance, fallPhase) + climbPhase * 210;
  const desiredY = testMode && testSettings.freeze ? camera.position.y : Math.max(plannedY, collisionFloor);
  const spring = 13;
  const damping = 2 * Math.sqrt(spring) * 0.92;
  const acceleration = (desiredY - camera.position.y) * spring - verticalVelocity * damping;
  verticalVelocity += acceleration * dt;
  camera.position.y += verticalVelocity * dt;
  cameraClearance = camera.position.y - terrainHeightUnder;
  groundWarning = "";
  if (camera.position.y < terrainHeightUnder + 1) {
    camera.position.y = terrainHeightUnder + Math.max(ridgeClearance, 6);
    verticalVelocity = Math.max(0, verticalVelocity);
    groundWarning = "SAFETY TELEPORT: camera was below terrain";
    console.warn(groundWarning, { cameraY: camera.position.y, terrainHeightUnder });
  } else if (camera.position.y < collisionFloor) {
    groundWarning = "WARNING: below sampled ground clearance";
    console.warn(groundWarning, { cameraY: camera.position.y, collisionFloor });
  }
  altitude = camera.position.y * 10;

  const targetFov = THREE.MathUtils.mapLinear(speed, 60, 200, 60, 85);
  camera.fov = THREE.MathUtils.damp(camera.fov, THREE.MathUtils.clamp(targetFov, 60, 85), 4.5, dt);
  camera.updateProjectionMatrix();

  try { sky?.update(camera); terrain?.update(dt, speed, altitude, camera); } catch (error) { console.error("Terrain update failed", error); }
  try { clouds?.update(dt, speed, camera, altitude); } catch (error) { console.error("Cloud update failed", error); }
  if (scene.fog) {
    scene.fog.color.copy(sky.horizonColor);
    if (scene.fog.isFogExp2) {
      const targetDensity = weather === "mist" ? 0.000052 : weather === "storm" ? 0.000044 : 0.000027;
      scene.fog.density = THREE.MathUtils.damp(scene.fog.density, targetDensity, 0.8, dt);
    } else {
      const targetFar = weather === "mist" || weather === "storm" ? 8500 : weather === "heavy clouds" ? 12500 : 18500;
      scene.fog.far = THREE.MathUtils.damp(scene.fog.far, targetFar, 0.8, dt);
    }
  }
  try {
    effects?.update(dt, speed, elapsed, camera, weather);
    if (effects) effects.render(dt);
    else renderer.render(scene, camera);
  } catch (error) {
    console.error("Render pipeline fallback.", error);
    try { effects?.dispose(); } catch {}
    effects = undefined;
    renderer.render(scene, camera);
  }

  fpsFrames++;
  fpsElapsed += dt;
  if (fpsElapsed >= 0.5) { fps = fpsFrames / fpsElapsed; fpsFrames = 0; fpsElapsed = 0; }
  const stats = terrain?.getDebugInfo?.() || {};
  if (debugVisible) {
    debug.textContent =
      "THE FALL — FLIGHT DEBUG (D to hide) | " + (testMode ? "DEV TEST" : "NORMAL") + "\n" +
      "Scene: " + activeScene.name + "\nWeather: " + weather + "\nSeed: " + seed + "\n" +
      "Speed: " + Math.round(speed) + " m/s\nCamera Y: " + camera.position.y.toFixed(1) + " | Terrain: " + terrainHeightUnder.toFixed(1) + " | Clearance: " + cameraClearance.toFixed(1) + "\n" +
      "Altitude: " + Math.round(altitude) + " m | LOD: " + (terrain?.lodAt(camera.position.x, camera.position.z) ?? "n/a") + "\n" +
      (groundWarning ? groundWarning + "\n" : "") +
      "Time left: " + Math.max(0, sceneDuration - elapsed).toFixed(1) + " s\n" +
      "Pitch: " + pitchDegrees.toFixed(1) + "° | FOV: " + camera.fov.toFixed(1) + "°\n" +
      "Chunks: " + (stats.chunkCount ?? 0) + " | View: " + ((stats.viewDistance ?? 0) / 1000).toFixed(1) + " km\n" +
      "FPS: " + fps.toFixed(1);
  }
  label.style.opacity = String(THREE.MathUtils.smoothstep(elapsed, 0.2, 1.8) * (1 - THREE.MathUtils.smoothstep(elapsed, sceneDuration - 1.2, sceneDuration)));
  if (!testMode && elapsed >= sceneDuration - 1.0) beginTransition();
  if (transitioning) {
    transitionTimer += dt;
    if (transitionTimer >= 1.15) {
      disposeScene();
      createScene(chooseScene(), randomSeed());
      transitioning = false;
      fade.classList.remove("dissolve");
      // Keep the existing world-space path; only the landscape seed and biome change.
    }
  }
}


if (testMode) {
 const panel=document.createElement("section"); panel.id="dev-test-panel";
 panel.innerHTML='<strong>DEV TEST MODE</strong><label>Scene<select id="dt-scene"><option value="himalaya">Himalaya</option><option value="hills">Hills</option><option value="river">River</option><option value="lake">Lake</option><option value="coast">Coast</option><option value="desert">Desert</option><option value="forest">Forest</option><option value="rainforest">Rainforest</option></select></label><label>Seed<input id="dt-seed" type="number"></label><label>Time<select id="dt-time"><option>dawn</option><option>noon</option><option>sunset</option><option>night</option></select></label><label>Weather<select id="dt-weather"><option>clear</option><option>clouds</option><option>mist</option><option>rain</option><option>storm</option></select></label><label>Speed<input id="dt-speed" type="number" min="0" max="250"></label><label class="dt-check"><input id="dt-freeze" type="checkbox"> Freeze viewpoint</label><hr><strong>TERRAIN DEBUG</strong><label class="dt-check"><input id="dt-wireframe" type="checkbox"> Wireframe</label><label class="dt-check"><input id="dt-lod" type="checkbox"> LOD colors</label><label class="dt-check"><input id="dt-borders" type="checkbox"> Chunk borders</label><label class="dt-check"><input id="dt-trees" type="checkbox" checked> Trees</label><small id="dt-octaves">Height noise octaves: 2 (band-limited)</small><button id="dt-apply">Apply live</button><button id="dt-copy">Copy settings</button>';
 document.body.appendChild(panel);
 const el=id=>panel.querySelector("#dt-"+id);
 el("scene").value=testSettings.scene; el("seed").value=testSettings.seed; el("time").value=testSettings.time; el("weather").value=testSettings.weather; el("speed").value=testSettings.speed??""; el("freeze").checked=testSettings.freeze;
 const applyTerrainDebug=()=>{terrainDebugOptions={wireframe:el("wireframe").checked,lodColors:el("lod").checked,chunkBorders:el("borders").checked,trees:el("trees").checked};terrain?.setDebugOptions(terrainDebugOptions);};
 ["wireframe","lod","borders","trees"].forEach(id=>el(id).addEventListener("change",applyTerrainDebug));
 let open=false;
 document.addEventListener("keydown",event=>{if(event.key.toLowerCase()==="t"&&!event.repeat){open=!open;panel.classList.toggle("open",open);}});
 el("apply").addEventListener("click",()=>{
  testSettings.scene=el("scene").value; testSettings.seed=Number(el("seed").value)||1; testSettings.time=el("time").value; testSettings.weather=el("weather").value; testSettings.speed=el("speed").value===""?null:Math.max(0,Number(el("speed").value)); testSettings.freeze=el("freeze").checked;
  const selected=sceneTypes.find(item=>item.id===sceneAliases[testSettings.scene])||sceneTypes[1]; const x=camera.position.x,z=camera.position.z;
  disposeScene(); camera.position.set(x,0,z); camera.rotation.set(0,0,0); createScene(selected,testSettings.seed,weatherParam(testSettings.weather)); terrain?.setDebugOptions(terrainDebugOptions);
  if(testSettings.freeze){camera.position.y=Math.max(terrain.getHeightAt(x,z)+80,terrain.getWaterLevel()+40);camera.lookAt(x+1350,camera.position.y-Math.tan(THREE.MathUtils.degToRad(25))*1350,z-1350);speed=testSettings.speed??0;}
 });
 el("copy").addEventListener("click",async()=>{
  const q=new URLSearchParams({scene:testSettings.scene,seed:String(testSettings.seed),time:testSettings.time,weather:testSettings.weather,freeze:testSettings.freeze?"1":"0"});
  if(testSettings.speed!==null)q.set("speed",String(testSettings.speed));
  const url=location.origin+location.pathname+"?"+q.toString();
  try{await navigator.clipboard.writeText(url);el("copy").textContent="Copied!";}catch{window.prompt("Copy test URL:",url);}
 });
}

const clock = sceneClock;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    paused = true;
    cancelAnimationFrame(frame);
  } else {
    paused = false;
    sceneClock.start();
    if (running) animate();
  }
});
function resize() {
  quality = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(quality);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  effects?.resize();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => window.setTimeout(resize, 180));
window.addEventListener("error", event => console.error("THE FALL error", event.error || event.message));

if (testMode) {
  const selected = sceneTypes.find(item => item.id === sceneAliases[testSettings.scene]) || sceneTypes[1];
  previousSceneId = selected.id;
  createScene(selected, testSettings.seed, weatherParam(testSettings.weather));
  terrain?.setDebugOptions(terrainDebugOptions);
} else {
  createScene(chooseScene(), randomSeed());
}
running = true;
sceneClock.start();
animate();
