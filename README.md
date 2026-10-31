# THE FALL — A Journey Through Time

A cinematic endless-falling experience designed to replace the Chrome New Tab page.

## MVP

- Chrome Extension Manifest V3 / New Tab override
- Three.js + TypeScript + Vite
- Interactive steering (A/D or arrow keys, pointer/touch)
- Automatic watch mode
- Four procedural timelines: Satya Yuga, Ancient Greece (c.1000 BCE), Ice Age, and Future Earth (3000 AD)
- Time-fragment score, distance HUD, pause and sound controls
- Responsive UI and reduced-motion CSS support

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

## Current prototype limitations

This is an early procedural MVP. The falling character is assembled from Three.js primitives rather than a production character rig; environments are procedural silhouettes rather than optimized authored assets; transitions and world streaming are prototype-level. Persistent settings, saved scores, obstacle gameplay, and local font packaging are not yet implemented. The declared Chrome storage permission is reserved for a later persistence milestone.

## Planned milestones

1. Replace primitive character with an animated, optimized GLB character.
2. Build distinct authored environment assets for each era.
3. Implement seamless portal transitions and streamed world chunks.
4. Add obstacles, collectibles, collision handling, and persistent progression.
5. Add graphics settings, performance profiling, and offline-bundled fonts.

## Stack

Three.js, TypeScript, Vite, Chrome Extension Manifest V3.
