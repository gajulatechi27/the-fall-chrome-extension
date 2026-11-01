import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

const CHUNK_SIZE = 2500;
const GRID_RADIUS = 2; // 5 x 5 chunks: keep terrain generation and draw calls bounded
const WATER_LEVEL = -12;
const WATER_SIZE = 52000;
const HIGH_SEGMENTS = 32;
const MID_SEGMENTS = 16;
const LOW_SEGMENTS = 8;
const SKIRT_DEPTH = 55;
const NORMAL_SAMPLE = 8;

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fbm(noise, x, z) {
  // Stable world-space base spectrum: no octave shorter than the coarsest
  // terrain LOD can represent. Fine detail belongs in vertex color, not height.
  let sum = 0, amp = 0.62, freq = 0.00048, norm = 0;
  for (let octave = 0; octave < 2; octave++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.42;
    freq *= 1.85;
  }
  return sum / norm;
}
function smoothRidge(n, power = 1.7) {
  const r = Math.max(0, 1 - Math.sqrt(n * n + 0.0009));
  return r * r * Math.pow(r, Math.max(0, power - 2));
}
function smoothLimit(value, limit) {
  return limit * Math.tanh(value / limit);
}

function terrainHeight(noise, x, z, biome) {
  const warp1X = x + noise(x * 0.00017, z * 0.00017) * 360;
  const warp1Z = z + noise((x + 900) * 0.00017, (z - 400) * 0.00017) * 360;
  const warpX = warp1X + noise((warp1X - 1700) * 0.00031, (warp1Z + 2300) * 0.00031) * 115;
  const warpZ = warp1Z + noise((warp1X + 3100) * 0.00031, (warp1Z - 700) * 0.00031) * 115;
  let h = fbm(noise, warpX, warpZ) * 115;
  if (["himalayas", "mountains", "snow", "lake", "forest", "rainforest"].includes(biome)) {
    const ridgeNoise = noise(warpX * (biome === "himalayas" ? 0.00036 : 0.00048), warpZ * (biome === "himalayas" ? 0.00036 : 0.00048));
    const ridgeBase = smoothRidge(ridgeNoise, biome === "himalayas" ? 1.35 : 1.8);
    const ridgeDetail = smoothRidge(noise((warpX + 680) * 0.00021, (warpZ - 940) * 0.00021), 2.2);
    const ridgeSlopeWeight = THREE.MathUtils.smoothstep(ridgeBase, 0.08, 0.72);
    const ridges = smoothLimit(ridgeBase * 0.82 + ridgeDetail * ridgeSlopeWeight * 0.18, 0.92);
    const rangeMask = biome === "lake"
      ? THREE.MathUtils.smoothstep(Math.hypot(x, z), 900, 3200)
      : 1;
    const mountainHeight = biome === "lake" ? 320 : biome === "himalayas" ? 455 : biome === "snow" ? 365 : biome === "rainforest" ? 205 : biome === "forest" ? 235 : 245;
    h += ridges * mountainHeight * rangeMask;
    if (biome === "himalayas") {
      const secondary =  smoothRidge(noise((warpX + 1250) * 0.00029, (warpZ - 760) * 0.00029), 1.65);
      const spine =  smoothRidge(noise(warpX * 0.00017 + 13, warpZ * 0.00017 - 6), 3.2);
      h += secondary * 185 + spine * 115;
      const glacier =  smoothRidge(noise(warpX * 0.00019 + 8, warpZ * 0.00019 - 3), 5.5);
      h -= glacier * 105;
      h += smoothRidge(noise(warpX * 0.00038, warpZ * 0.00038), 2.5) * ridges * 9;
    } else {
      h -=  smoothRidge(noise(warpX * 0.00023 + 8, warpZ * 0.00023 - 3), 4.2) * 72;
    }
  }
  if (biome === "lake") {
    const lakeRadius = 850 + noise(1200, 300) * 90;
    const d = Math.hypot(x, z);
    h = THREE.MathUtils.lerp(h, -62, 1 - THREE.MathUtils.smoothstep(d, lakeRadius - 90, lakeRadius + 90));
  }
  if (biome === "green" || biome === "forest" || biome === "delta" || biome === "rainforest") {
    const center = Math.sin(warpZ * 0.00032 + noise(80, warpZ * 0.00018) * 1.6) * 1100;
    const distance = Math.abs(warpX - center);
    const width = biome === "delta" ? 390 : biome === "rainforest" ? 230 : 170;
    h -= Math.exp(-Math.pow(distance / width, 2)) * (biome === "delta" ? 135 : biome === "rainforest" ? 105 : 78);
    h += Math.exp(-Math.pow((distance - width * 1.45) / 110, 2)) * 15;
  }
  if (biome === "desert") {
    const dune = Math.sin(warpX * 0.00042 + noise(0, warpZ * 0.0002) * 2.8) * 58;
    const crossDune = Math.sin(warpZ * 0.00028 + noise(warpX * 0.00012, 12) * 1.8) * 26;
    const canyon =  smoothRidge(noise(warpX * 0.00017, warpZ * 0.00017), 2.8) * 145;
    h = h * 0.72 + dune + crossDune + canyon;
    h +=  smoothRidge(noise(warpX * 0.00011 + 7, warpZ * 0.00011 - 4), 4.5) * 105;
  }
  if (biome === "islands" || biome === "coast") {
    const coastNoise = fbm(noise, warpX + 17000, warpZ - 8000);
    h = h * 0.65 - 65 + Math.max(0, coastNoise + 0.15) * 290;
    h +=  smoothRidge(noise(warpX * 0.00038, warpZ * 0.00038), 3.5) * 55;
  }
  if (biome === "green") {
    // Broad, overlapping hill systems give the scene a rolling pastoral silhouette.
    const broadHills = Math.sin(warpX * 0.00034 + noise(warpX * 0.00016, warpZ * 0.00016) * 1.8)
      * Math.cos(warpZ * 0.00029 + noise(warpX * 0.00013 + 9, warpZ * 0.00013) * 1.5);
    const secondaryHills = noise(warpX * 0.00038 + 4, warpZ * 0.00038 - 7);
    h += broadHills * 72 + secondaryHills * 24;

    // Contour-following terrace steps: softened edges avoid harsh quantized plateaus.
    const terraceSignal = Math.sin(warpX * 0.00052 + noise(warpX * 0.00024, warpZ * 0.00024) * 2.1);
    const terraceBands = Math.pow(Math.max(0, terraceSignal * 0.5 + 0.5), 7);
    h += terraceBands * 4.2 - 1.1;
  }
  if (biome === "forest" || biome === "rainforest") {
    h += Math.sin(warpX * 0.00042 + warpZ * 0.00031) * 5;
  }
  // A restrained flow-aligned valley incision breaks up stacked ridge profiles.
  const flow = Math.sin(warpZ * 0.00021 + noise(warpZ * 0.00013, 19) * 1.7) * 0.00018;
  const flowDistance = Math.abs(warpX - flow * 100000);
  const flowCut = Math.exp(-Math.pow(flowDistance / (biome === "delta" ? 270 : 115), 2));
  if (["green", "delta", "forest", "rainforest"].includes(biome)) h -= flowCut * (biome === "delta" ? 18 : 9);
  return smoothLimit(h, biome === "himalayas" ? 780 : 520);
}

function makeTerrainMaterial(biome) {
  const material = new THREE.MeshStandardMaterial({
    color: biome === "desert" ? 0xb88760 : biome === "himalayas" || biome === "snow" || biome === "lake" ? 0xd5e0e5 : biome === "delta" ? 0xb2a36e : biome === "rainforest" ? 0x4f8660 : 0x91b56d,
    roughness: biome === "coast" || biome === "lake" ? 0.82 : 0.94,
    metalness: 0,
    vertexColors: true
  });

  // C4: world-space procedural material detail. This runs in the fragment
  // shader, so texture scale stays stable across terrain LOD levels.
  const biomeCode = biome === "desert" ? 1 : biome === "coast" || biome === "islands" ? 2 :
    biome === "himalayas" || biome === "snow" || biome === "mountains" ? 3 :
    biome === "green" ? 4 : biome === "rainforest" ? 5 : biome === "forest" ? 6 : 0;
  material.onBeforeCompile = shader => {
    shader.uniforms.uTerrainBiome = { value: biomeCode };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainWorld;\nvarying float vTerrainSlope;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvec4 terrainWorldPosition = modelMatrix * vec4(transformed, 1.0);\nvTerrainWorld = terrainWorldPosition.xyz;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvTerrainSlope = 1.0 - abs(normalize(mat3(modelMatrix) * objectNormal).y);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vTerrainWorld;
varying float vTerrainSlope;
uniform float uTerrainBiome;
float terrainHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float terrainNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(terrainHash(i), terrainHash(i + vec2(1.0,0.0)), f.x),
             mix(terrainHash(i + vec2(0.0,1.0)), terrainHash(i + vec2(1.0,1.0)), f.x), f.y);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
  vec2 terrainXZ = vTerrainWorld.xz;
  float broadDetail = terrainNoise(terrainXZ * 0.0022);
  float mediumDetail = terrainNoise(terrainXZ * 0.009);
  float fineDetail = terrainNoise(terrainXZ * 0.027);
  float materialGrain = (broadDetail - 0.5) * 0.12 + (mediumDetail - 0.5) * 0.10 + (fineDetail - 0.5) * 0.045;
  float dryPatch = smoothstep(0.56, 0.78, terrainNoise(terrainXZ * 0.0017 + 31.7));
  float rockMask = smoothstep(0.24, 0.62, vTerrainSlope);
  if (uTerrainBiome < 0.5) {
    diffuseColor.rgb *= 0.94 + materialGrain;
  } else if (uTerrainBiome < 1.5) {
    diffuseColor.rgb *= 0.91 + materialGrain * 0.8;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48,0.27,0.17), dryPatch * 0.13);
  } else if (uTerrainBiome < 2.5) {
    diffuseColor.rgb *= 0.93 + materialGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64,0.53,0.37), dryPatch * 0.10);
  } else if (uTerrainBiome < 3.5) {
    diffuseColor.rgb *= 0.96 + materialGrain * 0.7;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38,0.40,0.39), rockMask * 0.10);
  } else if (uTerrainBiome < 4.5) {
    diffuseColor.rgb *= 0.91 + materialGrain * 1.2;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64,0.54,0.31), dryPatch * 0.20);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25,0.34,0.20), rockMask * 0.16);
  } else if (uTerrainBiome < 5.5) {
    diffuseColor.rgb *= 0.89 + materialGrain * 1.35;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22,0.36,0.25), dryPatch * 0.13);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.31,0.35,0.29), rockMask * 0.12);
  } else {
    diffuseColor.rgb *= 0.90 + materialGrain;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25,0.32,0.23), dryPatch * 0.15);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.39,0.38,0.33), rockMask * 0.12);
  }`);
  };
  material.customProgramCacheKey = () => "terrain-material-c4-" + biome;
  return material;
}


function mergeTreeParts(parts, palette = [0x25442c, 0x477747, 0x83a95a]) {
  // Merge component buffers directly. BufferGeometryUtils is an examples-module
  // helper and is not exported from the core THREE namespace.
  const positions = [], normals = [], indices = [];
  for (const item of parts) {
    const geometry = item.geometry.clone();
    geometry.applyMatrix4(item.matrix);
    const p = geometry.getAttribute("position");
    const n = geometry.getAttribute("normal");
    const offset = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const sourceIndices = geometry.index
      ? geometry.index.array
      : Array.from({ length: p.count }, (_, i) => i);
    for (const index of sourceIndices) indices.push(index + offset);
    geometry.dispose();
    item.geometry.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  const p = geometry.getAttribute("position");
  const colors = [];
  const low = new THREE.Color(palette[0]);
  const mid = new THREE.Color(palette[1]);
  const high = new THREE.Color(palette[2]);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    minY = Math.min(minY, p.getY(i));
    maxY = Math.max(maxY, p.getY(i));
  }
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - minY) / Math.max(0.001, maxY - minY), 0, 1);
    const color = t < 0.55
      ? low.clone().lerp(mid, t / 0.55)
      : mid.clone().lerp(high, (t - 0.55) / 0.45);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
function part(geometry, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  return { geometry, matrix };
}
function makeBlob(radius, seed) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const p = geometry.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.13 + seed) * Math.cos(y * 1.71 - seed * 0.7) * Math.sin(z * 1.93 + seed * 0.3);
    const f = 1 + n * 0.105;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
function makeTreeModels() {
  const pine = [];
  pine.push(part(new THREE.CylinderGeometry(0.22, 0.34, 5.8, 7), 0, 2.9, 0));
  // Rounded, overlapping foliage clusters replace the repeated cone silhouette.
  for (let tier = 0; tier < 7; tier++) {
    const angle = tier * 2.399;
    const radius = tier < 3 ? 1.15 : 1.65;
    const y = 3.0 + (tier % 4) * 1.45;
    const blob = makeBlob(2.0 + (tier % 3) * 0.28, 100 + tier);
    pine.push(part(blob, Math.cos(angle) * radius, y, Math.sin(angle) * radius,
      0.88 + (tier % 2) * 0.16, 0.78 + (tier % 3) * 0.12, 0.88 + (tier % 2) * 0.14));
  }

  const broad = [part(new THREE.CylinderGeometry(0.28, 0.42, 7.5, 8), 0, 3.75, 0)];
  for (let b = 0; b < 3; b++) {
    const a = b * Math.PI * 2 / 3 + 0.4;
    const x = Math.cos(a) * 1.45, z = Math.sin(a) * 1.45;
    const branch = new THREE.CylinderGeometry(0.09, 0.19, 3.5, 6);
    broad.push(part(branch, x * 0.52, 5.2 + (b % 2) * 0.5, z * 0.52, 1, 1, 1, Math.cos(a) * 0.42));
  }
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI * 2 / 6 + 0.2;
    const radius = 3 + (i % 3) * 0.8;
    broad.push(part(makeBlob(3 + (i % 3) * 0.75, i + 1),
      Math.cos(a) * radius * 0.48, 6.1 + (i % 2) * 1.1, Math.sin(a) * radius * 0.48,
      0.9 + (i % 2) * 0.18, 0.85 + (i % 3) * 0.12, 0.92 + (i % 2) * 0.14));
  }

  const bush = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI * 0.5;
    bush.push(part(makeBlob(1.25 + (i % 2) * 0.3, 20 + i),
      Math.cos(a) * 0.85, 0.9 + (i % 2) * 0.25, Math.sin(a) * 0.85,
      1.0, 0.8 + (i % 2) * 0.15, 0.9));
  }
  return [
    mergeTreeParts(pine, [0x203c27, 0x386b39, 0x82a95c]),
    mergeTreeParts(broad, [0x294a2d, 0x4e8245, 0x9ab96a]),
    mergeTreeParts(bush, [0x29462a, 0x4a783b, 0x8eaa55])
  ];
}
function addHillVegetation(mesh, noise, chunkX, chunkZ, biome) {
  // C5 first pass: only the two requested test biomes are enabled.
  if (!["himalayas", "lake"].includes(biome)) return;
  const random = makeRandom((Math.abs(Math.floor(chunkX * 17 + chunkZ * 31)) ^ 0x5f3759df) >>> 0);
  const models = makeTreeModels();
  const palette = [0x315f3b, 0x477a45, 0x6b8b4b];
  const target = 850;
  const mix = biome === "himalayas" ? [0.42, 0.48, 0.10] : [0.28, 0.58, 0.14];
  const counts = mix.map(v => Math.round(target * v));
  const dummy = new THREE.Object3D();
  const stats = { pine: 0, broadleaf: 0, bush: 0 };
  const materials = models.map(() => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, vertexColors: true
  }));
  const meshes = models.map((geometry, i) => {
    const instanced = new THREE.InstancedMesh(geometry, materials[i], counts[i]);
    instanced.castShadow = false;
    instanced.receiveShadow = true;
    instanced.frustumCulled = false;
    mesh.add(instanced);
    return instanced;
  });

  for (let type = 0; type < meshes.length; type++) {
    let placed = 0, attempts = 0;
    const maxAttempts = counts[type] * 35;
    while (placed < counts[type] && attempts++ < maxAttempts) {
      // Noise acceptance creates irregular forest islands rather than rows.
      const x = (random() - 0.5) * CHUNK_SIZE;
      const z = (random() - 0.5) * CHUNK_SIZE;
      const wx = chunkX + x, wz = chunkZ + z;
      const y = terrainHeight(noise, wx, wz, biome);
      const dx = terrainHeight(noise, wx + 12, wz, biome) - terrainHeight(noise, wx - 12, wz, biome);
      const dz = terrainHeight(noise, wx, wz + 12, biome) - terrainHeight(noise, wx, wz - 12, biome);
      const slope = Math.hypot(dx, dz) / 24;
      const moisture = noise(wx * 0.00024 + 27, wz * 0.00024 - 13);
      const clump = noise(wx * 0.00013 + 71, wz * 0.00013 - 39);
      const clumpGate = biome === "himalayas" ? -0.22 : -0.48;
      if (slope > (biome === "himalayas" ? 0.52 : 0.66)) continue;
      if (y < (biome === "lake" ? -8 : -12)) continue;
      if (biome === "himalayas" && y > 175) continue; // tree line below snow and exposed alpine rock
      if (biome === "lake" && y > 205) continue;
      if (clump < clumpGate && moisture < 0.18) continue;
      if (type === 0 && biome === "lake" && y > 155) continue;
      if (type === 1 && biome === "himalayas" && y > 115) continue;
      const scale = (0.72 + random() * 0.7) * (type === 0 && biome === "himalayas" ? 1.08 : 1);
      dummy.position.set(x, y - (type === 2 ? 0.08 : 0.18), z);
      dummy.rotation.set((random() - 0.5) * 0.20, random() * Math.PI * 2, (random() - 0.5) * 0.20);
      dummy.scale.set(scale * (0.82 + random() * 0.28), scale * (0.9 + random() * 0.3), scale * (0.82 + random() * 0.28));
      dummy.updateMatrix();
      meshes[type].setMatrixAt(placed, dummy.matrix);
      meshes[type].setColorAt(placed, new THREE.Color(palette[Math.floor(random() * palette.length)]));
      placed++;
    }
    meshes[type].count = placed;
    meshes[type].instanceMatrix.needsUpdate = true;
    stats[["pine", "broadleaf", "bush"][type]] = placed;
  }
  mesh.userData.vegetationStats = stats;
  mesh.userData.vegetationModels = models;
}

function disposeChunk(chunk) {
  chunk.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material.dispose();
    }
  });
}

function makeChunk(noise, chunkX, chunkZ, biome, segments) {
  const positions = [];
  const colors = [];
  const normals = [];
  const indices = [];
  const step = CHUNK_SIZE / segments;
  const isHimalaya = biome === "himalayas";
  const min = new THREE.Color(isHimalaya ? 0x344b50 : biome === "rainforest" || biome === "forest" ? 0x315b42 : 0x58794a);
  const grass = new THREE.Color(isHimalaya ? 0x647b59 : biome === "delta" ? 0xc2b276 : biome === "rainforest" ? 0x4f9562 : biome === "forest" ? 0x528451 : 0x91b96c);
  const rock = new THREE.Color(isHimalaya ? 0x777b78 : biome === "desert" ? 0x9b5940 : 0x85877e);
  const snow = new THREE.Color(isHimalaya ? 0xeaf3f5 : 0xf0f5f8);
  const sand = new THREE.Color(0xc5a477);
  let minHeight = Infinity, maxHeight = -Infinity;

  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const lx = -CHUNK_SIZE * 0.5 + col * step;
      const lz = -CHUNK_SIZE * 0.5 + row * step;
      const wx = chunkX + lx;
      const wz = chunkZ + lz;
      const h = terrainHeight(noise, wx, wz, biome);
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      positions.push(lx, h, lz);
      const nx = terrainHeight(noise, wx + NORMAL_SAMPLE, wz, biome) - terrainHeight(noise, wx - NORMAL_SAMPLE, wz, biome);
      const nz = terrainHeight(noise, wx, wz + NORMAL_SAMPLE, biome) - terrainHeight(noise, wx, wz - NORMAL_SAMPLE, biome);
      const normal = new THREE.Vector3(-nx / (2 * NORMAL_SAMPLE), 1, -nz / (2 * NORMAL_SAMPLE)).normalize();
      normals.push(normal.x, normal.y, normal.z);

      const slopeX = terrainHeight(noise, wx + 8, wz, biome) - terrainHeight(noise, wx - 8, wz, biome);
      const slopeZ = terrainHeight(noise, wx, wz + 8, biome) - terrainHeight(noise, wx, wz - 8, biome);
      const slope = Math.min(1, Math.hypot(slopeX, slopeZ) / 18);
      let color = grass.clone().lerp(min, 0.28);
      if (biome === "desert" || biome === "coast" || biome === "islands") color.copy(sand);
      color.lerp(rock, THREE.MathUtils.smoothstep(slope, isHimalaya ? 0.12 : 0.18, isHimalaya ? 0.48 : 0.68) * (isHimalaya ? 0.94 : 0.82));
      if (isHimalaya) {
        const screeBand = THREE.MathUtils.smoothstep(h, 105, 210) * (1 - THREE.MathUtils.smoothstep(h, 270, 330));
        color.lerp(new THREE.Color(0x8b8980), screeBand * THREE.MathUtils.smoothstep(slope, 0.08, 0.42) * 0.42);
        const valleyShade = (1 - THREE.MathUtils.smoothstep(h, 45, 145)) * (1 - THREE.MathUtils.smoothstep(slope, 0.05, 0.32));
        color.lerp(new THREE.Color(0x354d43), valleyShade * 0.42);
      }
      if (["himalayas", "snow", "lake", "forest", "rainforest"].includes(biome)) {
        const snowLine = (isHimalaya ? 285 : 225) + noise(wx * 0.001, wz * 0.001) * (isHimalaya ? 55 : 42);
        color.lerp(snow, THREE.MathUtils.smoothstep(h, snowLine - 22, snowLine + 32));
      }
      if (biome === "lake" && Math.hypot(wx, wz) < 1080) color.lerp(grass, 0.35);
      if (biome === "green") {
        const field = Math.sin(wx * 0.0018 + Math.sin(wz * 0.0007) * 2.2);
        const field2 = Math.sin(wx * 0.00092 - wz * 0.00135 + noise(wx * 0.00022, wz * 0.00022) * 2.1);
        const cropMix = THREE.MathUtils.smoothstep(field, 0.42, 0.94) * 0.52;
        color.lerp(new THREE.Color(0xc2ad70), cropMix);
        color.lerp(new THREE.Color(0x78965a), THREE.MathUtils.smoothstep(field2, -0.1, 0.82) * 0.24);
        const terraceEdge = 1 - Math.abs(THREE.MathUtils.euclideanModulo(h + 5, 10.5) - 5.25) / 5.25;
        color.lerp(new THREE.Color(0x9b865d), THREE.MathUtils.smoothstep(terraceEdge, 0.78, 0.98) * 0.22);
        const valleyFloor = (1 - THREE.MathUtils.smoothstep(h, -18, 22)) * (1 - THREE.MathUtils.smoothstep(slope, 0.08, 0.34));
        color.lerp(new THREE.Color(0x405f43), valleyFloor * 0.48);
      }
      if (biome === "delta") { const field = Math.sin(wx * 0.0011 + wz * 0.00018) * Math.cos(wz * 0.0009); color.lerp(new THREE.Color(0xc1a66b), THREE.MathUtils.smoothstep(field, 0.55, 0.9) * 0.72); }
      const detail = (isHimalaya ? 0.86 : 0.92) + fbm(noise, wx * 1.3, wz * 1.3) * (isHimalaya ? 0.28 : biome === "green" ? 0.24 : 0.18);
      color.multiplyScalar(detail);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col;
      const b = a + 1, c = a + segments + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const baseCount = positions.length / 3;
  const edgePairs = [];
  for (let i = 0; i < segments; i++) {
    edgePairs.push([i, i + 1]);
    edgePairs.push([segments * (segments + 1) + i, segments * (segments + 1) + i + 1]);
    edgePairs.push([i * (segments + 1), (i + 1) * (segments + 1)]);
    edgePairs.push([i * (segments + 1) + segments, (i + 1) * (segments + 1) + segments]);
  }
  for (const [a, b] of edgePairs) {
    const sa = positions.length / 3;
    positions.push(positions[a * 3], positions[a * 3 + 1] - SKIRT_DEPTH, positions[a * 3 + 2]);
    colors.push(colors[a * 3] * .82, colors[a * 3 + 1] * .82, colors[a * 3 + 2] * .82);
    normals.push(normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]);
    const sb = positions.length / 3;
    positions.push(positions[b * 3], positions[b * 3 + 1] - SKIRT_DEPTH, positions[b * 3 + 2]);
    colors.push(colors[b * 3] * .82, colors[b * 3 + 1] * .82, colors[b * 3 + 2] * .82);
    normals.push(normals[b * 3], normals[b * 3 + 1], normals[b * 3 + 2]);
    indices.push(a, sa, b, b, sa, sb);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, makeTerrainMaterial(biome));
  mesh.material.side = THREE.FrontSide;
  mesh.position.set(chunkX, 0, chunkZ);
  mesh.receiveShadow = true;
  mesh.userData.gridKey = chunkX + ":" + chunkZ;
  mesh.userData.minHeight = minHeight;
  mesh.userData.maxHeight = maxHeight;
  mesh.userData.lod = segments;
  if (segments >= MID_SEGMENTS) addHillVegetation(mesh, noise, chunkX, chunkZ, biome);
  return mesh;
}

function createWaterMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: (seed % 10000) * 0.013 },
      uSunDirection: { value: new THREE.Vector3(-0.4, 0.8, -0.45).normalize() }
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 view = viewMatrix * world;
        vView = normalize(-view.xyz);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uSeed;
      uniform vec3 uSunDirection;
      varying vec3 vWorld;
      varying vec3 vView;
      float hash(vec2 p) { return fract(sin(dot(p + uSeed, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      void main() {
        vec2 p=vWorld.xz*.006;
        float n=noise(p+uTime*.025)+noise(p*2.1-uTime*.04)*.45;
        vec3 normal=normalize(vec3(dFdx(n)*2.2,1.0,dFdy(n)*2.2));
        float fresnel=pow(1.0-max(dot(normalize(vView),normal),0.0),4.0);
        vec3 water=mix(vec3(.025,.22,.31),vec3(.008,.065,.16),smoothstep(.1,.9,n));
        vec3 sky=mix(vec3(.42,.62,.72),vec3(.035,.12,.22),.5+.5*normal.y);
        water=mix(water,sky,fresnel*.78);
        float glitter=pow(max(dot(reflect(-normalize(uSunDirection),normal),normalize(vView)),0.0),80.0);
        water+=vec3(1.0,.78,.52)*glitter*.65;
        gl_FragColor=vec4(water,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: true,
    side: THREE.DoubleSide
  });
}

export class Terrain {
  constructor(scene, seed, biome) {
    this.scene = scene;
    this.seed = seed;
    this.biome = biome;
    this.noise = createNoise2D(makeRandom(seed));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = new Map();
    this.water = null;
    this.waterMaterial = null;
    this.waterEnabled = ["coast", "islands", "lake"].includes(biome);
    this.river = null;
    this.riverMaterial = null;
    if (["green", "delta", "forest", "rainforest"].includes(biome)) {
      const positions = [], indices = [];
      const steps = 500;
      for (let i = 0; i <= steps; i++) {
        const z = 20000 - i * 80;
        const center = Math.sin(z * 0.00032 + this.noise(80, z * 0.00018) * 1.6) * 1100;
        const width = biome === "delta" ? 210 + 90 * Math.sin(i * 0.035) ** 2 : 95 + 45 * Math.sin(i * 0.027) ** 2;
        positions.push(center - width, -43, z, center + width, -43, z);
        if (i < steps) { const a=i*2,b=a+1,c=a+2,d=a+3; indices.push(a,c,b,b,c,d); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions,3)); geo.setIndex(indices); geo.computeVertexNormals();
      this.riverMaterial = createWaterMaterial(seed + 17);
      this.river = new THREE.Mesh(geo,this.riverMaterial); this.river.frustumCulled=false; this.river.renderOrder=2; scene.add(this.river);
    }
    if (this.waterEnabled) {
      const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 1, 1);
      this.waterMaterial = createWaterMaterial(seed);
      this.water = new THREE.Mesh(geometry, this.waterMaterial);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = biome === "lake" ? -42 : -12;
      this.water.frustumCulled = false;
      this.water.renderOrder = 1;
      scene.add(this.water);
    }
    this.lastCenterX = NaN;
    this.lastCenterZ = NaN;
  }

  getHeightAt(x, z) {
    return terrainHeight(this.noise, x, z, this.biome);
  }

  getWaterLevel() {
    return this.biome === "lake" ? -42 : this.waterEnabled ? -12 : -43;
  }

  lodAt(x, z) {
    const cx = Math.round(x / CHUNK_SIZE) * CHUNK_SIZE;
    const cz = Math.round(z / CHUNK_SIZE) * CHUNK_SIZE;
    return this.chunks.get(cx + ":" + cz)?.userData.lod ?? HIGH_SEGMENTS;
  }

  lodForDistance(distance) {
    if (distance < CHUNK_SIZE * 1.6) return HIGH_SEGMENTS;
    if (distance < CHUNK_SIZE * 3.4) return MID_SEGMENTS;
    return LOW_SEGMENTS;
  }

  update(dt, speed, altitude, camera) {
    if (!camera) return;
    const centerX = Math.round(camera.position.x / CHUNK_SIZE) * CHUNK_SIZE;
    const centerZ = Math.round(camera.position.z / CHUNK_SIZE) * CHUNK_SIZE;
    if (centerX !== this.lastCenterX || centerZ !== this.lastCenterZ) {
      this.lastCenterX = centerX;
      this.lastCenterZ = centerZ;
      const wanted = new Set();
      for (let gz = -GRID_RADIUS; gz <= GRID_RADIUS; gz++) {
        for (let gx = -GRID_RADIUS; gx <= GRID_RADIUS; gx++) {
          const x = centerX + gx * CHUNK_SIZE;
          const z = centerZ + gz * CHUNK_SIZE;
          const key = x + ":" + z;
          wanted.add(key);
          if (!this.chunks.has(key)) {
            const distance = Math.hypot(gx, gz) * CHUNK_SIZE;
            const segments = distance < CHUNK_SIZE * 0.9 ? HIGH_SEGMENTS : this.lodForDistance(distance);
            const chunk = makeChunk(this.noise, x, z, this.biome, segments);
            this.group.add(chunk);
            this.chunks.set(key, chunk);
            this.applyChunkDebug(chunk);
          }
        }
      }
      for (const [key, chunk] of this.chunks) {
        if (!wanted.has(key)) {
          this.group.remove(chunk);
          if (chunk.userData.border) {
            this.group.remove(chunk.userData.border);
            chunk.userData.border.geometry.dispose();
            chunk.userData.border.material.dispose();
          }
          disposeChunk(chunk);
          this.chunks.delete(key);
        }
      }
    }
    if (this.riverMaterial) this.riverMaterial.uniforms.uTime.value += dt;
    if (this.water) {
      this.water.position.x = camera.position.x;
      this.water.position.z = camera.position.z;
      this.waterMaterial.uniforms.uTime.value += dt;
    }
  }

  setDebugOptions(options = {}) {
    this.debugOptions = { ...(this.debugOptions || {}), ...options };
    for (const chunk of this.chunks.values()) this.applyChunkDebug(chunk);
  }

  applyChunkDebug(chunk) {
    const opts = this.debugOptions || {};
    const material = chunk.material;
    material.wireframe = !!opts.wireframe;
    if (opts.lodColors) {
      material.color.set(chunk.userData.lod >= HIGH_SEGMENTS ? 0x75d8ff : chunk.userData.lod >= MID_SEGMENTS ? 0xf3c969 : 0xe78b91);
    } else {
      material.color.set(0xffffff);
    }
    chunk.traverse(object => {
      if (object.isInstancedMesh) object.visible = opts.trees !== false;
    });
    if (opts.chunkBorders && !chunk.userData.border) {
      const edges = new THREE.EdgesGeometry(chunk.geometry, 1);
      const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffd36a, transparent: true, opacity: .72, depthWrite: false }));
      lines.position.copy(chunk.position);
      lines.frustumCulled = false;
      this.group.add(lines);
      chunk.userData.border = lines;
    } else if (!opts.chunkBorders && chunk.userData.border) {
      this.group.remove(chunk.userData.border);
      chunk.userData.border.geometry.dispose();
      chunk.userData.border.material.dispose();
      chunk.userData.border = null;
    }
  }

  getDebugInfo() {
    const chunks = [...this.chunks.values()];
    const vegetation = { pine: 0, broadleaf: 0, bush: 0, total: 0 };
    for (const chunk of chunks) {
      const stats = chunk.userData.vegetationStats;
      if (!stats) continue;
      vegetation.pine += stats.pine || 0;
      vegetation.broadleaf += stats.broadleaf || 0;
      vegetation.bush += stats.bush || 0;
    }
    vegetation.total = vegetation.pine + vegetation.broadleaf + vegetation.bush;
    return {
      chunkCount: chunks.length,
      viewDistance: GRID_RADIUS * CHUNK_SIZE,
      noiseOctaves: 2,
      vegetation,
      minHeight: chunks.length ? Math.min(...chunks.map(c => c.userData.minHeight)) : 0,
      maxHeight: chunks.length ? Math.max(...chunks.map(c => c.userData.maxHeight)) : 0
    };
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      this.group.remove(chunk);
      disposeChunk(chunk);
    }
    this.chunks.clear();
    this.scene.remove(this.group);
    if (this.river) {
      this.scene.remove(this.river);
      this.river.geometry.dispose();
      this.river.material.dispose();
    }
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      this.water.material.dispose();
    }
  }
}
