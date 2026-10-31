# THE FALL — A Journey Through Time

A cinematic endless-falling experience designed to replace the Chrome New Tab page.

## Current build

- Chrome Extension Manifest V3 / New Tab override
- Three.js + TypeScript + Vite
- Four sequential Yuga timelines: Satya, Treta, Dvapara and Kali
- Era-specific procedural scenery, landmarks, lighting palettes and atmospheric particles
- Articulated procedural falling character with animated arms and legs
- Third-person cinematic camera movement and portal transition sequence
- Interactive steering (A/D or arrow keys, pointer/touch)
- Automatic watch mode
- Time-fragment score, distance HUD, pause and sound controls

## Run locally

```bash
npm install
npm run typecheck
npm run build
```

Load the generated `dist/` directory in Chrome:
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `dist/`.

For development, run `npm run dev`.

## Controls

- A / D or ← / →: steer
- Pointer / touch: steer horizontally
- Space: pause / resume
- F: fullscreen
- Watch The Journey: automatic camera/player movement

## Current limitations

The character is still a procedural Three.js model, not a photorealistic scanned human or a rigged GLB asset. The Yuga environments are generated from procedural geometry rather than hand-authored high-detail environment assets. The portal transition is an in-engine visual transition, not a fully streamed cinematic sequence. Persistent settings, saved scores, obstacle gameplay, and locally bundled fonts are not yet implemented.

## Next milestones

1. Import a high-quality licensed GLB human with a proper skeleton and falling animation.
2. Build authored, high-detail environment assets for each Yuga.
3. Add layered cloud volumes, post-processing bloom and cinematic portal VFX.
4. Implement streamed world chunks, obstacles, collectibles and persistent progression.
5. Add graphics settings, performance profiling and offline-bundled fonts.

## Stack

Three.js, TypeScript, Vite, Chrome Extension Manifest V3.
