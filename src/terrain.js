import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

const CHUNK_SIZE = 3000;
const SEGMENTS = 128;
const GRID_RADIUS = 7;
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

function fbm(noise, x, z) {
  let sum = 0, amp = 0.55, freq = 0.0018, norm = 0;
  for (let octave = 0; octave < 6; octave++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

function makeTerrainShader(material, biome) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vFallWorldPosition;\nvarying vec3 vFallWorldNormal;"
    ).replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvFallWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvFallWorldNormal = normalize(mat3(modelMatrix) * objectNormal);"
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
float fallNoiseValue = fallDetail(vFallWorldPosition.xz * 0.018);
float fallWet = 1.0 - smoothstep(-34.0, -23.0, fallHeight + fallNoiseValue * 5.0);
float fallDry = smoothstep(-31.0, -8.0, fallHeight + fallNoiseValue * 5.0);
float fallGrass = smoothstep(-12.0, 24.0, fallHeight);
float fallRock = smoothstep(0.22, 0.62, fallSlope);
float fallSnowLine = smoothstep(145.0 + fallNoiseValue * 28.0, 185.0 + fallNoiseValue * 28.0, fallHeight);
vec3 fallWetSand = vec3(0.34, 0.39, 0.34);
vec3 fallDrySand = vec3(0.67, 0.53, 0.34);
vec3 fallGrassColor = vec3(0.19, 0.32, 0.19);
vec3 fallForestFloor = vec3(0.12, 0.22, 0.14);
vec3 fallRockColor = vec3(0.31, 0.32, 0.31);
vec3 fallSnowColor = vec3(0.78, 0.83, 0.86);
vec3 fallBiomeTint = ${biome === "desert" ? "vec3(1.12,0.91,0.68)" : biome === "snow" || biome === "mountains" ? "vec3(0.91,0.97,1.04)" : "vec3(0.92,1.04,0.88)"};
vec3 fallGround = mix(fallWetSand, fallDrySand, fallDry);
fallGround = mix(fallGround, fallGrassColor * fallBiomeTint, fallGrass);
fallGround = mix(fallGround, fallForestFloor * fallBiomeTint, smoothstep(22.0, 58.0, fallHeight) * 0.35);
fallGround = mix(fallGround, fallRockColor, fallRock);
fallGround = mix(fallGround, fallSnowColor, fallSnowLine);
fallGround *= 0.91 + fallNoiseValue * 0.42;
diffuseColor.rgb = mix(diffuseColor.rgb, fallGround, 0.98);`
    );
  };
  material.customProgramCacheKey = () => "the-fall-terrain-shore-v1-" + biome;
}

function makeChunk(noise, z, biome, xOffset = 0, chunkSize = CHUNK_SIZE, segments = SEGMENTS) {
  const positions = [];
  const indices = [];
  const heights = new Float32Array((segments + 1) * (segments + 1));
  let minHeight = Infinity, maxHeight = -Infinity;
  const step = chunkSize / segments;
  const amplitude = BIOME_HEIGHT[biome] || 145;

  const heightAt = (x, worldZ) => {
    const warpX = x + noise(x * 0.0007, worldZ * 0.0007) * 115;
    const warpZ = worldZ + noise((x + 900) * 0.0007, (worldZ - 400) * 0.0007) * 115;
    let h = fbm(noise, warpX, warpZ) * amplitude;
    if (biome === "islands") {
      const shoreZ = Math.sin(x * 0.00022) * 1150 + Math.sin(x * 0.00061 + 1.7) * 360 + noise(x * 0.00048, worldZ * 0.00031) * 260;
      const coast = THREE.MathUtils.smoothstep(shoreZ - worldZ, -720, 260);
      const headland = Math.pow(Math.max(0, Math.sin(x * 0.00016 + 0.8)), 5) * 95;
      const dune = Math.max(0, noise(x * 0.0013, worldZ * 0.0011)) * 18;
      h = THREE.MathUtils.lerp(-72 + h * 0.12, h * 0.48 + 24 + headland + dune, coast) - 92;
    }
    if (biome === "desert") h = h * 0.76 + Math.sin(warpX * 0.0022 + noise(0, warpZ * 0.001) * 2.0) * 13;
    if (biome === "mountains" || biome === "snow") {
      const ridge = 1.0 - Math.abs(noise(warpX * 0.0012, warpZ * 0.0012));
      h += Math.pow(Math.max(0, ridge), 2.2) * (biome === "snow" ? 95 : 62);
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
    positions.push(x, y - 8, zLocal);
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
  const normalStep = 2.0;
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
  makeTerrainShader(material, biome);
  const mesh = new THREE.Mesh(geometry, material);
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
      uSeed: { value: (seed % 10000) * 0.013 }
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
        if (vTerrainHeight >= -28.0) discard;
        vec2 p=vWorldPosition.xz;
        float t=uTime;
        float n1=fbm2(p*.012+vec2(t*.045,-t*.026));
        float n2=fbm2(p*.031+vec2(-t*.075,t*.052));
        vec2 ripple=vec2(dFdx(n1+n2),dFdy(n1+n2))*3.8;
        vec3 normal=normalize(vec3(-ripple.x,1.0,-ripple.y));
        float viewDot=max(dot(normalize(vViewDirection),normal),0.0);
        float fresnel=pow(1.0-viewDot,4.0);
        // Estimate shoreline from the same broad world-space noise field as terrain.
        float waterDepth=max(0.0,-28.0-vTerrainHeight);
        float shore=1.0-smoothstep(0.0,1.8,waterDepth);
        float shallow=smoothstep(0.0,20.0,waterDepth);
        float lowNoise=fbm2(p*.00042+vec2(uTime*.002,.37));
        vec3 deep=vec3(.012,.105,.19);
        vec3 mid=vec3(.018,.29,.39);
        vec3 shallowColor=vec3(.12,.57,.57);
        vec3 color=mix(shallowColor,mid,smoothstep(2.0,20.0,waterDepth));
        color=mix(color,deep,smoothstep(20.0,42.0,waterDepth));
        color=mix(color,vec3(.57,.66,.57),(1.0-smoothstep(0.0,2.0,waterDepth))*.68*(.9+lowNoise*.1));
        vec3 skyReflection=mix(vec3(.025,.11,.18),vec3(.40,.65,.72),.5+.5*normal.y);
        color=mix(color,skyReflection,fresnel*.72);
        float sun=pow(max(dot(reflect(-normalize(uSunDirection),normal),normalize(vViewDirection)),0.0),72.0);
        float glitter=pow(max(dot(normal,uSunDirection),0.0),24.0)*pow(noise2(p*.22+t*.12),7.0);
        color+=vec3(1.0,.82,.58)*(sun*.75+glitter*.24);
        float waveCycle=sin(waterDepth*2.4-t*1.8+lowNoise*5.0);
        float foam=shore*smoothstep(.18,.72,noise2(p*.018+t*.018))*(.42+.58*smoothstep(-.25,.85,waveCycle));
        color=mix(color,vec3(.78,.91,.88),foam*.62);
        float waveLines=pow(max(0.0,sin(waterDepth*1.35-t*1.15+lowNoise*3.0)),18.0);
        color=mix(color,vec3(.65,.85,.83),waveLines*shore*.24);
        float distanceFade=smoothstep(900.0,3100.0,length(vWorldPosition.xz));
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

function createFarRanges(scene) {
  const layers = [];
  const colors = [0x536f83, 0x7896a8, 0xa4bac5];
  const distances = [10500, 14500, 18500];
  for (let layer = 0; layer < 3; layer++) {
    const positions = [], indices = [];
    const nx = 160, nz = 8, width = 80000, depth = 6500;
    for (let iz = 0; iz <= nz; iz++) {
      for (let ix = 0; ix <= nx; ix++) {
        const x = -width * .5 + width * ix / nx;
        const z = depth * iz / nz;
        const envelope = Math.sin(Math.PI * iz / nz) * .28 + .72;
        const ridge = Math.abs(Math.sin(x * (.00031 + layer * .000035) + layer * 2.1)) * 480 +
          Math.sin(x * .00083 + layer * 4.7) * 170 +
          Math.sin(x * .0019 + layer) * 75;
        const y = Math.max(80, (360 + ridge) * envelope);
        positions.push(x, y, z);
      }
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: colors[layer], roughness: 1, metalness: 0,
      side: THREE.DoubleSide, fog: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -distances[layer];
    mesh.userData.distance = -distances[layer];
    mesh.frustumCulled = false;
    scene.add(mesh);
    layers.push(mesh);
  }
  return {
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
    this.biome = biome;
    this.noise = createNoise2D(makeRandom(seed));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = [];
    this.chunkSize = CHUNK_SIZE;
    this.gridCenterX = Number.NaN;
    this.gridCenterZ = Number.NaN;
    this.ringCounts = { near: 0, mid: 0, far: 0, horizon: 0 };
    this.ensureGrid(0, 0);
    this.farRanges = createFarRanges(scene);
    this.farRanges.layers?.forEach(() => {});

    this.water = null;
    if (biome === "islands") {
      const segments = 192;
      const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, segments, segments);
      const heights = new Float32Array((segments + 1) * (segments + 1));
      geometry.setAttribute("terrainHeight", new THREE.BufferAttribute(heights, 1));
      this.waterHeights = heights;
      this.waterSegments = segments;
      this.waterCenterX = Number.NaN;
      this.waterCenterZ = Number.NaN;
      this.waterMaterial = createWaterMaterial(seed);
      this.water = new THREE.Mesh(geometry, this.waterMaterial);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = WATER_LEVEL;
      this.water.renderOrder = 1;
      this.scene.add(this.water);
      this.updateWaterClip(0, 0);
    }
  }

  lodForDistance(distance) {
    if (distance < 400) return { segments: 128, ring: "near" };
    if (distance < 1500) return { segments: 64, ring: "mid" };
    if (distance < 5000) return { segments: 32, ring: "far" };
    return { segments: 16, ring: "horizon" };
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
        const key = gx + ":" + gz;
        let chunk = keep.get(key);
        if (chunk && chunk.userData.lodSegments === lod.segments &&
            chunk.userData.worldX === x && chunk.userData.baseZ === z) {
          keep.delete(key);
        } else {
          if (chunk) {
            chunk.geometry.dispose(); chunk.material.dispose();
            this.group.remove(chunk); keep.delete(key);
          }
          chunk = makeChunk(this.noise, z, this.biome, x, this.chunkSize, lod.segments);
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
    let h = fbm(this.noise, warpX, warpZ) * (BIOME_HEIGHT[this.biome] || 145);
    if (this.biome === "islands") {
      const shoreZ = Math.sin(x * 0.00022) * 1150 + Math.sin(x * 0.00061 + 1.7) * 360 +
        this.noise(x * 0.00048, z * 0.00031) * 260;
      const coast = THREE.MathUtils.smoothstep(shoreZ - z, -720, 260);
      const headland = Math.pow(Math.max(0, Math.sin(x * 0.00016 + 0.8)), 5) * 95;
      const dune = Math.max(0, this.noise(x * 0.0013, z * 0.0011)) * 18;
      h = THREE.MathUtils.lerp(-72 + h * 0.12, h * 0.48 + 24 + headland + dune, coast) - 92;
    }
    return h;
  }

  updateWaterClip(centerX, centerZ) {
    if (!this.water || (centerX === this.waterCenterX && centerZ === this.waterCenterZ)) return;
    this.waterCenterX = centerX;
    this.waterCenterZ = centerZ;
    const pos = this.water.geometry.attributes.position;
    const out = this.waterHeights;
    for (let i = 0; i < pos.count; i++) {
      const wx = centerX + pos.getX(i);
      const wz = centerZ - pos.getY(i);
      out[i] = HEIGHT_BASE + this.heightAtWorld(wx, wz);
    }
    this.water.geometry.attributes.terrainHeight.needsUpdate = true;
  }

  update(dt, speed, altitude, camera) {
    if (camera) {
      this.ensureGrid(camera.position.x, camera.position.z);
      this.farRanges?.update(camera);
    }
    if (this.water) {
      const wx = camera?.position.x || 0, wz = camera?.position.z || 0;
      this.updateWaterClip(wx, wz);
      this.water.position.x = wx;
      this.water.position.z = wz;
      this.waterMaterial.uniforms.uTime.value += dt;
    }
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

  hasCoverage(radius = 20000) {
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
      chunkCount: this.chunks.length, chunksUnderCamera,
      ringCounts: { ...this.ringCounts }, coverage20km: this.hasCoverage(20000),
      seaLevel: WATER_LEVEL, waterEnabled: Boolean(this.water),
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
    if (this.water) {
      this.scene.remove(this.water); this.water.geometry.dispose(); this.water.material.dispose();
    }
  }
}
