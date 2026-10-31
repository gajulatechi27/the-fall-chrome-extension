# Stage 2 character asset (required)

The game now loads a real skinned character with Three.js GLTFLoader and AnimationMixer. It intentionally does not create a primitive fallback.

## Download a free Mixamo character and freefall animation

1. Open **https://www.mixamo.com/** and sign in with an Adobe account.
2. In **Characters**, choose a free Mixamo character such as **X Bot** or **Y Bot**.
3. Select **Animations** and search for **Falling Idle** or **Falling**. Preview the animation and choose a belly-down spread-eagle freefall pose. Mixamo's animation catalogue can change, so choose the closest matching freefall animation available in your account.
4. Click **Download**:
   - Format: **FBX Binary**
   - Skin: **With Skin**
   - Frames per Second: **30**
   - Keyframe Reduction: **none** (if available)
5. Open Blender (free: https://www.blender.org/download/), delete the default objects, then use **File → Import → FBX** to import the Mixamo FBX.
6. Scrub the timeline to confirm the character is rigged and the falling animation plays.
7. Use **File → Export → glTF 2.0**:
   - Format: **glTF Binary (.glb)**
   - Include: Selected Objects (if you selected the character and armature)
   - Enable **Skinning** and **Animations**
   - Export the animation with the character.
8. Save the file with this exact name:

`skydiver-freefall.glb`

9. Put it in this exact project location:

`public/assets/skydiver-freefall.glb`

10. Rebuild the extension:

```bash
npm install
npm run build
```

Then reload the extension at `chrome://extensions`.

## HDRI asset

Optional: download the free CC0 Poly Haven Toposcope Sunset 1K HDRI:
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/toposcope_sunset_1k.hdr

Save as `public/assets/toposcope_sunset_1k.hdr`, then rebuild.

## Licence reminder

Mixamo characters and animations are available to download for use under Adobe's Mixamo terms. Review those terms before redistributing the exported character inside a public repository or extension. Do not commit your GLB to GitHub unless you have confirmed redistribution is permitted. For local testing, keep the GLB in your local working copy.
