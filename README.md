# THE FALL — A Journey Through Time

A cinematic endless-falling experience designed to replace the Chrome New Tab page.

## Current build

- Chrome Extension Manifest V3 / New Tab override
- Three.js + TypeScript + Vite
- Four sequential Yuga timelines: Satya, Treta, Dvapara and Kali
- Distinct procedural scenery: sacred forest and shrine, river valley and temple complex, fortified capital, futuristic illuminated skyline
- Two recycled environment chunks per era to prevent the world from disappearing during descent
- Layered mountain silhouettes, cloud banks, terrain, foreground rocks and atmospheric particles
- Articulated procedural falling character with animated arms and legs
- Third-person camera, lighting, shadows and portal transition
- Interactive steering (A/D or arrow keys, pointer/touch) and automatic watch mode
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

## Honest asset status and limitations

The environments and character are currently generated from Three.js geometry and materials. The character is an articulated procedural placeholder, **not yet a photorealistic human or an imported rigged GLB model**. The environments are more varied and now recycle two scenery chunks per era, but they are not yet hand-authored high-detail environment assets. The portal is a lightweight visual transition rather than a fully cinematic streamed sequence. External model assets should be licensed and packaged locally before use so the Chrome extension works offline.

## Next milestones

1. Import a high-quality licensed GLB human with a proper skeleton and falling animation.
2. Replace procedural landmark placeholders with optimized, locally packaged GLB environment assets for each Yuga.
3. Add layered cloud volumes, post-processing bloom and richer portal VFX.
4. Add obstacles, collectibles, collision handling and persistent progression.
5. Add graphics settings, performance profiling and offline-bundled fonts.

## Stack

Three.js, TypeScript, Vite, Chrome Extension Manifest V3.
