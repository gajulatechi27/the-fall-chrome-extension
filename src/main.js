import * as THREE from "three";
import { createSky } from "./sky.js";
import { CloudField } from "./clouds.js";
import { Terrain } from "./terrain.js";
import { ENVIRONMENTS, resolveEnvironment } from "./environments.js";
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
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1.5, 65000);
camera.position.set(0, 3.4, 15.5);

const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const params = new URLSearchParams(location.search);
const requestedEnv = params.get("env");
let playlistEnabled = params.get("playlist") === "1" || (!requestedEnv && params.get("playlist") !== "0");
const skipOnLoad = params.get("skip") === "1";
const seedParam = new URLSearchParams(location.search).get("seed");
const requestedSeed = seedParam === null ? Number.NaN : Number(seedParam);
const startBelow = new URLSearchParams(location.search).get("start") === "below";
const biomes = ["mountains", "desert", "islands", "forest", "snow"];
const randSeed = () => Number.isFinite(requestedSeed) ? (requestedSeed >>> 0) : Math.floor(Math.random() * 0x7fffffff);
let sky, clouds, terrain, effects;
window.__fallAssetFailures ||= [];
const assetFailures = window.__fallAssetFailures;
let seed = 0, biome = "forest", time = 0, altitude = 32000, speed = 90;
let activeEnvironment = null, sequenceIndex = -1, orderMode = "In order";
let preloadedTerrain = null, preloadedIndex = -1, transitionStarted = false, transitionState = "idle";
const directEnvironment = resolveEnvironment(requestedEnv);
let running = false, paused = false, transitioning = false, frame = 0, descentNumber = 0;
let lastDebugLog = 0, fpsFrames = 0, fpsTime = 0, fps = 0;

const debug = document.createElement("pre");
debug.id = "fall-debug";
debug.style.cssText = "display:none;position:fixed;z-index:20;left:12px;top:12px;margin:0;padding:12px 14px;max-width: min(520px, calc(100vw - 24px));background:rgba(3,12,20,.82);color:#d8f3ff;border:1px solid rgba(180,220,240,.35);border-radius:8px;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
document.body.appendChild(debug);
const landscapeLabel = document.createElement("div");
landscapeLabel.id = "fall-landscape-label";
landscapeLabel.style.cssText = "position:fixed;z-index:15;left:50%;bottom:28px;transform:translateX(-50%);padding:8px 15px;border-radius:18px;background:rgba(5,18,28,.38);color:#fff;font:500 13px/1.2 system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 1px 8px #14232b;opacity:0;transition:opacity 1.4s ease;pointer-events:none;white-space:nowrap";
document.body.appendChild(landscapeLabel);
const orderControl = document.createElement("select");
orderControl.setAttribute("aria-label","Landscape order");
orderControl.style.cssText = "position:fixed;z-index:16;right:14px;bottom:18px;padding:7px 10px;border:1px solid #ffffff55;border-radius:8px;background:#10233099;color:white;font:12px system-ui";
orderControl.innerHTML = '<option>In order</option><option>Shuffle</option>';
document.body.appendChild(orderControl);
orderControl.addEventListener("change", () => { orderMode = orderControl.value; savePlaylistState(); });
let debugVisible = false;
document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "d" && !event.repeat) {
    debugVisible = !debugVisible;
    debug.style.display = debugVisible ? "block" : "none";
  }
  if (event.key.toLowerCase() === "n" && !event.repeat) {
    event.preventDefault();
    playlistEnabled = true;
    advanceLandscape();
  }
});

async function savePlaylistState() {
  try {
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({
      theFallLastLandscapeIndex: sequenceIndex,
      theFallLandscapeOrder: orderMode,
      theFallLastSeed: seed,
      theFallLastBiome: biome
    });
  } catch (error) { console.info("Playlist state unavailable in preview mode", error); }
}

function nextIndex(from = sequenceIndex) {
  if (ENVIRONMENTS.length < 2) return from;
  if (orderMode === "Shuffle") {
    const choices = ENVIRONMENTS.map((_, index) => index).filter(index => index !== from);
    return choices[Math.floor(Math.random() * choices.length)];
  }
  return (from + 1) % ENVIRONMENTS.length;
}

function withEightSecondTimeout(promise, label) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + " timed out after 8 seconds")), 8000);
  })]).finally(() => clearTimeout(timer));
}

function createTerrainFor(config, terrainSeed, visible = true) {
  const instance = new Terrain(scene, terrainSeed, config.biome, config);
  instance.setVisible(visible);
  return instance;
}

function cleanupActive() {
  effects?.dispose(); effects = undefined;
  sky?.dispose(); sky = undefined;
  clouds?.dispose(); clouds = undefined;
  terrain?.dispose(); terrain = undefined;
}

async function activateLandscape(index, stagedTerrain = null) {
  const config = playlistEnabled ? ENVIRONMENTS[index] : (directEnvironment || ENVIRONMENTS[index]);
  if (!config) throw new Error("Unknown landscape: " + requestedEnv);
  running = false; cancelAnimationFrame(frame); cleanupActive();
  activeEnvironment = config;
  sequenceIndex = ENVIRONMENTS.findIndex(item => item.id === config.id);
  biome = config.biome; seed = stagedTerrain?.preloadSeed ?? randSeed();
  time = 0; altitude = config.camera.altitude; speed = config.camera.speed;
  camera.position.set(0, altitude, 15.5);
  cameraTarget.set(0, altitude - 14, -48);
  sky = createSky(scene, renderer, seed, config);
  scene.background = sky.horizonColor.clone();
  scene.fog = new THREE.FogExp2(new THREE.Color(config.fog.color), config.fog.density);
  terrain = stagedTerrain || createTerrainFor(config, seed, true);
  terrain.setVisible(true);
  if (!terrain.isReady()) throw new Error("Landscape terrain preload incomplete: " + config.name);
  clouds = new CloudField(scene, seed, config);
  clouds.group.position.y = 1900;
  try { effects = new CinematicEffects(renderer, scene, camera, quality); }
  catch (error) { console.error("Post-processing setup failed; using direct renderer.", error); effects = undefined; }
  landscapeLabel.textContent = config.name;
  landscapeLabel.style.opacity = "1";
  await savePlaylistState();
  running = true; paused = false; transitionStarted = false;
  fpsFrames = 0; fpsTime = 0; lastDebugLog = 0;
  clock.start();
  animate();
}

async function preloadNextLandscape() {
  if (!playlistEnabled || preloadedTerrain || !activeEnvironment) return;
  preloadedIndex = nextIndex();
  const next = ENVIRONMENTS[preloadedIndex];
  const nextSeed = randSeed();
  preloadedTerrain = createTerrainFor(next, nextSeed, false);
  preloadedTerrain.preloadSeed = nextSeed;
  console.info("[THE FALL] Preloaded next landscape:", next.name);
}

async function advanceLandscape() {
  if (!playlistEnabled || transitioning) return;
  transitioning = true;
  transitionState = "whiteout";
  running = false; cancelAnimationFrame(frame);
  landscapeLabel.style.opacity = "0";
  fade.classList.add("white"); fade.style.opacity = "1";
  const requestedNext = preloadedTerrain && preloadedIndex >= 0 ? preloadedIndex : nextIndex(sequenceIndex);
  const staged = preloadedTerrain && preloadedIndex === requestedNext ? preloadedTerrain : null;
  if (preloadedTerrain && !staged) { try { preloadedTerrain.dispose(); } catch {} }
  preloadedTerrain = null; preloadedIndex = -1;
  await new Promise(resolve => setTimeout(resolve, 4000));
  try {
    transitionState = "activating " + ENVIRONMENTS[requestedNext].id;
    await withEightSecondTimeout(activateLandscape(requestedNext, staged), "Landscape activation");
  } catch (error) {
    console.error("[THE FALL] Landscape transition failed; rebuilding without preload.", error);
    if (staged) { try { staged.dispose(); } catch {} }
    cleanupActive();
    try {
      await withEightSecondTimeout(activateLandscape(requestedNext, null), "Landscape fallback activation");
    } catch (fallbackError) {
      console.error("[THE FALL] Landscape fallback failed.", fallbackError);
      transitionState = "error";
      transitioning = false;
      return;
    }
  }
  transitionState = "emerging";
  await new Promise(resolve => setTimeout(resolve, 500));
  fade.style.opacity = "0"; fade.classList.remove("white");
  landscapeLabel.style.opacity = "1";
  transitioning = false;
  transitionState = "idle";
}

async function beginDescent() {
  if (transitioning) return;
  transitioning = true;
  let index = 0;
  try {
    if (playlistEnabled && globalThis.chrome?.storage?.local) {
      const saved = await chrome.storage.local.get(["theFallLastLandscapeIndex","theFallLandscapeOrder"]);
      sequenceIndex = Number.isInteger(saved.theFallLastLandscapeIndex) ? saved.theFallLastLandscapeIndex : -1;
      orderMode = saved.theFallLandscapeOrder || "In order";
      orderControl.value = orderMode;
      index = nextIndex(sequenceIndex);
      if (skipOnLoad) index = nextIndex(index);
    } else if (directEnvironment) index = Math.max(0, ENVIRONMENTS.findIndex(item => item.id === directEnvironment.id));
  } catch { index = directEnvironment ? Math.max(0, ENVIRONMENTS.findIndex(item => item.id === directEnvironment.id)) : 0; }
  fade.classList.add("white"); fade.style.opacity = "1";
  await new Promise(resolve => setTimeout(resolve, 450));
  await activateLandscape(index);
  fade.style.opacity = "0"; fade.classList.remove("white");
  transitioning = false;
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
    const stats = terrain?.getDebugInfo?.(camera) || {};
    console.info(
      "[THE FALL]",
      "landscape:", activeEnvironment?.name,
      "index:", sequenceIndex + 1,
      "time left:", Math.max(0, (activeEnvironment?.duration || 68) - time).toFixed(1),
      "transition:", transitionState,
      "seed:", seed,
      "altitude:", Math.round(altitude),
      "camera x/z:", camera.position.x.toFixed(1), "/", camera.position.z.toFixed(1),
      "chunks:", stats.chunkCount ?? 0,
      "sea:", stats.seaLevel ?? "off",
      "terrain min/max:", Math.round(stats.minHeight ?? 0), "/", Math.round(stats.maxHeight ?? 0)
    );
  }
  if (debugVisible) {
    const stats = terrain?.getDebugInfo?.(camera) || {};
    stats.cameraGroundHeight = terrain?.sampleHeight(camera.position.x, camera.position.z) ?? null;
    stats.cameraPitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(camera.getWorldDirection(new THREE.Vector3()).y, -1, 1)));
    stats.safetyWarning = terrain?.hasChunkNear(camera.position.x, camera.position.z, 500) ? null : "HOLD — NO CHUNK WITHIN 500 m";
    debug.textContent =
      "THE FALL — DEBUG (D to hide)\n" +
      "Landscape: " + (sequenceIndex + 1) + "/" + ENVIRONMENTS.length + " — " + (activeEnvironment?.name || biome) + "\n" +
      "Time left: " + Math.max(0, (activeEnvironment?.duration || 68) - time).toFixed(1) + " s\n" +
      "Order: " + orderMode + "\n" +
      "Transition: " + transitionState + "\n" +
      "Terrain config: base " + (activeEnvironment?.terrain?.baseHeight ?? "-") + ", octaves " + (activeEnvironment?.terrain?.noiseOctaves ?? "-") + ", ridge " + (activeEnvironment?.terrain?.ridgeWeight ?? "-") + ", valley " + (activeEnvironment?.terrain?.valleyCarving ?? "-") + "\n" +
      "Water: " + (activeEnvironment?.water?.type || "none") + " / vegetation config: " + (activeEnvironment?.vegetation?.types?.join(", ") || "none") + "\n" +
      "Sun/time: " + (activeEnvironment?.timeOfDay || "-") + " / intensity " + (activeEnvironment?.sun?.intensity ?? "-") + "\n" +
      "Seed: " + seed + "\n" +
      "Altitude: " + Math.round(altitude) + " m\n" +
      "Camera X/Z: " + camera.position.x.toFixed(1) + " / " + camera.position.z.toFixed(1) + "\n" +
      "Terrain chunks: " + (stats.chunkCount ?? 0) + "\n" +
      "Chunk gap check: " + (stats.chunkGapWarning ? "WARNING — MISSING CHUNK" : "OK") + "\n" +
      "LOD rings near/mid/far/horizon: " + (stats.ringCounts ? Object.values(stats.ringCounts).join(" / ") : "n/a") + "\n" +
      "20 km coverage: " + (stats.coverage20km ? "OK" : "EDGE VISIBLE — MISSING CHUNKS") + "\n" +
      "Chunks under camera: " + (stats.chunksUnderCamera ?? 0) + "\n" +
      "Terrain height at camera: " + (stats.cameraGroundHeight == null ? "OUTSIDE CHUNKS" : stats.cameraGroundHeight.toFixed(1) + " m") + "\n" +
      "Camera altitude: " + camera.position.y.toFixed(1) + " m\n" +
      "Camera pitch: " + (stats.cameraPitch ?? 0).toFixed(1) + " deg\n" +
      "Ground objects: 0 (Stage 1)\n" +
      "Asset failures: " + (assetFailures.length ? assetFailures.join(", ") : "none") + "\n" +
      "Safety: " + (stats.safetyWarning || (stats.coverage20km ? "OK" : "WARNING — TERRAIN EDGE / GAP")) + "\n" +
      "Sea level: " + (stats.seaLevel == null ? "off" : stats.seaLevel.toFixed(1)) + " m\n" +
      "Camera above water: " + (stats.seaLevel == null ? "n/a" : (camera.position.y - stats.seaLevel).toFixed(1) + " m") + "\n" +
      "Water terrain clipping: " + (stats.waterTerrainClipping ? "ON" : "OFF") + "\n" +
      "Terrain min/max: " + (stats.minHeight ?? 0).toFixed(1) + " / " + (stats.maxHeight ?? 0).toFixed(1) + "\n" +
      "FPS: " + fps.toFixed(1);
  }
}

function animate() {
  if (!running || paused || document.hidden) return;
  frame = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  time += dt;

  const duration = activeEnvironment?.duration || 68;
  const progress = THREE.MathUtils.clamp(time / duration, 0, 1);
  // Stage 1 flight profile: enter the cloud bank, emerge above the terrain,
  // then hold a low, safe glide for the remainder of the journey.
  const targetAltitude = activeEnvironment?.camera?.altitude ?? 420;
  const targetSpeed = activeEnvironment?.camera?.speed ?? 42;
  speed = THREE.MathUtils.damp(speed, targetSpeed, 1.15, dt);
  altitude = targetAltitude;

  // A gentle forward drift and broad turn keep the view moving over new terrain.
  const turn = Math.sin(time * 0.105) * 0.62 + Math.sin(time * 0.037) * 0.22;
  const driftX = Math.sin(time * 0.105) * 150 + Math.sin(time * 0.29) * 12;
  const forwardZ = 15.5 - time * 2.2;
  const shake = Math.min(0.035, speed * 0.00024);
  cameraDesired.set(
    driftX + Math.sin(time * 1.1) * 0.12 + Math.sin(time * 13) * shake,
    altitude + Math.sin(time * 0.7) * 0.12 + Math.sin(time * 9) * shake,
    forwardZ + Math.sin(time * 0.8) * 0.18
  );
  terrain?.ensureGrid(cameraDesired.x, cameraDesired.z);
  const pitchRadians = THREE.MathUtils.degToRad(-10);
  const lookDistance = 1200;
  // Hold the camera if the terrain streamer ever loses the ground footprint.
  const groundReady = (terrain?.hasChunkNear(cameraDesired.x, cameraDesired.z, 500) ?? false) && (terrain?.hasCoverage(20000) ?? false);
  if (groundReady) {
    camera.position.lerp(cameraDesired, 1 - Math.exp(-2.8 * dt));
    cameraTarget.set(
      camera.position.x + Math.sin(turn) * 220,
      camera.position.y + Math.sin(pitchRadians) * lookDistance,
      camera.position.z - Math.cos(pitchRadians) * lookDistance
    );
    camera.lookAt(cameraTarget);
  } else {
    cameraDesired.copy(camera.position);
    console.warn("[THE FALL] SAFETY HOLD: no terrain chunk within 500 m of camera footprint.");
  }

  // Keep every subsystem isolated: one bad chunk must not stop the render loop.
  try { clouds?.update(dt, speed); } catch (error) { console.error("Cloud update failed", error); }
  // Keep the unchanged procedural sky sphere centered on the high-altitude
  // camera so its BackSide shader remains visible throughout the flight.
  sky?.update(camera);
  // Four-second soft white-out while crossing the cloud bank. The overlay
  // is independent of the sky shader, so the sky's colours are untouched.
  if (!startBelow) {
    const whiteout = THREE.MathUtils.smoothstep(time, 3.0, 4.0) *
      (1.0 - THREE.MathUtils.smoothstep(time, 7.0, 8.0));
    fade.style.opacity = String(whiteout);
  } else {
    fade.style.opacity = "0";
  }
  try {
    terrain?.update(dt, speed, altitude, camera);
  } catch (error) { console.error("Terrain streaming update failed", error); }


  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.density = activeEnvironment?.fog?.density ?? 0.00012;
    if (activeEnvironment?.fog?.color) scene.fog.color.set(activeEnvironment.fog.color);
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
  if (playlistEnabled && time >= duration - 10 && !preloadedTerrain) {
    preloadNextLandscape().catch(error => console.error("[THE FALL] Next landscape preload failed:", error));
  }
  if (playlistEnabled && time >= duration && !transitionStarted) { transitionStarted = true; advanceLandscape(); }
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
