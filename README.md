# THE FALL — Endless Freefall

A cinematic endless-falling Chrome New Tab experience. The Yuga timelines, era labels and portal progression have been removed.

## Experience

- One continuous alpine valley environment: snowy mountain ranges, pine forests, winding river, a small mountain village, cloud banks and atmospheric particles.
- Third-person freefall camera positioned behind the skydiver, looking out over the valley.
- Procedural articulated human placeholder with an enlarged silhouette and animated limbs.
- Endless environment chunks recycle as the descent continues.
- Interactive steering (A/D or arrow keys, pointer/touch) and automatic cinematic watch mode.
- Distance and score HUD, pause, sound toggle and fullscreen.

## Run

```bash
npm install
npm run typecheck
npm run build
```

Load `dist/` from `chrome://extensions` with Developer mode enabled. For development, use `npm run dev`.

## Controls

- A / D or ← / →: steer
- Pointer / touch: steer horizontally
- Space: pause / resume
- F: fullscreen
- Watch Cinematic: automatic steering

## Asset status

The valley is currently generated from Three.js geometry and materials. The human is still an articulated procedural placeholder, not a realistic rigged GLB character. The reference photo supplied for the visual direction has not been embedded as a texture in this build. The next quality milestone is to add a licensed, high-quality skydiver GLB, authored mountain/forest assets, volumetric cloud layers and post-processing. All production assets should be packaged locally for reliable offline extension use.

## Stack

Three.js, TypeScript, Vite, Chrome Extension Manifest V3.
