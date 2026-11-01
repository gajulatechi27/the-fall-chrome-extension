import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

const CHUNK_SIZE = 2500;
const GRID_RADIUS = 8; // 17 x 17 chunks = 42.5 km across
const WATER_LEVEL = -12;
const WATER_SIZE = 52000;
const HIGH_SEGMENTS = 128;
const MID_SEGMENTS = 64;
const LOW_SEGMENTS = 24;
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
    roughness: 0.96,
    metalness: 0,
    vertexColors: true
  });
  return material;
}

function addHillVegetation(mesh, noise, chunkX, chunkZ) {
  const random = makeRandom((Math.abs(Math.floor(chunkX * 17 + chunkZ * 31)) ^ 0x5f3759df) >>> 0);
  const palettes = [0x315f3b, 0x477a45, 0x6b8b4b];
  const geometries = [
    new THREE.ConeGeometry(1, 4.8, 6),
    new THREE.SphereGeometry(1.65, 7, 5),
    new THREE.ConeGeometry(1.8, 3.4, 7)
  ];
  const materials = geometries.map(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 }));
  for (let shape = 0; shape < 3; shape++) {
    const count = 18;
    const trees = new THREE.InstancedMesh(geometries[shape], materials[shape], count);
    trees.castShadow = false;
    trees.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let placed = 0, attempts = 0;
    while (placed < count && attempts < count * 5) {
      attempts++;
      const x = (random() - 0.5) * CHUNK_SIZE;
      const z = (random() - 0.5) * CHUNK_SIZE;
      const wx = chunkX + x, wz = chunkZ + z;
      const y = terrainHeight(noise, wx, wz, "green");
      const sx = terrainHeight(noise, wx + 16, wz, "green") - terrainHeight(noise, wx - 16, wz, "green");
      const sz = terrainHeight(noise, wx, wz + 16, "green") - terrainHeight(noise, wx, wz - 16, "green");
      const slope = Math.hypot(sx, sz) / 32;
      const moisture = noise(wx * 0.00031 + 27, wz * 0.00031 - 13);
      if (slope > 0.42 || moisture < -0.42 || y < -8) continue;
      const scale = 5 + random() * 7;
      dummy.position.set(x, y + scale * 1.35, z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.set(scale * (shape === 1 ? 1.1 : 0.72), scale, scale * (shape === 2 ? 1.18 : 0.72));
      dummy.updateMatrix();
      trees.setMatrixAt(placed, dummy.matrix);
      trees.setColorAt(placed, new THREE.Color(palettes[Math.floor(random() * palettes.length)]));
      placed++;
    }
    trees.count = placed;
    mesh.add(trees);
  }
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
  if (biome === "green" && segments >= MID_SEGMENTS) addHillVegetation(mesh, noise, chunkX, chunkZ);
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
          }
        }
      }
      for (const [key, chunk] of this.chunks) {
        if (!wanted.has(key)) {
          this.group.remove(chunk);
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

  getDebugInfo() {
    const chunks = [...this.chunks.values()];
    return {
      chunkCount: chunks.length,
      viewDistance: GRID_RADIUS * CHUNK_SIZE,
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
