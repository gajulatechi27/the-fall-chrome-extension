# THE FALL — Chrome New Tab cinematic descent

Manifest V3 Chrome extension built with Three.js and Vite. It creates a changing procedural aerial journey on each New Tab, with no 3D character.

## Current experience
- Stylized procedural skydiver built entirely from Three.js geometry; no external character model required.
- Belly-down freefall pose with subtle arm and leg movement, helmet, visor, flight suit and parachute pack.
- Procedural scenic routes: Himalayan-style peaks, riverside settlements, sea coasts, villages, towns, city skylines, winding ghat roads, highways, toll plazas and temple complexes.\n- Seeded terrain biomes, gradient sky, randomized sun, atmospheric fog and procedural cloud layers.
- Smooth cinematic aerial camera with restrained motion and altitude-aware field of view.
- Cinematic post-processing with restrained bloom, depth of field, vignette, FXAA and subtle radial motion blur.
- Wind streak particles with a reduced count on smaller displays.
- Chrome local storage saves last seed, descent count and biome.
- Rendering pauses when the tab is hidden. Responsive viewport and pixel-ratio cap.

## Build

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
The renderer caps pixel ratio at 1.5 on desktop and 1 on narrow screens. Wind particle counts and post-processing are deliberately restrained. 60 FPS is a target, not a guarantee on all GPUs.

## Roadmap
- Next: improve landmark realism, terrain blending, cloud volume and scene transitions based on real device screenshots.
- Dashboard and settings are intentionally not included in this build.
