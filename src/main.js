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
let quality = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(quality);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 30000);
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
  sceneDuration = 22 + (seed % 5000) / 625; // 22–30 seconds
  weather = weatherTypes[(seed >>> 5) % weatherTypes.length];
  altitude = 4000;
  sky = createSky(scene, renderer, seed, activeScene.id, weather);
  scene.background = sky.horizonColor.clone();
  scene.fog = new THREE.Fog(sky.horizonColor, 900, weather === "mist" || weather === "storm" ? 8500 : 18500);
  terrain = new Terrain(scene, seed, activeScene.id);
  clouds = new CloudField(scene, seed, weather);
  try {
    effects = new CinematicEffects(renderer, scene, camera, quality, weather);
  } catch (error) {
    console.error("Effects unavailable; using direct renderer.", error);
    effects = undefined;
  }
  label.textContent = activeScene.name;
  label.classList.add("visible");
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
  speed = speedAt(elapsed);
  altitude = altitudeAt(elapsed);
  worldDistance += speed * dt;

  const fall = THREE.MathUtils.smoothstep(elapsed, 0, 7.2);
  const climb = THREE.MathUtils.smoothstep(elapsed, sceneDuration - 5.5, sceneDuration);
  const turn = Math.sin(elapsed * 0.22) * 0.62 + Math.sin(elapsed * 0.51) * 0.12;
  const lateral = Math.sin(elapsed * 0.31) * 210 + Math.sin(elapsed * 0.83) * 42;
  camera.position.x = lateral;
  camera.position.y = altitude * 0.1;
  camera.position.z -= speed * 0.1 * dt;
  // A small banking turn and a stronger downward attitude during the initial dive.
  pitchDegrees = THREE.MathUtils.lerp(-58, -10, fall);
  pitchDegrees = THREE.MathUtils.lerp(pitchDegrees, -24, climb);
  const bank = Math.sin(elapsed * 0.27) * 0.13;
  camera.rotation.order = "YXZ";
  camera.rotation.y = turn * 0.28;
  camera.rotation.x = THREE.MathUtils.degToRad(pitchDegrees);
  camera.rotation.z = -bank;
  const targetFov = THREE.MathUtils.mapLinear(speed, 60, 200, 60, 85);
  camera.fov = THREE.MathUtils.damp(camera.fov, THREE.MathUtils.clamp(targetFov, 60, 85), 4.5, dt);
  camera.updateProjectionMatrix();

  try { terrain?.update(dt, speed, altitude, camera); } catch (error) { console.error("Terrain update failed", error); }
  try { clouds?.update(dt, speed, camera, altitude); } catch (error) { console.error("Cloud update failed", error); }
  if (scene.fog) {
    scene.fog.color.copy(sky.horizonColor);
    const targetFar = weather === "mist" || weather === "storm" ? 8500 : weather === "heavy clouds" ? 12500 : 18500;
    scene.fog.far = THREE.MathUtils.damp(scene.fog.far, targetFar, 0.8, dt);
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
      "THE FALL — FLIGHT DEBUG (D to hide)\n" +
      "Scene: " + activeScene.name + "\nWeather: " + weather + "\nSeed: " + seed + "\n" +
      "Speed: " + Math.round(speed) + " m/s\nAltitude: " + Math.round(altitude) + " m\n" +
      "Time left: " + Math.max(0, sceneDuration - elapsed).toFixed(1) + " s\n" +
      "Pitch: " + pitchDegrees.toFixed(1) + "° | FOV: " + camera.fov.toFixed(1) + "°\n" +
      "Chunks: " + (stats.chunkCount ?? 0) + " | View: " + ((stats.viewDistance ?? 0) / 1000).toFixed(1) + " km\n" +
      "FPS: " + fps.toFixed(1);
  }
  label.style.opacity = String(THREE.MathUtils.smoothstep(elapsed, 0.2, 1.8) * (1 - THREE.MathUtils.smoothstep(elapsed, sceneDuration - 1.2, sceneDuration)));
  if (elapsed >= sceneDuration - 1.0) beginTransition();
  if (transitioning) {
    transitionTimer += dt;
    if (transitionTimer >= 1.15) {
      disposeScene();
      camera.position.y = 400;
      createScene(chooseScene(), randomSeed());
      transitioning = false;
      fade.classList.remove("dissolve");
      // Keep the existing world-space path; only the landscape seed and biome change.
    }
  }
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

createScene(chooseScene(), randomSeed());
running = true;
sceneClock.start();
animate();
