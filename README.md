# THE FALL — Real World Descent

Chrome Manifest V3 New Tab extension. Stage 1 uses CesiumJS, Cesium World Terrain and satellite imagery, with optional Google Photorealistic 3D Tiles. The 3D character and procedural terrain/city generator are not used.

## Stage 1 locations
- Everest Region, Nepal
- Varanasi Ghats, Uttar Pradesh
- Mumbai, Maharashtra
- Goa Coast, Goa
- Hyderabad, Telangana

Each new tab randomly selects one destination. The camera begins about 9 km above the sampled terrain elevation and descends toward it. The place caption stays visible. Google 3D tiles are attempted when a Google key is configured; when they fail or are not available, the globe falls back to Cesium World Terrain and satellite imagery.

## Requirements
- Node.js 20.19+ or 22.12+
- A Cesium ion access token (required for World Terrain and World Imagery)
- A Google Maps Platform API key with Map Tiles API enabled (optional, for Photorealistic 3D Tiles; Google billing may apply)

## Install keys
1. Create a Cesium ion account at https://ion.cesium.com/signup/.
2. Copy your token from https://ion.cesium.com/tokens. Use a token with access to Cesium World Terrain and World Imagery.
3. For photorealistic city tiles, open Google Cloud Console, enable billing and the Map Tiles API, create an API key and restrict it to Map Tiles API.
4. Build and load the extension, then open its Settings page using the gear icon or Chrome extension Details → Extension options.
5. Paste the keys and choose Low, Medium or High. Settings are saved to chrome.storage.local; keys are not committed to this repository.

## Build locally (WSL Ubuntu)
```bash
cd /mnt/c/Users/LENOVO/Downloads/the-fall-chrome-extension-main/the-fall-chrome-extension-main
git pull origin main
npm install
npm run build
```

## Load in Chrome
1. Open chrome://extensions.
2. Enable Developer mode.
3. If this is the first install, click **Load unpacked** and select the project's `dist` folder. Otherwise click **Reload** on the extension.
4. Open a new tab. Click the gear icon, enter the Cesium token and optional Google key, save, then open a fresh tab.

## Visual checks for Stage 1
- **Everest:** snow/rock relief and real mountain ridgelines, not generated cones.
- **Varanasi:** real Ganga river surface, river bends and available riverside 3D detail.
- **Mumbai:** coastline, harbour and available photorealistic city tiles.
- **Goa:** Arabian Sea, coastline and beach terrain.
- **Hyderabad:** real satellite ground pattern and available urban 3D tiles.
- **Fallback:** temporarily use an invalid Google key; the globe should remain visible with Cesium terrain and imagery and show the fallback status.
- **Quality:** test Low, Medium and High on the same destination and compare smoothness/detail.
- **Privacy:** keys remain in Chrome local storage, not in source files.

## Technical notes
- Cesium's Workers, ThirdParty, Assets and Widgets are copied into the local build by Vite; no Cesium JavaScript is loaded from a CDN.
- Manifest V3 CSP allows locally bundled scripts and Cesium's local/blob workers; network access is restricted by host permissions to Cesium and Google tile hosts.
- Google Photorealistic 3D coverage varies by place. Some remote areas may show terrain and imagery only.
- Google map credits are displayed through Cesium's on-screen credit UI. Do not remove attribution.
- This implementation has not yet been built or visually verified on your machine. Check browser console and tile network errors after your first run.

## Stage 1 boundary
Only the five destinations above are included. The rest of the requested India location list is deferred until feedback.
