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
renderer.toneMappingExposure = 1.32;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1.5, 65000);
camera.position.set(0, 3.4, 15.5);

const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const params = new URLSearchParams(location.search);
const requestedEnv = params.get("env");
let playlistEnabled = params.get("playlist") !== "0";
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
let preloadedTerrain = null, preloadedIndex = -1, preloadAttempted = false, transitionStarted = false, transitionState = "idle";
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

const nextViewButton = document.createElement("button");
nextViewButton.type = "button";
nextViewButton.textContent = "Next view →";
nextViewButton.setAttribute("aria-label", "Go to next landscape");
nextViewButton.style.cssText = "position:fixed;z-index:16;right:118px;bottom:18px;padding:8px 12px;border:1px solid #ffffff66;border-radius:8px;background:rgba(16,35,48,.72);color:white;font:600 12px system-ui;cursor:pointer;backdrop-filter:blur(8px)";
document.body.appendChild(nextViewButton);
nextViewButton.addEventListener("click", () => {
  playlistEnabled = true;
  if (!transitioning) advanceLandscape();
});
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
    timer = setTimeout(() => reject(new Error(label + " timed out after 7 seconds")), 7000);
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
  running = false; cancelAnimationFrame(frame);
  // The next terrain is already staged off-screen. Only now release the
  // previous scene, immediately before making the new terrain visible.
  cleanupActive();
  activeEnvironment = config;
  sequenceIndex = ENVIRONMENTS.findIndex(item => item.id === config.id);
  biome = config.biome; seed = stagedTerrain?.preloadSeed ?? randSeed();
  time = 0; altitude = config.camera.altitude; speed = config.camera.speed;
  camera.position.set(0, altitude, 15.5);
  cameraTarget.set(0, altitude - 14, -48);
  sky = createSky(scene, renderer, seed, config);
  scene.background = sky.horizonColor.clone();
  scene.fog = new THREE.FogExp2(sky.horizonColor.clone(), Math.max(config.fog.density, 0.000075));
  terrain = stagedTerrain || createTerrainFor(config, seed, true);
  terrain.setVisible(true);
  if (!terrain.isReady()) throw new Error("Landscape terrain preload incomplete: " + config.name);
  clouds = new CloudField(scene, seed, config);
  clouds.group.position.y = 1900;
  try {
    effects = new CinematicEffects(renderer, scene, camera, quality);
    // The generic white flight-wind points are not meadow vegetation.
    // In Green Hills they read as pale, floating tree silhouettes across
    // distant ridges, so suppress that generic particle layer for this view.
    if (config.id === "green-hills" && effects.wind) {
      effects.wind.visible = false;
    }
  }
  catch (error) { console.error("Post-processing setup failed; using direct renderer.", error); effects = undefined; }
  landscapeLabel.textContent = config.name;
  landscapeLabel.style.opacity = "1";
  await savePlaylistState();
  running = true; paused = false; transitionStarted = false; preloadAttempted = false;
  fpsFrames = 0; fpsTime = 0; lastDebugLog = 0;
  clock.start();
  animate();
}

// Prepare the next terrain invisibly while keeping the current scene intact.
// Terrain construction is synchronous, so the browser retains the last rendered
// frame instead of clearing the canvas to a white transition screen.
async function advanceLandscape() {
  if (!playlistEnabled || transitioning) return;
  transitioning = true;
  transitionState = "preparing next landscape";
  const requestedNext = nextIndex(sequenceIndex);
  const nextConfig = ENVIRONMENTS[requestedNext];
  let staged = null;

  try {
    const nextSeed = randSeed();
    staged = createTerrainFor(nextConfig, nextSeed, false);
    staged.preloadSeed = nextSeed;
    if (!staged.isReady()) throw new Error("Next landscape terrain is incomplete: " + nextConfig.name);

    transitionState = "switching to " + nextConfig.id;
    await activateLandscape(requestedNext, staged);
    staged = null;
    transitionState = "idle";
  } catch (error) {
    console.error("[THE FALL] Landscape transition failed; keeping the current view when possible.", error);
    if (staged) { try { staged.dispose(); } catch {} }
    transitionStarted = false;
    transitionState = "error";
  } finally {
    transitioning = false;
  }
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
      // An explicit env= selection is the first playlist view, not a reason
      // to disable the playlist. Subsequent transitions continue from it.
      index = directEnvironment
        ? Math.max(0, ENVIRONMENTS.findIndex(item => item.id === directEnvironment.id))
        : nextIndex(sequenceIndex);
      if (skipOnLoad) index = nextIndex(index);
    } else if (directEnvironment) {
      index = Math.max(0, ENVIRONMENTS.findIndex(item => item.id === directEnvironment.id));
    }
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
      "Far base visible: " + (stats.farBaseVisible ? "YES" : "NO — GENERATING") + "\n" +
      "Far-base worker queue: " + (stats.workerQueue ?? "n/a") + "\n" +
      "LOD rings near/mid/far/horizon: " + (stats.ringCounts ? Object.values(stats.ringCounts).join(" / ") : "n/a") + "\n" +
      "14 km coverage: " + (stats.coverage14km ? "OK" : "EDGE VISIBLE — MISSING CHUNKS") + "\n" +
      "Chunks under camera: " + (stats.chunksUnderCamera ?? 0) + "\n" +
      "Terrain height at camera: " + (stats.cameraGroundHeight == null ? "OUTSIDE CHUNKS" : stats.cameraGroundHeight.toFixed(1) + " m") + "\n" +
      "Camera altitude: " + camera.position.y.toFixed(1) + " m\n" +
      "Camera pitch: " + (stats.cameraPitch ?? 0).toFixed(1) + " deg\n" +
      "Ground objects: 0 (Stage 1)\n" +
      "Asset failures: " + (assetFailures.length ? assetFailures.join(", ") : "none") + "\n" +
      "Safety: " + (stats.safetyWarning || (stats.coverage14km ? "OK" : "WARNING — TERRAIN EDGE / GAP")) + "\n" +
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
  // Match visible forward travel to the environment's configured flight speed.
  // The previous 2.2 units/s made the landscape appear almost stationary.
  const turn = Math.sin(time * 0.16) * 0.72 + Math.sin(time * 0.058) * 0.26;
  const driftX = Math.sin(time * 0.16) * 190 + Math.sin(time * 0.38) * 22;
  const forwardZ = 15.5 - time * (targetSpeed * 0.55);
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
  // The active 11x11 grid spans about 16.5 km from its centre.
  // A 20 km coverage test can therefore never pass and was freezing the
  // camera before it reached the shared pan/rotation code in every view.
  const groundReady = (terrain?.hasChunkNear(cameraDesired.x, cameraDesired.z, 500) ?? false) && (terrain?.hasCoverage(14000) ?? false);
  if (groundReady) {
    camera.position.lerp(cameraDesired, 1 - Math.exp(-4.2 * dt));
    // Every landscape uses the same slow panoramic sweep: start looking
    // 75 degrees left and ease across to 75 degrees right during the view.
    // A single half-cycle avoids the fast left-right oscillation and makes
    // both sides of lakes, valleys and mountain ranges visible.
    const viewProgress = THREE.MathUtils.clamp(time / duration, 0, 1);
    const easedSweep = 0.5 - 0.5 * Math.cos(viewProgress * Math.PI);
    const viewYaw = THREE.MathUtils.degToRad(-75 + easedSweep * 150);
    cameraTarget.set(
      camera.position.x + Math.sin(viewYaw) * lookDistance,
      camera.position.y + Math.sin(pitchRadians) * lookDistance,
      camera.position.z - Math.cos(viewYaw) * lookDistance
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
  // Keep the active landscape visible; whiteout is reserved for the
  // actual playlist transition in advanceLandscape().
  fade.style.opacity = "0";
  try {
    terrain?.update(dt, speed, altitude, camera);
  } catch (error) { console.error("Terrain streaming update failed", error); }


  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.density = activeEnvironment?.fog?.density ?? 0.00012;
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
  if (playlistEnabled && time >= duration && !transitionStarted) {
    transitionStarted = true;
    advanceLandscape();
  }
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
