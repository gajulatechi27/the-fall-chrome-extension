# THE FALL — Endless Real World Flight

Manifest V3 Chrome New Tab extension using CesiumJS, Cesium World Terrain, Cesium World Imagery and Cesium ion OSM Buildings asset 96188. No generated buildings, fake houses, boxes, cones, character models or procedural terrain meshes are included in the flight scene.

## Flight
- One Cesium Viewer is created and reused for the tab lifetime.
- Camera follows a geodesic route with Catmull-Rom altitude spline, eased movement, subtle drift and banking.
- Each route descends to a location-specific 300–900 m above sampled terrain, glides, climbs and transfers to the next shuffled location.
- No landing state, white fade, scene teardown or viewer recreation.
- Upcoming terrain heights and a small set of satellite image tiles are warmed while approaching the current destination; normal Cesium camera-driven tile streaming refines the scene in flight.
- Animation pauses while the tab is hidden and resumes at the same route progress.
- Cesium's sun and lighting update from the user's local system date and time.
- Globe and 3D Tiles caches are bounded by Low / Medium / High settings.

## Data sources
- Cesium World Terrain and Cesium World Imagery from Cesium ion.
- Cesium ion asset 96188 (OSM Buildings).
- Destination anchors are stored in src/locations.json. Coordinates are approximate; OSM building detail varies by location and mapping coverage.

## Setup
1. Create a Cesium ion token with access to World Terrain, World Imagery and asset 96188.
2. Open THE FALL Settings, paste the token, choose quality and toggle OSM buildings.
3. Save and open a new tab.

## Build in WSL Ubuntu
```bash
cd /mnt/c/Users/LENOVO/Downloads/the-fall-chrome-extension-main/the-fall-chrome-extension-main
git pull origin main
npm install
npm run build
```

## Load in Chrome
1. Open chrome://extensions and enable Developer mode.
2. Choose Load unpacked and select the project's dist directory, or click Reload for an existing install.
3. Open a new tab and configure the Cesium ion token in Settings.

## Five-minute visual checklist
- Real terrain and satellite imagery are visible; no procedural geometry appears.
- OSM buildings appear where OpenStreetMap has building coverage.
- Observe at least five transitions: no teleport, white flash, black frame or viewer recreation.
- Place caption cross-fades and changes to the next destination.
- Fog remains light; terrain and imagery retain contrast and detail.
- Test Low / Medium / High quality.
- Hide the tab for 10 seconds, return, and verify flight resumes at the same point.
- Leave running for five minutes and monitor browser memory. Caches are capped, but browser/GPU memory can vary by device.
- Test offline / invalid-token behavior and automatic retry.

## CSP
Manifest V3 uses locally bundled scripts, wasm-unsafe-eval and worker-src 'self'. It does not add unsafe-eval or blob: to worker-src. Vite copies Cesium Workers, ThirdParty, Assets and Widgets into dist/cesium.

## Limitations
- 3D building coverage is only as complete as OpenStreetMap data.
- Tile prefetch warms terrain samples and selected imagery tiles. Full visual tile refinement remains camera-driven.
- Runtime/build verification must be completed locally in Chrome after pulling.
