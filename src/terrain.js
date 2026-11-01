import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

const CHUNK_SIZE = 1500;
const SEGMENTS = 112;
const WATER_LEVEL = -28;
const WATER_SIZE = 6200;
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

function makeChunk(noise, z, biome) {
  const positions = [];
  const indices = [];
  const heights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));
  let minHeight = Infinity, maxHeight = -Infinity;
  const step = CHUNK_SIZE / SEGMENTS;
  const amplitude = BIOME_HEIGHT[biome] || 145;

  const heightAt = (x, worldZ) => {
    const warpX = x + noise(x * 0.0007, worldZ * 0.0007) * 115;
    const warpZ = worldZ + noise((x + 900) * 0.0007, (worldZ - 400) * 0.0007) * 115;
    let h = fbm(noise, warpX, warpZ) * amplitude;
    if (biome === "islands") h = h - 92 + Math.max(0, h) * 0.18;
    if (biome === "desert") h = h * 0.76 + Math.sin(warpX * 0.0022 + noise(0, warpZ * 0.001) * 2.0) * 13;
    if (biome === "mountains" || biome === "snow") {
      const ridge = 1.0 - Math.abs(noise(warpX * 0.0012, warpZ * 0.0012));
      h += Math.pow(Math.max(0, ridge), 2.2) * (biome === "snow" ? 95 : 62);
    }
    return h;
  };

  for (let row = 0; row <= SEGMENTS; row++) {
    for (let col = 0; col <= SEGMENTS; col++) {
      const x = -CHUNK_SIZE * 0.5 + col * step;
      const localZ = -CHUNK_SIZE * 0.5 + row * step;
      const worldZ = z + localZ;
      const h = heightAt(x, worldZ);
      heights[row * (SEGMENTS + 1) + col] = h;
      const worldHeight = HEIGHT_BASE + h;
      minHeight = Math.min(minHeight, worldHeight);
      maxHeight = Math.max(maxHeight, worldHeight);
      positions.push(x, worldHeight, localZ);
    }
  }

  for (let row = 0; row < SEGMENTS; row++) {
    for (let col = 0; col < SEGMENTS; col++) {
      const a = row * (SEGMENTS + 1) + col;
      const b = a + 1;
      const c = a + SEGMENTS + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // A narrow skirt closes the outer silhouette and hides sub-pixel cracks.
  const edge = [];
  for (let x = 0; x <= SEGMENTS; x++) edge.push(x);
  for (let y = 1; y <= SEGMENTS; y++) edge.push(y * (SEGMENTS + 1) + SEGMENTS);
  for (let x = SEGMENTS - 1; x >= 0; x--) edge.push(SEGMENTS * (SEGMENTS + 1) + x);
  for (let y = SEGMENTS - 1; y > 0; y--) edge.push(y * (SEGMENTS + 1));
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
    const x = positions[i * 3], localZ = positions[i * 3 + 2], worldZ = z + localZ;
    const dx = heightAt(x + normalStep, worldZ) - heightAt(x - normalStep, worldZ);
    const dz = heightAt(x, worldZ + normalStep) - heightAt(x, worldZ - normalStep);
    const n = new THREE.Vector3(-dx / (2 * normalStep), 1, -dz / (2 * normalStep)).normalize();
    normals[i * 3] = n.x; normals[i * 3 + 1] = n.y; normals[i * 3 + 2] = n.z;
  }
  for (let i = skirtStart; i < positions.length / 3; i++) {
    normals[i * 3] = 0; normals[i * 3 + 1] = 1; normals[i * 3 + 2] = 0;
  }
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0, side: THREE.DoubleSide });
  makeTerrainShader(material, biome);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.biome = biome;
  mesh.userData.minHeight = minHeight;
  mesh.userData.maxHeight = maxHeight;
  mesh.userData.heightAt = heightAt;
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
      void main(){
        vec4 world = modelMatrix * vec4(position,1.0);
        vWorldPosition = world.xyz;
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
        vec2 p=vWorldPosition.xz;
        float t=uTime;
        float n1=fbm2(p*.012+vec2(t*.045,-t*.026));
        float n2=fbm2(p*.031+vec2(-t*.075,t*.052));
        vec2 ripple=vec2(dFdx(n1+n2),dFdy(n1+n2))*3.8;
        vec3 normal=normalize(vec3(-ripple.x,1.0,-ripple.y));
        float viewDot=max(dot(normalize(vViewDirection),normal),0.0);
        float fresnel=pow(1.0-viewDot,4.0);
        // Estimate shoreline from the same broad world-space noise field as terrain.
        float landSignal=fbm2(p*.0018+vec2(.37,.19));
        float shore=1.0-smoothstep(-.055,.045,landSignal);
        float shallow=smoothstep(-.09,.13,landSignal);
        vec3 deep=vec3(.012,.105,.19);
        vec3 mid=vec3(.018,.29,.39);
        vec3 shallowColor=vec3(.12,.57,.57);
        vec3 color=mix(deep,mid,shallow);
        color=mix(color,shallowColor,shore*.72);
        vec3 skyReflection=mix(vec3(.025,.11,.18),vec3(.40,.65,.72),.5+.5*normal.y);
        color=mix(color,skyReflection,fresnel*.72);
        float sun=pow(max(dot(reflect(-normalize(uSunDirection),normal),normalize(vViewDirection)),0.0),72.0);
        float glitter=pow(max(dot(normal,uSunDirection),0.0),24.0)*pow(noise2(p*.22+t*.12),7.0);
        color+=vec3(1.0,.82,.58)*(sun*.75+glitter*.24);
        float foam=shore*smoothstep(.12,.34,noise2(p*.055+t*.025));
        color=mix(color,vec3(.72,.86,.83),foam*.48);
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

export class Terrain {
  constructor(scene, seed, biome, routeTheme = "") {
    this.scene = scene;
    this.seed = seed;
    this.biome = biome;
    this.noise = createNoise2D(makeRandom(seed));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = [];
    for (let i = 0; i < 4; i++) {
      const chunkZ = -i * CHUNK_SIZE;
      const chunk = makeChunk(this.noise, chunkZ, biome);
      this.group.add(chunk);
      this.chunks.push(chunk);
    }

    this.water = null;
    if (biome === "islands") {
      const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 1, 1);
      this.waterMaterial = createWaterMaterial(seed);
      this.water = new THREE.Mesh(geometry, this.waterMaterial);
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = WATER_LEVEL;
      this.water.renderOrder = 1;
      this.scene.add(this.water);
    }
  }

  update(dt, speed, altitude, camera) {
    const movement = dt * (speed * 1.65 + 70);
    this.group.position.z += movement;
    if (camera) this.group.position.x = camera.position.x * 0.82;
    for (const chunk of this.chunks) {
      if (chunk.position.z + this.group.position.z > 900) {
        chunk.position.z -= CHUNK_SIZE * 4;
        chunk.geometry.dispose();
        chunk.material.dispose();
        this.group.remove(chunk);
        const next = makeChunk(this.noise, chunk.position.z, this.biome);
        next.position.z = chunk.position.z;
        this.group.add(next);
        this.chunks[this.chunks.indexOf(chunk)] = next;
      }
    }
    if (this.water) {
      this.water.position.x = camera?.position.x || 0;
      this.water.position.z = (camera?.position.z || 0) + this.group.position.z;
      this.waterMaterial.uniforms.uTime.value += dt;
    }
  }

  getDebugInfo() {
    return {
      chunkCount: this.chunks.length,
      seaLevel: this.water ? WATER_LEVEL : null,
      minHeight: Math.min(...this.chunks.map(c => c.userData.minHeight ?? Infinity)),
      maxHeight: Math.max(...this.chunks.map(c => c.userData.maxHeight ?? -Infinity))
    };
  }

  dispose() {
    for (const chunk of this.chunks) {
      chunk.geometry.dispose();
      chunk.material.dispose();
    }
    this.group.parent?.remove(this.group);
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      this.water.material.dispose();
    }
  }
}
