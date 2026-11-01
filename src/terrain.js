import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

const CHUNK_SIZE = 2500;
const GRID_RADIUS = 8; // 17 x 17 chunks = 42.5 km across
const WATER_LEVEL = -12;
const WATER_SIZE = 52000;
const HIGH_SEGMENTS = 48;
const MID_SEGMENTS = 24;
const LOW_SEGMENTS = 8;

function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fbm(noise, x, z) {
  let sum = 0, amp = 0.55, freq = 0.00072, norm = 0;
  for (let octave = 0; octave < 6; octave++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function terrainHeight(noise, x, z, biome) {
  const warpX = x + noise(x * 0.00022, z * 0.00022) * 420;
  const warpZ = z + noise((x + 900) * 0.00022, (z - 400) * 0.00022) * 420;
  let h = fbm(noise, warpX, warpZ) * 115;
  if (["himalayas", "mountains", "snow", "lake"].includes(biome)) {
    const ridgeNoise = noise(warpX * 0.00048, warpZ * 0.00048);
    const ridges = Math.pow(Math.max(0, 1 - Math.abs(ridgeNoise)), 2.15);
    const rangeMask = biome === "lake"
      ? THREE.MathUtils.smoothstep(Math.hypot(x, z), 900, 3200)
      : 1;
    const mountainHeight = biome === "lake" ? 320 : biome === "himalayas" || biome === "snow" ? 365 : 245;
    h += ridges * mountainHeight * rangeMask;
    // Carve broad glacier valleys between ridgelines.
    h -= Math.pow(Math.max(0, 1 - Math.abs(noise(warpX * 0.00023 + 8, warpZ * 0.00023 - 3))), 5) * 72;
  }
  if (biome === "lake") {
    const lakeRadius = 850 + noise(1200, 300) * 90;
    const d = Math.hypot(x, z);
    h = THREE.MathUtils.lerp(h, -42, 1 - THREE.MathUtils.smoothstep(d, lakeRadius - 90, lakeRadius + 90));
  }
  if (biome === "green" || biome === "forest" || biome === "delta") {
    const center = Math.sin(warpZ * 0.00032 + noise(80, warpZ * 0.00018) * 1.6) * 1100;
    const distance = Math.abs(warpX - center);
    const width = biome === "delta" ? 320 : 170;
    h -= Math.exp(-Math.pow(distance / width, 2)) * (biome === "delta" ? 115 : 78);
    h += Math.exp(-Math.pow((distance - width * 1.45) / 110, 2)) * 15;
  }
  if (biome === "desert") {
    h = h * 0.68 + Math.sin(warpX * 0.00045 + noise(0, warpZ * 0.0002) * 2.1) * 38;
    h += Math.pow(Math.max(0, 1 - Math.abs(noise(warpX * 0.00017, warpZ * 0.00017))), 3) * 95;
  }
  if (biome === "islands" || biome === "coast") {
    const coastNoise = fbm(noise, warpX + 17000, warpZ - 8000);
    h = h * 0.65 - 65 + Math.max(0, coastNoise + 0.15) * 290;
    h += Math.pow(Math.max(0, 1 - Math.abs(noise(warpX * 0.00065, warpZ * 0.00065))), 4) * 55;
  }
  if (biome === "green" || biome === "forest") {
    h += Math.sin(warpX * 0.0013 + warpZ * 0.0007) * 12;
  }
  return h;
}

function makeTerrainMaterial(biome) {
  const material = new THREE.MeshStandardMaterial({
    color: biome === "desert" ? 0xb88760 : biome === "himalayas" || biome === "snow" || biome === "lake" ? 0xb8c4c8 : biome === "delta" ? 0x91a879 : 0x8da77b,
    roughness: 0.96,
    metalness: 0,
    vertexColors: true
  });
  return material;
}

function makeChunk(noise, chunkX, chunkZ, biome, segments) {
  const positions = [];
  const colors = [];
  const indices = [];
  const step = CHUNK_SIZE / segments;
  const min = new THREE.Color(0x314c3b);
  const grass = new THREE.Color(biome === "delta" ? 0x91a66c : 0x6e9562);
  const rock = new THREE.Color(0x777b78);
  const snow = new THREE.Color(0xe0e8ed);
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

      const slopeX = terrainHeight(noise, wx + 8, wz, biome) - terrainHeight(noise, wx - 8, wz, biome);
      const slopeZ = terrainHeight(noise, wx, wz + 8, biome) - terrainHeight(noise, wx, wz - 8, biome);
      const slope = Math.min(1, Math.hypot(slopeX, slopeZ) / 18);
      let color = grass.clone().lerp(min, 0.28);
      if (biome === "desert" || biome === "coast" || biome === "islands") color.copy(sand);
      color.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.18, 0.68) * 0.82);
      if (["himalayas", "snow", "lake"].includes(biome)) {
        const snowLine = 225 + noise(wx * 0.001, wz * 0.001) * 42;
        color.lerp(snow, THREE.MathUtils.smoothstep(h, snowLine - 22, snowLine + 32));
      }
      if (biome === "lake" && Math.hypot(wx, wz) < 1080) color.lerp(grass, 0.35);
      const detail = 0.92 + fbm(noise, wx * 1.3, wz * 1.3) * 0.18;
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, makeTerrainMaterial(biome));
  mesh.position.set(chunkX, 0, chunkZ);
  mesh.receiveShadow = true;
  mesh.userData.gridKey = chunkX + ":" + chunkZ;
  mesh.userData.minHeight = minHeight;
  mesh.userData.maxHeight = maxHeight;
  mesh.userData.lod = segments;
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
            const segments = this.lodForDistance(distance);
            const chunk = makeChunk(this.noise, x, z, this.biome, segments);
            this.group.add(chunk);
            this.chunks.set(key, chunk);
          }
        }
      }
      for (const [key, chunk] of this.chunks) {
        if (!wanted.has(key)) {
          this.group.remove(chunk);
          chunk.geometry.dispose();
          chunk.material.dispose();
          this.chunks.delete(key);
        }
      }
    }
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
      chunk.geometry.dispose();
      chunk.material.dispose();
    }
    this.chunks.clear();
    this.scene.remove(this.group);
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      this.water.material.dispose();
    }
  }
}
