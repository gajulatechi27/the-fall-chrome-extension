# THE FALL — Stage 1: procedural cinematic descent

A Manifest V3 Chrome New Tab extension. Stage 1 creates a continuous, automatically looping descent through a randomized procedural landscape. No controls, score or HUD.

## Stage 1 file structure

```text
public/
  manifest.json
  assets/
    README.md
    toposcope_sunset_1k.hdr   # optional local HDRI
src/
  main.js                     # renderer, seed, altitude and descent loop
  sky.js                      # gradient sky, sun, hemisphere light, HDRI
  clouds.js                   # three recycled simplex-noise cloud layers
  terrain.js                  # 6-octave fBm terrain, biome vertex colors, chunks, trees
  player.js                   # temporary primitive placeholder (Stage 1 only)
  effects.js                  # reserved for Stage 2 postprocessing
  style.css
index.html
vite.config.ts
package.json
```

## Build

Use Node.js 20.19+ or 22.12+.

```bash
git pull origin main
npm install
npm run build
```

Vite writes the unpacked extension to `dist/`. All JavaScript libraries are installed from npm and bundled locally. There are no CDN scripts, remote executable code or eval usage.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist` directory.
5. Open a new tab. After rebuilding, click the extension's Reload button.

## Optional HDRI

The gradient sky and local lights work without an HDRI. For image-based lighting, download Poly Haven's CC0 Toposcope Sunset 1K HDR:
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/toposcope_sunset_1k.hdr

Place it at:
`public/assets/toposcope_sunset_1k.hdr`

Then run `npm run build` again. The file is copied locally into `dist/assets`; no runtime internet connection is used.

## Stage 1 visual checks

- The sky gradient and sun glare are visible immediately.
- Three cloud layers move at different speeds and recycle ahead of the camera.
- The ground gradually emerges through atmospheric fog.
- The landscape uses simplex-noise fBm and randomized biome palettes.
- Terrain chunks recycle during the descent; instanced trees appear as altitude decreases.
- The landing transition fades to white and begins a new descent with a new seed/biome.
- Switching to another tab pauses rendering; returning resumes the descent.

## Stage boundaries

- **Stage 1 (current):** environment, descent lifecycle and temporary placeholder character.
- **Stage 2 (only after approval):** real rigged GLB + Mixamo animation, pmndrs postprocessing, wind streaks and enhanced camera effects.
- **Stage 3 (only after approval):** clock, focus timer, tasks, notes, bookmarks, weather and streak dashboard.
- **Stage 4 (only after approval):** settings, quality profiles, themes, ambient sound and screenshot control.

The Stage 1 placeholder is intentionally temporary. No external character asset is required yet.
