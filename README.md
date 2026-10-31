# THE FALL — cinematic New Tab descent

A Manifest V3 Chrome extension replacing New Tab with a silent, non-interactive full-screen skydiver descent. No controls, score, or HUD.

## Architecture
- `src/main.js`: randomized descent lifecycle, altitude stages, fade/reset, hidden-tab pause.
- `src/sky.js`: gradient sky shader, directional/hemisphere lighting, optional local HDRI via RGBELoader and PMREM.
- `src/clouds.js`: procedural noise cloud sprites, spawned ahead and recycled.
- `src/terrain.js`: seeded noise terrain chunks, procedural surface textures, fog and regeneration.
- `src/player.js`: GLTFLoader and AnimationMixer; subtle wind sway; no primitive character.
- `src/effects.js`: pmndrs postprocessing bloom, depth of field, motion blur, vignette, tone mapping and SMAA.

## Required local assets
Add these under `public/assets/` before building:
1. `skydiver-freefall.glb` — licensed rigged character with Mixamo freefall animation embedded.
2. `toposcope_sunset_1k.hdr` — Poly Haven CC0 HDRI (optional; gradient sky remains fallback).

See `public/assets/README.md`. Export a character you are licensed to use; do not redistribute restricted assets. The app intentionally has no toy/primitive fallback if the GLB is missing.

## Build and load in Chrome
Use Node.js 20.19+ or 22.12+.
```bash
npm install
npm run typecheck
npm run build
```
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked** and select the project's `dist/` folder.
4. Open a new tab. After code or asset changes, rebuild and click Reload.

## Performance
Adaptive DPR is capped at 1.5 (1.0 on narrow screens); terrain uses four recycled chunks, clouds use sprites, and rendering pauses when the tab is hidden. 60 FPS is a target, not guaranteed on every GPU. Reduce DPR, cloud count, terrain resolution and shadow quality on slower hardware.

## CSP and privacy
No CDN scripts, remote code, eval or runtime network dependencies. Vite bundles npm libraries locally. The HDRI and character are loaded from local extension paths.
