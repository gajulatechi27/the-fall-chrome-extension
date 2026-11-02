import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { createVegetation } from "./vegetation.js";

const CHUNK_SIZE = 3000;
const SEGMENTS = 128;
const GRID_RADIUS = 5;
const GRID_DIAMETER = GRID_RADIUS * 2 + 1;
const WATER_LEVEL = -28;
const WATER_SIZE = 30000;
const HEIGHT_BASE = 20;
const BIOME_HEIGHT = { mountains: 185, desert: 105, islands: 118, forest: 145, snow: 230 };

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fbm(noise, x, z, octaves = 6) {
  let sum = 0, amp = 0.55, freq = 0.00135, norm = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.48;
    freq *= 1.9;
  }
  return sum / norm;
}

function riverCenterX(noise, worldZ) {
  // The flight camera sees only a limited stretch of river at once. Use
  // kilometre-scale meanders so bends are visible in that view, with slower
  // secondary drift to keep the route irregular rather than sinusoidal.
  return Math.sin(worldZ * 0.00155 + 0.35) * 1080 +
    Math.sin(worldZ * 0.00072 - 1.25) * 520 +
    Math.sin(worldZ * 0.00031 + 2.0) * 240 +
    noise(0.0, worldZ * 0.00042) * 115;
}

function riverWidthAt(noise, worldZ, baseWidth) {
  const variation = 0.88 + 0.09 * Math.sin(worldZ * 0.00019 + 0.8) +
    0.05 * noise(13.7, worldZ * 0.00012);
  return Math.max(24, baseWidth * variation);
}

function applyRiverChannel(height, x, worldZ, noise, environment) {
  if (environment?.water?.type !== "river") return height;
  const width = riverWidthAt(noise, worldZ, environment.water.width || 120);
  const distance = Math.abs(x - riverCenterX(noise, worldZ));
  const riverValley = environment.id === "river-valley";
  const innerBank = riverValley ? 0.58 : 0.48;
  const outerBank = riverValley ? 2.25 : 1.8;
  const channel = 1.0 - THREE.MathUtils.smoothstep(distance, width * innerBank, width * outerBank);
  // River Valley gets a broader, deeper channel with a long floodplain shoulder.
  return height - channel * (riverValley ? 148 : 126);
}

function mountainRelief(noise, x, z, ridgeWeight = 1, himalayan = false) {
  const primary = 1 - Math.abs(noise(x * (himalayan ? 0.00082 : 0.00105), z * (himalayan ? 0.00082 : 0.00105)));
  const secondary = 1 - Math.abs(noise(x * 0.00215 + 13, z * 0.00215 - 7));
  if (himalayan) {
    // Domain-warped, intersecting ridge systems form irregular connected
    // massifs with long shoulders and occasional asymmetric summit spurs.
    const warpX = x + noise(x * 0.00022 + 31, z * 0.00022 - 17) * 690;
    const warpZ = z + noise(x * 0.00019 - 23, z * 0.00019 + 41) * 610;
    // Slightly elongated, differently oriented ridge fields create long
    // connected crests; low-frequency warp keeps their outlines asymmetric.
    const broadA = 1 - Math.abs(noise(warpX * 0.00043 + 7, warpZ * 0.00055 - 11));
    const broadB = 1 - Math.abs(noise(warpX * 0.00031 - 43, warpZ * 0.00039 + 29));
    const crossRidge = 1 - Math.abs(noise(warpX * 0.00068 + 67, warpZ * 0.00057 - 53));
    const secondaryRidge = 1 - Math.abs(noise(warpX * 0.00112 - 29, warpZ * 0.00129 + 41));
    const fine = 1 - Math.abs(noise(warpX * 0.00205 + 13, warpZ * 0.00245 - 7));
    const shoulder = noise(warpX * 0.00021 + 17, warpZ * 0.00021 - 23);
    const glacialCut = Math.pow(Math.abs(noise(warpX * 0.00034 + 53, warpZ * 0.00034 - 37)), 1.08);
    // Wider troughs and a flatter central floor produce a more legible U-shaped
    // glacial cross-section without simply lowering the whole mountain field.
    const valleyField = Math.abs(noise(warpX * 0.00027 - 61, warpZ * 0.00027 + 47));
    const valley = 1 - THREE.MathUtils.smoothstep(valleyField, 0.045, 0.285);
    const valleyFloor = 1 - THREE.MathUtils.smoothstep(valleyField, 0.015, 0.105);
    const massif = Math.max(0, noise(warpX * 0.00016 - 17, warpZ * 0.00016 + 23) + 0.2);
    const spurField = 1 - Math.abs(noise(warpX * 0.00155 + 101, warpZ * 0.00125 - 83));
    const spur = Math.pow(Math.max(0, spurField), 2.35);
    const crestBreak = noise(warpX * 0.00088 + 137, warpZ * 0.00073 - 119);
    return (
      Math.pow(Math.max(0, broadA), 1.58) * 91 +
      Math.pow(Math.max(0, broadB), 1.78) * 58 +
      Math.pow(Math.max(0, crossRidge), 2.05) * 21 +
      Math.pow(Math.max(0, primary), 2.2) * 16 +
      Math.pow(Math.max(0, secondaryRidge), 2.45) * 9 +
      Math.pow(Math.max(0, secondary), 3.0) * 3 +
      Math.pow(Math.max(0, fine), 3.0) * 2 +
      spur * 11 + massif * 36 + shoulder * 7 + crestBreak * 5 -
      glacialCut * 8 - valley * 57 - valleyFloor * 16
    ) * ridgeWeight;
  }
  return (
    Math.pow(Math.max(0, primary), 2.65) * 112 +
    Math.pow(Math.max(0, secondary), 3.1) * 24
  ) * ridgeWeight;
}

function applyAlpineLakeTerrain(height, x, worldZ, noise, warpX, warpZ) {
  // One coherent, irregular lake basin. The same field is used by chunk
  // generation, height queries and water clipping to prevent detached water.
  const nx = x / 4300;
  const nz = (worldZ + 2500) / 5350;
  const shoreWarp = noise(x * 0.00052 + 31, worldZ * 0.00052 - 17) * 0.055 +
    noise(x * 0.00115 - 9, worldZ * 0.00115 + 23) * 0.022;
  const basinRadius = Math.sqrt(nx * nx + nz * nz) + shoreWarp;
  const basin = 1.0 - THREE.MathUtils.smoothstep(basinRadius, 0.82, 1.025);
  const bed = -154 + noise(warpX * 0.00038, warpZ * 0.00038) * 7;
  let result = THREE.MathUtils.lerp(height, bed, basin);

  // Deliberate islands and peninsulas, not accidental terrain peaks poking
  // through a huge flat water plane. Each island has a soft, irregular shore.
  const islands = [
    [-1550, -2950, 760, 145],
    [650, -3900, 620, 128],
    [1880, -2050, 690, 152],
    [-650, -900, 560, 118],
    [-2350, -4450, 520, 105]
  ];
  for (let i = 0; i < islands.length; i++) {
    const [cx, cz, radius, lift] = islands[i];
    const dx = (x - cx) / radius;
    const dz = (worldZ - cz) / (radius * 0.78);
    const edgeNoise = noise((x + i * 713) * 0.0011, (worldZ - i * 419) * 0.0011) * 0.11;
    const distance = Math.sqrt(dx * dx + dz * dz) + edgeNoise;
    const island = 1.0 - THREE.MathUtils.smoothstep(distance, 0.68, 1.12);
    const crown = lift * island * (0.78 + noise(warpX * 0.0012 + i, warpZ * 0.0012 - i) * 0.18);
    result = Math.max(result, bed + crown);
  }
  return result;
}

function makeTerrainShader(material, biome, environment = null) {
  const paletteTint = environment?.paletteTint || (biome === "desert" ? "vec3(1.12,0.91,0.68)" : biome === "snow" || biome === "mountains" ? "vec3(0.91,0.97,1.04)" : "vec3(0.92,1.04,0.88)");
  const snowLineLow = environment?.materialMix?.snow?.[0] ?? 145;
  const snowLineHigh = environment?.materialMix?.snow?.[1] ?? 185;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vFallWorldPosition;
varying vec3 vFallWorldNormal`
    ).replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vFallWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFallWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vFallWorldPosition;
varying vec3 vFallWorldNormal;
float fallHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float fallNoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(fallHash(i),fallHash(i+vec2(1.,0.)),f.x),
             mix(fallHash(i+vec2(0.,1.)),fallHash(i+vec2(1.,1.)),f.x),f.y);
}
float fallDetail(vec2 p){
  float n=0.0, a=.55;
  for(int i=0;i<5;i++){ n += (fallNoise(p)-.5)*a; p*=2.03; a*=.5; }
  return n;
}`
    ).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float fallSlope = 1.0 - clamp(abs(normalize(vFallWorldNormal).y), 0.0, 1.0);
float fallHeight = vFallWorldPosition.y;
float fallNoiseValue = fallDetail(vFallWorldPosition.xz * 0.012);
float fallMicro = fallDetail(vFallWorldPosition.xz * 0.045);
float fallFieldNoise = fallDetail(vFallWorldPosition.xz * 0.00062);
float fallFieldPatch = smoothstep(-0.12, 0.16, fallFieldNoise);
float fallFieldRows = 0.5 + 0.5 * sin((vFallWorldPosition.x * 0.0017 + vFallWorldPosition.z * 0.0009) + fallNoiseValue * 2.0);
float fallFieldGrid = ${environment?.id === "river-valley" ? "1.0" : "0.0"};
vec2 fallFieldCell = vec2(vFallWorldPosition.x * 0.0025, vFallWorldPosition.z * 0.0018);
vec2 fallFieldCoord = fract(fallFieldCell + vec2(fallFieldNoise * 0.12, fallFieldNoise * 0.08));
vec2 fallFieldEdge = min(fallFieldCoord, 1.0 - fallFieldCoord);
float fallFieldBoundary = 1.0 - smoothstep(0.012, 0.045, min(fallFieldEdge.x, fallFieldEdge.y));
float fallWet = 1.0 - smoothstep(-34.0, -23.0, fallHeight + fallNoiseValue * 5.0);
float fallDry = smoothstep(-31.0, -8.0, fallHeight + fallNoiseValue * 5.0);
float fallGrass = smoothstep(-12.0, 24.0, fallHeight);
float fallRock = smoothstep(0.18 + fallMicro * 0.035, 0.56 + fallMicro * 0.035, fallSlope);
float fallSnowLine = smoothstep(${snowLineLow.toFixed(1)} + fallNoiseValue * 18.0, ${snowLineHigh.toFixed(1)} + fallNoiseValue * 18.0, fallHeight);
float fallSnowCoverage = fallSnowLine * ${environment?.id === "himalayan-range" ? "(1.0 - smoothstep(0.62, 0.96, fallSlope) * 0.28)" : "1.0"};
float fallValleySnow = ${environment?.id === "himalayan-range" ? "smoothstep(0.12, 0.42, fallNoiseValue + 0.22) * (1.0 - smoothstep(0.38, 0.72, fallSlope)) * 0.34" : "0.0"};
fallSnowCoverage = max(fallSnowCoverage, fallValleySnow);
vec3 fallWetSand = ${environment?.id === "himalayan-range" ? "vec3(0.24, 0.31, 0.37)" : biome === "desert" ? "vec3(0.48, 0.34, 0.20)" : "vec3(0.34, 0.42, 0.39)"};
vec3 fallDrySand = ${environment?.id === "himalayan-range" ? "vec3(0.36, 0.42, 0.47)" : biome === "desert" ? "vec3(0.88, 0.62, 0.30)" : "vec3(0.72, 0.57, 0.37)"};
vec3 fallGrassColor = ${environment?.id === "himalayan-range" ? "vec3(0.27, 0.33, 0.36)" : environment?.id === "green-hills" ? "vec3(0.25, 0.46, 0.22)" : environment?.id === "river-valley" ? "mix(vec3(0.25, 0.39, 0.20), vec3(0.39, 0.43, 0.23), fallFieldPatch * 0.72 + fallFieldRows * 0.12)" : biome === "desert" ? "vec3(0.79, 0.52, 0.23)" : biome === "snow" ? "vec3(0.31, 0.37, 0.32)" : "vec3(0.23, 0.39, 0.23)"};
vec3 fallForestFloor = ${environment?.id === "himalayan-range" ? "vec3(0.20, 0.26, 0.30)" : environment?.id === "green-hills" ? "vec3(0.16, 0.30, 0.17)" : biome === "desert" ? "vec3(0.66, 0.43, 0.22)" : biome === "snow" ? "vec3(0.19, 0.23, 0.22)" : "vec3(0.14, 0.25, 0.17)"};
vec3 fallRockColor = ${environment?.id === "himalayan-range" ? "vec3(0.29, 0.34, 0.39)" : environment?.id === "green-hills" ? "vec3(0.31, 0.36, 0.29)" : biome === "desert" ? "vec3(0.55, 0.37, 0.25)" : "vec3(0.37, 0.39, 0.40)"};
vec3 fallSnowColor = vec3(0.91, 0.94, 0.97);
vec3 fallBiomeTint = ${paletteTint};
vec3 fallGround = mix(fallWetSand, fallDrySand, fallDry);
fallGround = mix(fallGround, fallGrassColor * fallBiomeTint, fallGrass);
fallGround = mix(fallGround, fallGround * vec3(0.78, 0.82, 0.68), fallFieldBoundary * fallFieldGrid * fallGrass * 0.62);
fallGround = mix(fallGround, fallForestFloor * fallBiomeTint, smoothstep(22.0, 58.0, fallHeight) * 0.35);
fallGround = mix(fallGround, fallRockColor * (0.94 + fallMicro * 0.12), fallRock);
fallGround = mix(fallGround, fallSnowColor, fallSnowCoverage);
fallGround *= 1.04 + fallNoiseValue * 0.12 + fallMicro * 0.04;
diffuseColor.rgb = mix(diffuseColor.rgb, fallGround, 0.98);`
    );
  };
  material.customProgramCacheKey = () => "the-fall-terrain-shore-v3-" + biome + "-" + (environment?.paletteTint || "default") + "-" + (environment?.materialMix?.snow?.[0] || 145);
}

function makeChunk(noise, seed, z, biome, xOffset = 0, chunkSize = CHUNK_SIZE, segments = SEGMENTS, environment = null) {
  const positions = [];
  const indices = [];
  const heights = new Float32Array((segments + 1) * (segments + 1));
  let minHeight = Infinity, maxHeight = -Infinity;
  const step = chunkSize / segments;
  const amplitude = environment?.terrain?.baseHeight ?? BIOME_HEIGHT[biome] ?? 145;

  const heightAt = (x, worldZ) => {
    const warpX = x + noise(x * 0.0007, worldZ * 0.0007) * 115;
    const warpZ = worldZ + noise((x + 900) * 0.0007, (worldZ - 400) * 0.0007) * 115;
    let h = fbm(noise, warpX, warpZ, environment?.terrain?.noiseOctaves ?? 6) * amplitude;
    if (environment?.terrain?.valleyCarving) h -= Math.abs(noise(warpX * 0.00048, warpZ * 0.00048)) * environment.terrain.valleyCarving * amplitude * 0.34;
    h = applyRiverChannel(h, x, worldZ, noise, environment);
    if (biome === "islands") {
      const ridgeA = 1.0 - Math.abs(noise(warpX * 0.00145, warpZ * 0.00145));
      const ridgeB = 1.0 - Math.abs(noise(warpX * 0.0031 + 17.0, warpZ * 0.0031 - 9.0));
      h += (Math.pow(Math.max(0.0, ridgeA), 2.0) * 34 + Math.pow(Math.max(0.0, ridgeB), 2.4) * 13) * (environment?.terrain?.ridgeWeight ?? 1);
      const shoreZ = Math.sin(x * 0.00022) * 1150 + Math.sin(x * 0.00061 + 1.7) * 360 + noise(x * 0.00048, worldZ * 0.00031) * 260;
      const coast = THREE.MathUtils.smoothstep(shoreZ + worldZ + 900, -720, 260);
      const headland = Math.pow(Math.max(0, Math.sin(x * 0.00016 + 0.8)), 5) * 95;
      const dune = Math.max(0, noise(x * 0.0013, worldZ * 0.0011)) * 18;
      h = THREE.MathUtils.lerp(-100 + h * 0.12, 80 + h * 0.48 + headland + dune, coast);
    }
    if (biome === "forest") {
      const rolling = noise(warpX * 0.00034 + 31.0, warpZ * 0.00034 - 17.0);
      const shoulder = noise(warpX * 0.00082 - 9.0, warpZ * 0.00082 + 23.0);
      if (environment?.id === "green-hills") {
        const broadMeadow = noise(warpX * 0.00019 + 47.0, warpZ * 0.00022 - 63.0);
        const hillShoulder = noise(warpX * 0.00053 - 29.0, warpZ * 0.00061 + 11.0);
        const softRidge = 1.0 - Math.abs(noise(warpX * 0.00072 + 83.0, warpZ * 0.00064 - 37.0));
        h += broadMeadow * 43 + rolling * 12 + hillShoulder * 4.5 + Math.pow(Math.max(0, softRidge), 2.8) * 4 + shoulder * 2.0;
      } else if (environment?.id === "river-valley") {
        const broadValley = noise(warpX * 0.00017 + 19.0, warpZ * 0.00016 - 37.0);
        const valleyShoulder = noise(warpX * 0.00031 - 51.0, warpZ * 0.00034 + 13.0);
        const lowRelief = 1.0 - Math.abs(noise(warpX * 0.00046 + 73.0, warpZ * 0.00042 - 29.0));
        // Agricultural valleys should read as broad lowland basins, not
        // another field of tightly repeated rolling hills.
        h += broadValley * 11 + rolling * 2.8 + valleyShoulder * 2.2 +
          Math.pow(Math.max(0, lowRelief), 2.2) * 1.8 + shoulder * 0.8;
      } else { h += rolling * 15 + shoulder * 3.5; }
    }
    if (biome === "desert") {
      const windWarp = noise(warpX * 0.00024 + 19.0, warpZ * 0.00018 - 7.0);
      const duneField = warpZ * 0.00034 + noise(warpX * 0.00028, warpZ * 0.00016) * 1.25 +
        Math.sin(warpX * 0.00022 + windWarp * 1.4) * 0.38;
      const broadDune = Math.sin(duneField) * 58 + Math.sin(duneField * 0.52 + 1.3 + windWarp * 0.3) * 30;
      const duneletsField = duneField * 2.65 + noise(warpX * 0.00072 + 41.0, warpZ * 0.00058) * 0.9;
      const dunelets = Math.sin(duneletsField) * (10 + noise(warpX * 0.0009, warpZ * 0.00075) * 4.5);
      const smallDunesField = duneField * 6.2 + noise(warpX * 0.00145 - 13.0, warpZ * 0.0012 + 29.0) * 0.65;
      const smallDunes = Math.sin(smallDunesField) * 4.2;
      const windRipples = Math.sin(duneField * 11.5 + warpX * 0.0011) * 1.35;
      h = h * 0.32 + broadDune + dunelets + smallDunes + windRipples;
    }
    if (biome === "mountains" || biome === "snow") {
      const ridgeWeight = environment?.terrain?.ridgeWeight ?? 1;
      h += environment?.terrain?.mountainProfile === "himalayan"
        ? mountainRelief(noise, warpX, warpZ, ridgeWeight, true)
        : (Math.pow(Math.max(0, 1 - Math.abs(noise(warpX * 0.00105, warpZ * 0.00105))), 2.65) * (biome === "snow" ? 112 : 76) +
           Math.pow(Math.max(0, 1 - Math.abs(noise(warpX * 0.00215 + 13, warpZ * 0.00215 - 7))), 3.1) * (biome === "snow" ? 24 : 18)) * ridgeWeight;
    }
    // Apply the lake basin after mountain relief so ridge generation cannot
    // refill the lake floor and turn the water surface into a giant land patch.
    if (environment?.water?.type === "lake") {
      h = applyAlpineLakeTerrain(h, x, worldZ, noise, warpX, warpZ);
    }
    return h;
  };

  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const x = -chunkSize * 0.5 + col * step;
      const worldX = xOffset + x;
      const localZ = -chunkSize * 0.5 + row * step;
      const worldZ = z + localZ;
      const h = heightAt(worldX, worldZ);
      heights[row * (segments + 1) + col] = h;
      const worldHeight = HEIGHT_BASE + h;
      minHeight = Math.min(minHeight, worldHeight);
      maxHeight = Math.max(maxHeight, worldHeight);
      positions.push(x, worldHeight, localZ);
    }
  }

  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // A narrow skirt closes the outer silhouette and hides sub-pixel cracks.
  const edge = [];
  for (let x = 0; x <= segments; x++) edge.push(x);
  for (let y = 1; y <= segments; y++) edge.push(y * (segments + 1) + segments);
  for (let x = segments - 1; x >= 0; x--) edge.push(segments * (segments + 1) + x);
  for (let y = segments - 1; y > 0; y--) edge.push(y * (segments + 1));
  const skirtStart = positions.length / 3;
  for (const index of edge) {
    const x = positions[index * 3], y = positions[index * 3 + 1], zLocal = positions[index * 3 + 2];
    positions.push(x, y - 35, zLocal);
  }
  for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    indices.push(edge[i], skirtStart + i, edge[next], edge[next], skirtStart + i, skirtStart + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  // Compute normals from the same world-space height function on every chunk,
  // including neighbour samples beyond chunk borders.
  const normals = new Float32Array(positions.length);
  // Match normal sampling to the actual vertex spacing; tiny analytic samples
  // exaggerate frequencies that the mesh cannot represent.
  const normalStep = Math.max(8, step * 0.55);
  for (let i = 0; i < skirtStart; i++) {
    const x = positions[i * 3], worldX = xOffset + x, localZ = positions[i * 3 + 2], worldZ = z + localZ;
    const dx = heightAt(worldX + normalStep, worldZ) - heightAt(worldX - normalStep, worldZ);
    const dz = heightAt(worldX, worldZ + normalStep) - heightAt(worldX, worldZ - normalStep);
    const n = new THREE.Vector3(-dx / (2 * normalStep), 1, -dz / (2 * normalStep)).normalize();
    normals[i * 3] = n.x; normals[i * 3 + 1] = n.y; normals[i * 3 + 2] = n.z;
  }
  for (let i = skirtStart; i < positions.length / 3; i++) {
    normals[i * 3] = 0; normals[i * 3 + 1] = 1; normals[i * 3 + 2] = 0;
  }
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  // Explicit bounds include every terrain vertex and the perimeter skirt.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0, side: THREE.DoubleSide });
  makeTerrainShader(material, biome, environment);
  const mesh = new THREE.Mesh(geometry, material);
  const vegetation = createVegetation({
    seed,
    biome,
    environment,
    xOffset,
    chunkZ: z,
    chunkSize,
    segments,
    heightAt,
    seaLevel: environment?.water?.level ?? WATER_LEVEL
  });
  if (vegetation) mesh.add(vegetation);
  mesh.position.x = 0;
  mesh.position.z = z;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.biome = biome;
  mesh.userData.baseZ = z;
  mesh.userData.chunkSize = chunkSize;
  mesh.userData.lodSegments = segments;
  mesh.userData.minHeight = minHeight;
  mesh.userData.maxHeight = maxHeight;
  mesh.userData.heightAt = heightAt;
  mesh.userData.worldX = xOffset;
  return mesh;
}

function createWaterMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(-0.45, 0.78, -0.42).normalize() },
      uSeed: { value: (seed % 10000) * 0.013 },
      uWaterLevel: { value: -28.0 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vViewDirection;
      attribute float terrainHeight;
      varying float vTerrainHeight;
      void main(){
        vec4 world = modelMatrix * vec4(position,1.0);
        vWorldPosition = world.xyz;
        vTerrainHeight = terrainHeight;
        vec4 mv = viewMatrix * world;
        vViewDirection = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uSeed;
      uniform float uWaterLevel;
      uniform vec3 uSunDirection;
      varying vec3 vWorldPosition;
      varying vec3 vViewDirection;
      varying float vTerrainHeight;
      float hash21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))+uSeed)*43758.5453); }
      float noise2(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
                   mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
      }
      float fbm2(vec2 p){
        float n=0.,a=.55;
        for(int i=0;i<5;i++){n+=(noise2(p)-.5)*a;p*=2.03;a*=.5;}
        return n;
      }
      void main(){
        if (vTerrainHeight >= uWaterLevel) discard;
        vec2 p=vWorldPosition.xz;
        float t=uTime;
        float n1=fbm2(p*.0045+vec2(t*.018,-t*.012));
        float n2=fbm2(p*.010+vec2(-t*.026,t*.019));
        vec2 ripple=vec2(dFdx(n1+n2),dFdy(n1+n2))*3.8;
        vec3 normal=normalize(vec3(-ripple.x,1.0,-ripple.y));
        float viewDot=max(dot(normalize(vViewDirection),normal),0.0);
        float fresnel=pow(1.0-viewDot,4.0);
        // Estimate shoreline from the same broad world-space noise field as terrain.
        float waterDepth=max(0.0,uWaterLevel-vTerrainHeight);
        float shore=1.0-smoothstep(0.0,1.8,waterDepth);
        float shallow=smoothstep(0.0,20.0,waterDepth);
        float lowNoise=fbm2(p*.00042+vec2(uTime*.002,.37));
        vec3 deep=vec3(.006,.095,.24);
        vec3 mid=vec3(.008,.34,.56);
        vec3 shallowColor=vec3(.055,.70,.72);
        vec3 color=mix(shallowColor,mid,smoothstep(2.0,20.0,waterDepth));
        color=mix(color,deep,smoothstep(20.0,42.0,waterDepth));
        color=mix(color,vec3(.57,.66,.57),(1.0-smoothstep(0.0,2.0,waterDepth))*.68*(.9+lowNoise*.1));
        vec3 skyReflection=mix(vec3(.018,.12,.25),vec3(.48,.76,.88),.5+.5*normal.y);
        color=mix(color,skyReflection,fresnel*.72);
        float sun=pow(max(dot(reflect(-normalize(uSunDirection),normal),normalize(vViewDirection)),0.0),72.0);
        float glitter=pow(max(dot(normal,uSunDirection),0.0),24.0)*pow(noise2(p*.018+t*.012),9.0);
        color+=vec3(1.0,.88,.72)*(sun*.52+glitter*.025);
        float waveCycle=sin(waterDepth*2.4-t*1.8+lowNoise*5.0);
        float foam=shore*smoothstep(.18,.72,noise2(p*.018+t*.018))*(.42+.58*smoothstep(-.25,.85,waveCycle));
        color=mix(color,vec3(.86,.97,.98),foam*.68);
        float waveLines=pow(max(0.0,sin(waterDepth*1.35-t*1.15+lowNoise*3.0)),18.0);
        color=mix(color,vec3(.65,.85,.83),waveLines*shore*.24);
        float distanceFade=smoothstep(650.0,2200.0,length(vWorldPosition.xz));
        color=mix(color,vec3(.20,.39,.48),distanceFade*.22);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });
}

function createFarRanges(scene, noise, environment = null) {
  const alpine = environment?.water?.type === "lake";
  const himalayan = environment?.id === "himalayan-range";
  const greenHills = environment?.id === "green-hills";
  const layers = [];
  const colors = (alpine || himalayan) ? [0x66869a, 0x87a7bd, 0xb4cbd8] : [0x718b91, 0x91a9ad, 0xb4c7c9];
  const distances = [10500, 14500, 18500];
  for (let layer = 0; layer < 3; layer++) {
    const positions = [], indices = [];
    const nx = (alpine || himalayan || greenHills) ? 360 : 280, nz = (alpine || himalayan || greenHills) ? 30 : 24, width = 76000, depth = 7200;
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const x = -width * .5 + width * ix / nx;
        const z = depth * iz / nz;
        const depthT = iz / nz;
        // Himalayan ranges have an irregular front and back edge. This breaks
        // the single, continuous wall into overlapping mountain groups.
        const edgeNoise = himalayan
          ? noise(x * 0.000105 + layer * 17.3, x * 0.000061 - layer * 8.7)
          : 0;
        const frontEdge = himalayan ? 0.055 + (edgeNoise + 1) * 0.055 : 0;
        const backEdge = himalayan ? 0.78 + edgeNoise * 0.12 : 1.0;
        const frontFade = himalayan
          ? THREE.MathUtils.smoothstep(depthT, frontEdge, frontEdge + 0.16)
          : Math.pow(Math.max(0, Math.sin(Math.PI * depthT)), 0.72);
        const backFade = himalayan
          ? Math.pow(1 - THREE.MathUtils.smoothstep(depthT, backEdge, Math.min(1.0, backEdge + 0.2)), 0.7)
          : 1.0;
        const envelope = himalayan ? frontFade * backFade : frontFade;
        const layerScale = himalayan ? [0.88, 0.68, 0.48][layer] : [1.0, 0.78, 0.58][layer];
        const sampleX = x + (himalayan ? noise(x * 0.00012 + layer * 13, z * 0.00013 - layer * 9) * 1500 : 0);
        const sampleZ = z + (himalayan ? noise(x * 0.00011 - layer * 7, z * 0.00012 + layer * 17) * 1180 : 0);
        const r1 = 1.0 - Math.abs(noise(sampleX * (.00023 + layer * .000025), sampleZ * .00022 + layer * 2.1));
        const r2 = 1.0 - Math.abs(noise(sampleX * (.00058 + layer * .00003) + 17.0, sampleZ * .00051 - layer * 4.7));
        const r3 = 1.0 - Math.abs(noise(sampleX * (.0012 + layer * .00004) - 9.0, sampleZ * .00095 + layer));
        const chainField = noise(sampleX * 0.000082 + layer * 11.7, sampleZ * 0.000095 - layer * 6.3);
        const chainStrength = himalayan ? 0.38 + THREE.MathUtils.smoothstep(chainField, -0.22, 0.58) * 0.62 : 1.0;
        const ridge = himalayan
          ? (Math.pow(r1, 1.34) * 790 + Math.pow(r2, 2.0) * 245 + Math.pow(r3, 2.6) * 58) * 1.12 * layerScale * chainStrength
          : alpine
            ? Math.pow(r1, 1.55) * 920 + Math.pow(r2, 2.15) * 310 + Math.pow(r3, 2.7) * 90
            : greenHills ? Math.pow(r1, 2.8) * 105 + Math.pow(r2, 2.8) * 34 + Math.pow(r3, 3.2) * 9 : Math.pow(r1, 2.0) * 410 + Math.pow(r2, 2.15) * 165 + Math.pow(r3, 2.7) * 52;
        const base = (alpine ? 78 : himalayan ? 210 : greenHills ? 25 : 72) +
          Math.sin(x * .00014 + layer * 1.7) * (alpine || himalayan ? 19 : greenHills ? 11 : 26) +
          Math.sin(z * .00045 + layer) * 7 +
          (himalayan ? chainField * 24 : 0);
        const foothill = himalayan
          ? noise(sampleX * 0.00013 + layer * 8.1, sampleZ * 0.00015 - layer * 5.7) * 24
          : 0;
        const y = Math.max(0.5, himalayan ? base + (ridge + foothill) * envelope : (base + ridge + foothill) * envelope);
        positions.push(x, y, z);
      }
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const colorValues = [];
    for (let i = 0; i < positions.length; i += 3) {
      const height = positions[i + 1];
      const slopeHint = Math.abs(Math.sin(positions[i] * .0013 + layer) * Math.cos(positions[i + 2] * .0008));
      const rock = THREE.MathUtils.smoothstep(slopeHint, .42, .88);
      const high = THREE.MathUtils.smoothstep(height, alpine || himalayan ? 390 : 420, alpine || himalayan ? 760 : 820);
      const tint = new THREE.Color(
        himalayan
          ? [0xa8bfd1, 0xc0d2e0, 0xd5e2ec][layer]
          : greenHills ? [0x5e8051, 0x829c70, 0xa8bb91][layer] : [0x849889, 0x91a5a8, 0xa9b9bd][layer]
      );
      tint.lerp(new THREE.Color(himalayan ? 0x8fa5b6 : greenHills ? 0x527047 : 0x65756f), rock * (himalayan ? 0.22 : 1));
      tint.lerp(new THREE.Color(alpine || himalayan ? 0xf2f7fb : greenHills ? 0xb8c9a8 : 0xc5d0d0), high);
      tint.lerp(new THREE.Color(himalayan ? [0xc9d9e6, 0xd9e5ee, 0xe7eff5][layer] : greenHills ? [0x8ba187, 0xa4b59a, 0xb9c8ad][layer] : 0xd0dadd), [0.34, 0.56, 0.76][layer]);
      colorValues.push(tint.r, tint.g, tint.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorValues, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0,
      side: THREE.DoubleSide, fog: true,
      ...(himalayan ? { transparent: true, opacity: [0.94, 0.82, 0.68][layer], depthWrite: false } : {})
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -distances[layer];
    mesh.userData.distance = -distances[layer];
    mesh.frustumCulled = false;
    scene.add(mesh);
    layers.push(mesh);
  }
  return {
    layers,
    setVisible(visible) {
      for (const mesh of layers) mesh.visible = visible;
    },
    update(camera) {
      for (const mesh of layers) {
        mesh.position.x = camera.position.x;
        mesh.position.z = camera.position.z + mesh.userData.distance;
      }
    },
    dispose() {
      for (const mesh of layers) {
        scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
      }
    }
  };
}

export class Terrain {
  constructor(scene, seed, biome, routeTheme = "") {
    this.scene = scene;
    this.seed = seed;
    this.environment = routeTheme && typeof routeTheme === "object" ? routeTheme : null;
    this.biome = this.environment?.biome || biome;
    this.seaLevel = this.environment?.water?.level ?? WATER_LEVEL;
    this.noise = createNoise2D(makeRandom(seed));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = [];
    this.chunkSize = CHUNK_SIZE;
    this.gridCenterX = Number.NaN;
    this.gridCenterZ = Number.NaN;
    this.ringCounts = { near: 0, mid: 0, far: 0, horizon: 0 };
    this.ensureGrid(0, 0);
    this.farRanges = createFarRanges(scene, this.noise, this.environment);
    this.farBaseWorker = new Worker(new URL("./terrain-far.worker.js", import.meta.url), { type: "module" });
    this.farBase = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0x71866d, roughness: 1, side: THREE.DoubleSide, fog: true }));
    this.farBase.frustumCulled = false;
    this.farBase.renderOrder = -2;
    this.scene.add(this.farBase);
    this.farBaseCenterX = Number.NaN; this.farBaseCenterZ = Number.NaN; this.farBaseRequest = 0;
    this.farBaseWorker.onmessage = ({ data }) => {
      if (data.request !== this.farBaseRequest) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.computeBoundingSphere();
      this.farBase.geometry.dispose(); this.farBase.geometry = geometry;
      this.farBase.position.set(data.centerX, 0, data.centerZ);
      this.farBaseCenterX = data.centerX; this.farBaseCenterZ = data.centerZ;
      this.farBase.visible = this.visible !== false;
    };
    this.requestFarBase(0, 0);
    this.farRanges.layers?.forEach(mesh => { mesh.userData.farRangeOwner = this; });

    this.water = null;
    if (biome === "islands" || ["sea", "lake", "river"].includes(this.environment?.water?.type)) {
      const isRiver = this.environment?.water?.type === "river";
      const waterWidth = isRiver
        ? Math.max(24, (this.environment?.water?.width || 120) * 3.15)
        : (this.environment?.water?.width || WATER_SIZE);
      const waterDepth = isRiver ? 22000 : waterWidth;
      // Rivers are narrow strips; keep their long axis detailed without
      // allocating a huge square water grid.
      const isLake = this.environment?.water?.type === "lake";
      const segmentsX = isRiver ? 32 : (isLake ? 224 : 192);
      const segmentsZ = isRiver ? 1024 : (isLake ? 224 : 192);
      const geometry = new THREE.PlaneGeometry(waterWidth, waterDepth, segmentsX, segmentsZ);
      const heights = new Float32Array(geometry.attributes.position.count);
      geometry.setAttribute("terrainHeight", new THREE.BufferAttribute(heights, 1));
      this.waterHeights = heights;
      this.waterSegments = { x: segmentsX, z: segmentsZ };
      this.waterCenterX = Number.NaN;
      this.waterCenterZ = Number.NaN;
      this.waterBaseX = isRiver ? Float32Array.from(geometry.attributes.position.array.filter((_, i) => i % 3 === 0)) : null;
      this.waterMaterial = createWaterMaterial(seed);
      this.waterMaterial.uniforms.uWaterLevel.value = this.seaLevel;
      this.waterMaterial.uniforms.uSunDirection.value
        .set(...(this.environment?.sun?.position || [-0.45, 0.78, -0.42])).normalize();
      this.water = new THREE.Mesh(geometry, this.waterMaterial);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = this.seaLevel;
      this.water.renderOrder = 1;
      this.scene.add(this.water);
      this.updateWaterClip(0, 0);
    }
  }

  requestFarBase(centerX, centerZ) {
    const cx = Math.round(centerX / 4000) * 4000, cz = Math.round(centerZ / 4000) * 4000;
    if (cx === this.farBaseCenterX && cz === this.farBaseCenterZ) return;
    const request = ++this.farBaseRequest;
    this.farBaseWorker.postMessage({ request, seed: this.seed, centerX: cx, centerZ: cz, size: 40000, segments: 128, biome: this.biome, baseHeight: this.environment?.terrain?.baseHeight ?? BIOME_HEIGHT[this.biome] ?? 145, ridgeWeight: this.environment?.terrain?.ridgeWeight ?? 1, octaves: this.environment?.terrain?.noiseOctaves ?? 6 });
  }

  lodForDistance(distance) {
    const river = this.environment?.water?.type === "river";
    const himalayan = this.environment?.id === "himalayan-range";
    if (distance < 400) return { segments: himalayan ? 192 : 128, ring: "near" };
    if (distance < 1500) return { segments: himalayan ? 96 : 64, ring: "mid" };
    if (distance < 5000) return { segments: himalayan ? 64 : river ? 64 : 48, ring: "far" };
    return { segments: 32, ring: "horizon" };
  }

  ensureGrid(cameraX, cameraZ) {
    const cx = Math.round(cameraX / this.chunkSize) * this.chunkSize;
    const cz = Math.round(cameraZ / this.chunkSize) * this.chunkSize;
    if (cx === this.gridCenterX && cz === this.gridCenterZ && this.chunks.length) return;
    this.gridCenterX = cx;
    this.gridCenterZ = cz;
    const next = [];
    const counts = { near: 0, mid: 0, far: 0, horizon: 0 };
    const keep = new Map(this.chunks.map(c => [c.userData.worldX + ':' + c.userData.baseZ, c]));
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
        const x = cx + gx * this.chunkSize;
        const z = cz + gz * this.chunkSize;
        const distance = Math.hypot(x - cameraX, z - cameraZ);
        const lod = this.lodForDistance(distance);
        counts[lod.ring]++;
        const key = x + ":" + z;
        let chunk = keep.get(key);
        if (chunk && chunk.userData.lodSegments === lod.segments &&
            chunk.userData.worldX === x && chunk.userData.baseZ === z) {
          keep.delete(key);
        } else {
          if (chunk) {
            chunk.geometry.dispose(); chunk.material.dispose();
            this.group.remove(chunk); keep.delete(key);
          }
          chunk = makeChunk(this.noise, this.seed, z, this.biome, x, this.chunkSize, lod.segments, this.environment);
          chunk.userData.worldX = x;
          chunk.userData.gridKey = key;
        }
        chunk.position.set(x - cx, 0, z - cz);
        this.group.add(chunk);
        next.push(chunk);
      }
    }
    for (const old of keep.values()) {
      old.geometry.dispose(); old.material.dispose(); this.group.remove(old);
    }
    this.group.position.set(cx, 0, cz);
    this.chunks = next;
    this.ringCounts = counts;
  }

  heightAtWorld(x, z) {
    const warpX = x + this.noise(x * 0.0007, z * 0.0007) * 115;
    const warpZ = z + this.noise((x + 900) * 0.0007, (z - 400) * 0.0007) * 115;
    let h = fbm(this.noise, warpX, warpZ, this.environment?.terrain?.noiseOctaves ?? 6) * (this.environment?.terrain?.baseHeight ?? BIOME_HEIGHT[this.biome] ?? 145);
    if (this.environment?.terrain?.valleyCarving) h -= Math.abs(this.noise(warpX * 0.00048, warpZ * 0.00048)) * this.environment.terrain.valleyCarving * (this.environment.terrain.baseHeight || 145) * 0.34;
    h = applyRiverChannel(h, x, z, this.noise, this.environment);
    if (this.biome === "islands") {
      const ridgeA = 1.0 - Math.abs(this.noise(warpX * 0.00145, warpZ * 0.00145));
      const ridgeB = 1.0 - Math.abs(this.noise(warpX * 0.0031 + 17.0, warpZ * 0.0031 - 9.0));
      h += (Math.pow(Math.max(0.0, ridgeA), 2.0) * 34 + Math.pow(Math.max(0.0, ridgeB), 2.4) * 13) * (this.environment?.terrain?.ridgeWeight ?? 1);
      const shoreZ = Math.sin(x * 0.00022) * 1150 + Math.sin(x * 0.00061 + 1.7) * 360 +
        this.noise(x * 0.00048, z * 0.00031) * 260;
      const coast = THREE.MathUtils.smoothstep(shoreZ + z + 900, -720, 260);
      const headland = Math.pow(Math.max(0, Math.sin(x * 0.00016 + 0.8)), 5) * 95;
      const dune = Math.max(0, this.noise(x * 0.0013, z * 0.0011)) * 18;
      h = THREE.MathUtils.lerp(-100 + h * 0.12, 80 + h * 0.48 + headland + dune, coast);
    }
    if (this.biome === "forest") {
      const rolling = this.noise(warpX * 0.00034 + 31.0, warpZ * 0.00034 - 17.0);
      const shoulder = this.noise(warpX * 0.00082 - 9.0, warpZ * 0.00082 + 23.0);
      if (this.environment?.id === "green-hills") {
        const broadMeadow = this.noise(warpX * 0.00019 + 47.0, warpZ * 0.00022 - 63.0);
        const hillShoulder = this.noise(warpX * 0.00053 - 29.0, warpZ * 0.00061 + 11.0);
        const softRidge = 1.0 - Math.abs(this.noise(warpX * 0.00072 + 83.0, warpZ * 0.00064 - 37.0));
        h += broadMeadow * 43 + rolling * 12 + hillShoulder * 4.5 + Math.pow(Math.max(0, softRidge), 2.8) * 4 + shoulder * 2.0;
      } else if (this.environment?.id === "river-valley") {
        const broadValley = this.noise(warpX * 0.00017 + 19.0, warpZ * 0.00016 - 37.0);
        const valleyShoulder = this.noise(warpX * 0.00031 - 51.0, warpZ * 0.00034 + 13.0);
        const lowRelief = 1.0 - Math.abs(this.noise(warpX * 0.00046 + 73.0, warpZ * 0.00042 - 29.0));
        h += broadValley * 11 + rolling * 2.8 + valleyShoulder * 2.2 + Math.pow(Math.max(0, lowRelief), 2.2) * 1.8 + shoulder * 0.8;
      } else { h += rolling * 24 + shoulder * 7; }
    }
    if (this.biome === "desert") {
      // Wind-built dune systems: broad crescent-like ridges carry smaller,
      // independently warped dunelets rather than repeating parallel waves.
      const windWarp = this.noise(warpX * 0.00024 + 19.0, warpZ * 0.00018 - 7.0);
      const duneField = warpZ * 0.00034 +
        this.noise(warpX * 0.00028, warpZ * 0.00016) * 1.25 +
        Math.sin(warpX * 0.00022 + windWarp * 1.4) * 0.38;
      const broadDune = Math.sin(duneField) * 58 +
        Math.sin(duneField * 0.52 + 1.3 + windWarp * 0.3) * 30;

      // Medium and small dune trains break up the broad slopes at several
      // scales. Noise modulation varies their height and prevents banding.
      const duneletsField = duneField * 2.65 +
        this.noise(warpX * 0.00072 + 41.0, warpZ * 0.00058) * 0.9;
      const dunelets = Math.sin(duneletsField) *
        (10 + this.noise(warpX * 0.0009, warpZ * 0.00075) * 4.5);
      const smallDunesField = duneField * 6.2 +
        this.noise(warpX * 0.00145 - 13.0, warpZ * 0.0012 + 29.0) * 0.65;
      const smallDunes = Math.sin(smallDunesField) * 4.2;
      const windRipples = Math.sin(duneField * 11.5 + warpX * 0.0011) * 1.35;

      h = h * 0.32 + broadDune + dunelets + smallDunes + windRipples;
    }
    if (this.biome === "mountains" || this.biome === "snow") {
      const ridgeWeight = this.environment?.terrain?.ridgeWeight ?? 1;
      h += this.environment?.terrain?.mountainProfile === "himalayan"
        ? mountainRelief(this.noise, warpX, warpZ, ridgeWeight, true)
        : (Math.pow(Math.max(0, 1 - Math.abs(this.noise(warpX * 0.00105, warpZ * 0.00105))), 2.65) * (this.biome === "snow" ? 112 : 76) +
           Math.pow(Math.max(0, 1 - Math.abs(this.noise(warpX * 0.00215 + 13, warpZ * 0.00215 - 7))), 3.1) * (this.biome === "snow" ? 24 : 18)) * ridgeWeight;
    }
    // Keep water clipping in sync with chunk geometry: cut the basin only
    // after all mountain relief has been added.
    if (this.environment?.water?.type === "lake") {
      h = applyAlpineLakeTerrain(h, x, z, this.noise, warpX, warpZ);
    }
    return h;
  }

  updateWaterClip(centerX, centerZ) {
    centerX = Math.round(centerX / 64) * 64;
    centerZ = Math.round(centerZ / 64) * 64;
    if (!this.water || (centerX === this.waterCenterX && centerZ === this.waterCenterZ)) return;
    this.waterCenterX = centerX;
    this.waterCenterZ = centerZ;
    const pos = this.water.geometry.attributes.position;
    const out = this.waterHeights;
    const isRiver = this.environment?.water?.type === "river";
    const riverCenter = isRiver ? riverCenterX(this.noise, centerZ) : centerX;
    for (let i = 0; i < pos.count; i++) {
      const wz = centerZ - pos.getY(i);
      const baseX = isRiver ? this.waterBaseX[i] : pos.getX(i);
      const localCurveOffset = isRiver
        ? riverCenterX(this.noise, wz) - riverCenter
        : 0;
      const widthScale = isRiver
        ? riverWidthAt(this.noise, wz, this.environment?.water?.width || 120) /
          Math.max(24, this.environment?.water?.width || 120)
        : 1;
      if (isRiver) pos.setX(i, baseX * widthScale + localCurveOffset);
      const wx = isRiver ? riverCenterX(this.noise, wz) + baseX * widthScale : centerX + baseX;
      const terrainHeight = HEIGHT_BASE + this.heightAtWorld(wx, wz);
      if (this.environment?.water?.type === "lake") {
        // A lake is one bounded basin, not every low spot in the terrain.
        // Suppress water outside the basin so distant depressions cannot turn
        // into disconnected pools or floating-looking water patches.
        const lakeNx = wx / 4300;
        const lakeNz = (wz + 2500) / 5350;
        const shoreWarp = this.noise(wx * 0.00052 + 31, wz * 0.00052 - 17) * 0.055 +
          this.noise(wx * 0.00115 - 9, wz * 0.00115 + 23) * 0.022;
        const basinRadius = Math.sqrt(lakeNx * lakeNx + lakeNz * lakeNz) + shoreWarp;
        const lakeMask = 1.0 - THREE.MathUtils.smoothstep(basinRadius, 0.82, 1.025);
        out[i] = THREE.MathUtils.lerp(this.seaLevel + 1.0, terrainHeight, lakeMask);
      } else {
        out[i] = terrainHeight;
      }
    }
    if (isRiver) pos.needsUpdate = true;
    this.water.geometry.attributes.terrainHeight.needsUpdate = true;
  }

  update(dt, speed, altitude, camera) {
    if (camera) {
      this.ensureGrid(camera.position.x, camera.position.z);
      this.farRanges?.update(camera);
      this.requestFarBase(camera.position.x, camera.position.z);
    }
    if (this.water) {
      const wx = camera?.position.x || 0, wz = camera?.position.z || 0;
      this.updateWaterClip(wx, wz);
      this.water.position.x = this.environment?.water?.type === "river"
        ? riverCenterX(this.noise, this.waterCenterZ)
        : this.waterCenterX;
      this.water.position.z = this.waterCenterZ;
      this.waterMaterial.uniforms.uTime.value += dt;
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
    this.farRanges?.setVisible(visible);
    if (this.farBase) this.farBase.visible = visible && this.farBase.geometry.attributes.position?.count > 0;
    this.visible = visible;
    if (this.water) this.water.visible = visible;
  }

  isReady() {
    return this.chunks.length === GRID_DIAMETER * GRID_DIAMETER &&
      this.chunks.every(c => c.geometry?.attributes?.position?.count > 0 &&
        c.geometry.boundingBox && c.geometry.boundingSphere);
  }

  hasChunkNear(x, z, radius = 500) {
    return this.chunks.some(chunk => {
      const box = chunk.geometry.boundingBox;
      if (!box) return false;
      const minX = box.min.x + chunk.position.x + this.group.position.x;
      const maxX = box.max.x + chunk.position.x + this.group.position.x;
      const minZ = box.min.z + chunk.position.z + this.group.position.z;
      const maxZ = box.max.z + chunk.position.z + this.group.position.z;
      const dx = Math.max(minX - x, 0, x - maxX);
      const dz = Math.max(minZ - z, 0, z - maxZ);
      return Math.hypot(dx, dz) <= radius;
    });
  }

  hasChunkGaps() {
    const keys = new Set(this.chunks.map(chunk => chunk.userData.gridKey));
    for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
      for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
        const x = this.gridCenterX + gx * this.chunkSize;
        const z = this.gridCenterZ + gz * this.chunkSize;
        if (!keys.has(x + ":" + z)) return true;
      }
    }
    return this.chunks.length !== GRID_DIAMETER * GRID_DIAMETER;
  }

  hasCoverage(radius = 14000) {
    const step = 1500;
    for (let a = 0; a < 360; a += 15) {
      const r = a * Math.PI / 180;
      const x = Math.sin(r) * radius, z = Math.cos(r) * radius;
      if (!this.hasChunkNear(this.gridCenterX + x, this.gridCenterZ + z, step * 1.5)) return false;
    }
    return true;
  }

  sampleHeight(x, worldZ) {
    for (const chunk of this.chunks) {
      const box = chunk.geometry.boundingBox;
      if (!box) continue;
      const localX = x - this.group.position.x - chunk.position.x;
      const localZ = worldZ - this.group.position.z - chunk.position.z;
      if (localX < box.min.x || localX > box.max.x || localZ < box.min.z || localZ > box.max.z) continue;
      const heightAt = chunk.userData.heightAt;
      if (typeof heightAt !== "function") continue;
      return HEIGHT_BASE + heightAt(chunk.userData.worldX + localX, chunk.userData.baseZ + localZ);
    }
    return null;
  }

  getDebugInfo(camera) {
    const chunksUnderCamera = camera ? this.chunks.filter(c => this.hasChunkNear(camera.position.x, camera.position.z, 1) &&
      camera.position.x >= this.group.position.x + c.position.x - this.chunkSize * .5 &&
      camera.position.x <= this.group.position.x + c.position.x + this.chunkSize * .5 &&
      camera.position.z >= this.group.position.z + c.position.z - this.chunkSize * .5 &&
      camera.position.z <= this.group.position.z + c.position.z + this.chunkSize * .5).length : 0;
    return {
      chunkCount: this.chunks.length, chunksUnderCamera, farBaseVisible: Boolean(this.farBase?.visible), workerQueue: 0,
      ringCounts: { ...this.ringCounts }, coverage14km: this.hasCoverage(14000),
      chunkGapWarning: this.hasChunkGaps(),
      seaLevel: this.seaLevel, waterEnabled: Boolean(this.water), waterTerrainClipping: Boolean(this.water?.geometry?.attributes?.terrainHeight),
      minHeight: Math.min(...this.chunks.map(c => c.userData.minHeight ?? Infinity)),
      maxHeight: Math.max(...this.chunks.map(c => c.userData.maxHeight ?? -Infinity))
    };
  }

  dispose() {
    for (const chunk of this.chunks) {
      chunk.geometry.dispose(); chunk.material.dispose();
    }
    this.group.parent?.remove(this.group);
    this.farRanges?.dispose();
    this.farBaseRequest++;
    this.farBaseWorker?.terminate();
    if (this.farBase) { this.scene.remove(this.farBase); this.farBase.geometry.dispose(); this.farBase.material.dispose(); }
    if (this.water) {
      this.scene.remove(this.water); this.water.geometry.dispose(); this.water.material.dispose();
    }
  }
}
