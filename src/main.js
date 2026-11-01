import * as THREE from "three";
import { createSky } from "./sky.js";
import { CloudField } from "./clouds.js";
import { Terrain } from "./terrain.js";
import { Landmarks, themes } from "./landmarks.js";
import { CinematicEffects } from "./effects.js";
import "./style.css";

const canvas = document.querySelector("#world");
const fade = document.querySelector("#fade");
const isSmall = matchMedia("(max-width:700px)").matches;
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: "high-performance",
  stencil: false, alpha: false
});
let quality = Math.min(devicePixelRatio, isSmall ? 1 : 1.5);
renderer.setPixelRatio(quality);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 12000);
camera.position.set(0, 3.4, 15.5);

const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const biomes = ["mountains", "desert", "islands", "forest", "snow"];
const randSeed = () => Math.floor(Math.random() * 0x7fffffff);
let sky, clouds, terrain, landmarks, effects;
let seed = 0, biome = "mountains", time = 0, altitude = 32000, speed = 90;
let running = false, paused = false, transitioning = false, frame = 0, descentNumber = 0;
let lastDebugLog = 0, fpsFrames = 0, fpsTime = 0, fps = 0;

const debug = document.createElement("pre");
debug.id = "fall-debug";
debug.style.cssText = "display:none;position:fixed;z-index:20;left:12px;top:12px;margin:0;padding:12px 14px;max-width: min(520px, calc(100vw - 24px));background:rgba(3,12,20,.82);color:#d8f3ff;border:1px solid rgba(180,220,240,.35);border-radius:8px;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
document.body.appendChild(debug);
let debugVisible = false;
document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "d" && !event.repeat) {
    debugVisible = !debugVisible;
    debug.style.display = debugVisible ? "block" : "none";
  }
});

async function saveDescent() {
  try {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({
        theFallLastSeed: seed,
        theFallDescentCount: descentNumber,
        theFallLastBiome: biome
      });
    }
  } catch (error) {
    console.info("Chrome storage unavailable in preview mode", error);
  }
}

function cleanup() {
  effects?.dispose();
  effects = undefined;
  sky?.dispose();
  sky = undefined;
  clouds?.dispose();
  clouds = undefined;
  terrain?.dispose();
  terrain = undefined;
  landmarks?.dispose();
  landmarks = undefined;
  scene.clear();
}

async function beginDescent() {
  if (transitioning) return;
  transitioning = true;
  running = false;
  cancelAnimationFrame(frame);
  fade.classList.add("white");
  await new Promise(resolve => setTimeout(resolve, 700));
  cleanup();

  seed = randSeed();
  biome = biomes[Math.floor(Math.random() * biomes.length)];
  const route = themes[Math.floor(Math.random() * themes.length)];
  descentNumber++;
  time = 0;
  altitude = 32000;
  speed = 90;
  camera.position.set(0, 3.4, 15.5);
  cameraTarget.set(0, -0.25, -15);

  sky = createSky(scene, renderer, seed);
  scene.background = sky.horizonColor.clone();
  scene.fog = new THREE.FogExp2(sky.horizonColor, 0.000018);
  terrain = new Terrain(scene, seed, biome, route);
  landmarks = new Landmarks(scene, seed, route);
  clouds = new CloudField(scene, seed);

  try {
    effects = new CinematicEffects(renderer, scene, camera, quality);
  } catch (error) {
    console.error("Post-processing setup failed; using direct renderer.", error);
    effects = undefined;
  }

  await saveDescent();
  running = true;
  paused = false;
  transitioning = false;
  fpsFrames = 0;
  fpsTime = 0;
  lastDebugLog = 0;
  clock.start();
  fade.classList.remove("white");
  animate();
}

const clock = new THREE.Clock();

function updateDebug(dt) {
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }
  if (time - lastDebugLog >= 1) {
    lastDebugLog = time;
    const stats = terrain?.getDebugInfo?.() || {};
    console.info(
      "[THE FALL]",
      "biome:", biome,
      "seed:", seed,
      "altitude:", Math.round(altitude),
      "chunks:", stats.chunkCount ?? 0,
      "sea:", stats.seaLevel ?? "off",
      "terrain min/max:", Math.round(stats.minHeight ?? 0), "/", Math.round(stats.maxHeight ?? 0)
    );
  }
  if (debugVisible) {
    const stats = terrain?.getDebugInfo?.() || {};
    debug.textContent =
      "THE FALL — DEBUG (D to hide)\n" +
      "Biome: " + biome + "\n" +
      "Seed: " + seed + "\n" +
      "Altitude: " + Math.round(altitude) + " m\n" +
      "Camera X/Z: " + camera.position.x.toFixed(1) + " / " + camera.position.z.toFixed(1) + "\n" +
      "Chunks: " + (stats.chunkCount ?? 0) + "\n" +
      "Sea level: " + (stats.seaLevel == null ? "off" : stats.seaLevel.toFixed(1)) + "\n" +
      "Terrain min/max: " + (stats.minHeight ?? 0).toFixed(1) + " / " + (stats.maxHeight ?? 0).toFixed(1) + "\n" +
      "FPS: " + fps.toFixed(1);
  }
}

function animate() {
  if (!running || paused || document.hidden) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  time += dt;

  const progress = THREE.MathUtils.clamp(time / 75, 0, 1);
  const targetSpeed = altitude < 450 ? 24 : altitude < 3500 ? 110 : altitude < 11000 ? 103 : 90;
  speed = THREE.MathUtils.damp(speed, targetSpeed, 1.15, dt);
  altitude = Math.max(0, 32000 * (1 - progress));

  // A gentle forward drift and broad turn keep the view moving over new terrain.
  const turn = Math.sin(time * 0.105) * 0.62 + Math.sin(time * 0.037) * 0.22;
  const driftX = Math.sin(time * 0.105) * 150 + Math.sin(time * 0.29) * 12;
  const forwardZ = 15.5 - time * 2.2;
  const shake = Math.min(0.035, speed * 0.00024);
  cameraDesired.set(
    driftX + Math.sin(time * 1.1) * 0.12 + Math.sin(time * 13) * shake,
    3.4 + Math.sin(time * 0.7) * 0.12 + Math.sin(time * 9) * shake,
    forwardZ + Math.sin(time * 0.8) * 0.18
  );
  camera.position.lerp(cameraDesired, 1 - Math.exp(-2.8 * dt));
  cameraTarget.set(
    camera.position.x + Math.sin(turn) * 58,
    -0.25,
    camera.position.z - 48
  );
  camera.lookAt(cameraTarget);

  // Keep every subsystem isolated: one bad chunk must not stop the render loop.
  try { clouds?.update(dt, speed); } catch (error) { console.error("Cloud update failed", error); }
  try {
    terrain?.update(dt, speed, altitude, camera);
    if (landmarks) landmarks.group.position.x = camera.position.x * 0.82;
  } catch (error) { console.error("Terrain streaming update failed", error); }
  try { landmarks?.update(dt, speed); } catch (error) { console.error("Landmark update failed", error); }

  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.density = THREE.MathUtils.lerp(0.000018, 0.00016, THREE.MathUtils.smoothstep(progress, 0.45, 1));
    if (sky?.horizonColor) scene.fog.color.copy(sky.horizonColor);
  }

  try {
    effects?.update(dt, speed, time);
    if (effects) effects.render(dt);
    else renderer.render(scene, camera);
  } catch (error) {
    console.error("Post-processing render failed; switching to direct rendering.", error);
    try { effects?.dispose(); } catch {}
    effects = undefined;
    renderer.render(scene, camera);
  }

  updateDebug(dt);
  if (time >= 75 || altitude <= 0) beginDescent();
}

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
beginDescent();
