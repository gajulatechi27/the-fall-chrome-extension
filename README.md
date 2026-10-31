# THE FALL — Chrome New Tab cinematic descent

Manifest V3 Chrome extension built with Three.js and Vite. It creates a procedural skydiving descent on each New Tab.

## Stage 1 — Environment
- Procedural simplex-noise clouds in three recycled layers.
- Six-octave fBm terrain with biome color variation and recycled chunks.
- Gradient sky, randomized sun direction, atmospheric fog and instanced trees.
- Seeded biome/time/weather selection and white landing transition.
- Chrome local storage saves last seed, descent count and biome.

## Stage 2 — Character and cinematic effects (current code)
- Rigged GLB character loaded with Three.js `GLTFLoader`.
- Embedded animation played through `AnimationMixer`.
- pmndrs `postprocessing`: bloom, depth of field, brightness/contrast grading, vignette and FXAA.
- Custom radial motion-blur effect, wind particles, subtle camera shake and speed-based FOV.
- No primitive character fallback. If the GLB is missing, the landscape continues rendering without a character and logs the exact expected asset path.

### Required character asset
Download a free Mixamo character (e.g. X Bot or Y Bot) and a falling/freefall animation, export FBX with skin, then export a GLB from Blender with skinning and animation enabled.

**Exact destination:** `public/assets/skydiver-freefall.glb`

Detailed steps: [public/assets/README.md](public/assets/README.md)

Optional Poly Haven HDRI:
`public/assets/toposcope_sunset_1k.hdr`

Do not commit character files to a public repository unless their licence allows redistribution. The extension loads local assets only; no runtime CDN or remote script is used.

## Install / build

Use Node.js 20.19+ or 22.12+.

```bash
git pull origin main
npm install
npm run build
```

Load the generated `dist/` directory:
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the project's `dist` folder.
5. Reload the extension after each build.

For a phone preview on the same Wi-Fi, run `npm run dev` and open `http://YOUR_COMPUTER_LAN_IP:5173` on the phone.

## Performance
Pixel ratio is capped at 2 on desktop and 1 on narrow/mobile screens. Postprocessing renders at a reduced internal resolution; wind particle count is reduced on mobile. Rendering pauses when the tab is hidden. 60 FPS is a target, not a guarantee on all GPUs.

## Planned stages
- Stage 3 (not started): glass dashboard, clock, focus timer, tasks, notes, quick links, weather and streaks.
- Stage 4 (not started): settings, quality profiles, themes, ambient wind audio and screenshot button.
