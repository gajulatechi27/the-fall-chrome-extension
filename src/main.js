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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false, alpha: false });
let quality = Math.min(devicePixelRatio, isSmall ? 1 : 1.5);
renderer.setPixelRatio(quality);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 30000);
const sceneTypes = [
  { id: "himalayas", name: "Himalayan Peaks" },
  { id: "green", name: "Green Hills & Valleys" },
  { id: "delta", name: "River Delta" },
  { id: "lake", name: "Lake & Mountains" },
  { id: "coast", name: "Coast & Islands" },
  { id: "desert", name: "Desert & Canyons" }
];
let sky, clouds, terrain, effects;
let seed = 0, activeScene = sceneTypes[0], elapsed = 0, altitude = 3500;
let running = false, paused = false, transitioning = false, frame = 0;
let fps = 0, fpsFrames = 0, fpsElapsed = 0, pitchDegrees = -45;
let previousSceneId = "";

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

function createScene(nextScene, nextSeed) {
  activeScene = nextScene;
  seed = nextSeed;
  elapsed = 0;
  altitude = 3500;
  camera.position.set(0, 350, 20);
  sky = createSky(scene, renderer, seed);
  scene.background = sky.horizonColor.clone();
  scene.fog = new THREE.FogExp2(sky.horizonColor, 0.000075);
  terrain = new Terrain(scene, seed, activeScene.id);
  clouds = new CloudField(scene, seed);
  try {
    effects = new CinematicEffects(renderer, scene, camera, quality);
  } catch (error) {
    console.error("Post-processing unavailable; using direct renderer.", error);
    effects = undefined;
  }
  label.textContent = activeScene.name;
  label.classList.add("visible");
}

async function transitionToNext() {
  if (transitioning || !running) return;
  transitioning = true;
  running = false;
  cancelAnimationFrame(frame);
  fade.classList.add("dissolve");
  await new Promise(resolve => setTimeout(resolve, 1500));
  disposeScene();
  createScene(chooseScene(), randomSeed());
  fade.classList.remove("dissolve");
  await new Promise(resolve => setTimeout(resolve, 1500));
  elapsed = 0;
  running = true;
  transitioning = false;
  clock.start();
  animate();
}

function altitudeAt(t) {
  if (t < 12) return THREE.MathUtils.lerp(3500, 850, THREE.MathUtils.smoothstep(t, 0, 12));
  if (t < 55) return 850;
  return THREE.MathUtils.lerp(850, 3500, THREE.MathUtils.smoothstep(t, 55, 68));
}

function animate() {
  if (!running || paused || document.hidden) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  elapsed += dt;
  altitude = altitudeAt(elapsed);

  // Map flight altitude to scene units; the two cloud decks are fixed at y=325 and y=165.
  const cameraY = altitude * 0.1;
  const turn = Math.sin(elapsed * 0.075) * 0.48 + Math.sin(elapsed * 0.027) * 0.18;
  const cameraX = Math.sin(elapsed * 0.075) * 115 + Math.sin(elapsed * 0.19) * 16;
  const cameraZ = 20 - elapsed * 12;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraX, 1.8, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraY, 2.0, dt);
  camera.position.z = cameraZ;

  const pitchT = THREE.MathUtils.smoothstep(altitude, 850, 3500);
  pitchDegrees = THREE.MathUtils.lerp(-15, -45, pitchT);
  const pitchDrop = Math.tan(THREE.MathUtils.degToRad(Math.abs(pitchDegrees))) * 95;
  const lookX = camera.position.x + Math.sin(turn) * 58;
  camera.lookAt(lookX, camera.position.y - pitchDrop, camera.position.z - 95);

  // Terrain streams continuously; isolate failures so the render loop remains alive.
  try { terrain?.update(dt, 90, altitude, camera); } catch (error) { console.error("Terrain update failed", error); }
  try { clouds?.update(dt, 90, camera, altitude); } catch (error) { console.error("Cloud update failed", error); }
  if (scene.fog instanceof THREE.FogExp2 && sky?.horizonColor) scene.fog.color.copy(sky.horizonColor);
  if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.000075;

  fpsFrames++;
  fpsElapsed += dt;
  if (fpsElapsed >= 0.5) {
    fps = fpsFrames / fpsElapsed;
    fpsFrames = 0;
    fpsElapsed = 0;
  }

  try {
    effects?.update(dt, 90, elapsed);
    if (effects) effects.render(dt);
    else renderer.render(scene, camera);
  } catch (error) {
    console.error("Render pipeline failed; direct rendering fallback.", error);
    try { effects?.dispose(); } catch {}
    effects = undefined;
    renderer.render(scene, camera);
  }

  const stats = terrain?.getDebugInfo?.() || {};
  if (debugVisible) {
    debug.textContent =
      "THE FALL — DEBUG (D to hide)\n" +
      "Scene: " + activeScene.name + "\n" +
      "Seed: " + seed + "\n" +
      "Altitude: " + Math.round(altitude) + " m\n" +
      "Pitch: " + pitchDegrees.toFixed(1) + "°\n" +
      "Cloud count: " + (clouds?.count ?? 0) + "\n" +
      "Chunk count: " + (stats.chunkCount ?? 0) + "\n" +
      "View distance: " + ((stats.viewDistance ?? 0) / 1000).toFixed(1) + " km\n" +
      "Terrain min/max: " + Math.round(stats.minHeight ?? 0) + " / " + Math.round(stats.maxHeight ?? 0) + " m\n" +
      "FPS: " + fps.toFixed(1);
  }

  const labelAlpha = THREE.MathUtils.smoothstep(elapsed, 0.3, 2.5) * (1 - THREE.MathUtils.smoothstep(elapsed, 62, 68));
  label.style.opacity = String(labelAlpha);
  if (elapsed >= 68) transitionToNext();
}

const clock = new THREE.Clock();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    paused = true;
    cancelAnimationFrame(frame);
  } else if (running) {
    paused = false;
    clock.start();
    animate();
  }
});

function resize() {
  const small = matchMedia("(max-width:700px)").matches;
  quality = Math.min(devicePixelRatio, small ? 1 : 1.5);
  renderer.setPixelRatio(quality);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  effects?.resize();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => window.setTimeout(resize, 180));
window.addEventListener("error", event => console.error("THE FALL error", event.error || event.message));

createScene(chooseScene(), randomSeed());
running = true;
clock.start();
animate();
