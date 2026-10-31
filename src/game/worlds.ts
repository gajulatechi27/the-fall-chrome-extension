import * as THREE from "three";

export type WorldDefinition = {
  name: string; subtitle: string; sky: number; fog: number; ground: number;
  accent: number; stone: number; light: number; atmosphere: string;
};

export const WORLDS: WorldDefinition[] = [
  { name: "Satya Yuga", subtitle: "THE AGE OF TRUTH", sky: 0x9bc9d1, fog: 0xc5d9c5, ground: 0x426e55, accent: 0xf5d58a, stone: 0xd9c69b, light: 0xffe1a3, atmosphere: "The first age — golden light over an untouched world." },
  { name: "Treta Yuga", subtitle: "THE AGE OF DHARMA", sky: 0x86b9d0, fog: 0xd6c6a8, ground: 0x6d8760, accent: 0xe6b96f, stone: 0xc7a779, light: 0xffd39a, atmosphere: "Sacred rivers, ancient kingdoms and monumental temples." },
  { name: "Dvapara Yuga", subtitle: "THE AGE OF EPIC KINGDOMS", sky: 0x718ca8, fog: 0xb7b6a9, ground: 0x626b55, accent: 0xd6a65e, stone: 0x9d8c73, light: 0xf2c98b, atmosphere: "Fortified cities rise beneath a restless sky." },
  { name: "Kali Yuga", subtitle: "THE AGE OF DARKNESS", sky: 0x171d31, fog: 0x3b4058, ground: 0x292d39, accent: 0x62d9d0, stone: 0x454b5d, light: 0x91d9e8, atmosphere: "A fractured age of smoke, steel and distant lights." }
];

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, cast = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeTree(group: THREE.Group, x: number, y: number, z: number, scale: number, lush: boolean, rng: () => number) {
  const trunk = new THREE.MeshStandardMaterial({ color: lush ? 0x624b35 : 0x514638, roughness: 1 });
  const leaves = new THREE.MeshStandardMaterial({ color: lush ? [0x3e7651, 0x588b59, 0x779b60][Math.floor(rng() * 3)] : 0x59604d, roughness: 1 });
  addMesh(group, new THREE.CylinderGeometry(.35 * scale, .62 * scale, 5 * scale, 7), trunk, x, y + 2.5 * scale, z);
  const crown = addMesh(group, new THREE.IcosahedronGeometry(2.8 * scale, 1), leaves, x, y + 5.5 * scale, z);
  crown.scale.set(1, 1.2, 1);
}

function makeTemple(group: THREE.Group, x: number, y: number, z: number, scale: number, stone: THREE.Material, accent: THREE.Material) {
  addMesh(group, new THREE.BoxGeometry(13 * scale, 1.2 * scale, 9 * scale), stone, x, y, z);
  addMesh(group, new THREE.BoxGeometry(11 * scale, 5 * scale, 7 * scale), stone, x, y + 3 * scale, z);
  for (let p = -1; p <= 1; p++) {
    addMesh(group, new THREE.CylinderGeometry(.42 * scale, .5 * scale, 5.5 * scale, 12), accent, x + p * 3.4 * scale, y + 3.2 * scale, z + 3.8 * scale);
  }
  const roof = addMesh(group, new THREE.ConeGeometry(8 * scale, 4 * scale, 4), accent, x, y + 7.2 * scale, z);
  roof.rotation.y = Math.PI / 4;
}

export function createWorld(_scene: THREE.Scene, index: number): THREE.Group {
  const data = WORLDS[index];
  const rng = seeded(9301 + index * 7919);
  const world = new THREE.Group();
  world.userData.worldIndex = index;

  const ground = new THREE.MeshStandardMaterial({ color: data.ground, roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: data.stone, roughness: .82 });
  const accent = new THREE.MeshStandardMaterial({ color: data.accent, roughness: .5, metalness: index === 3 ? .55 : .12, emissive: index === 3 ? data.accent : 0x000000, emissiveIntensity: index === 3 ? .55 : 0 });
  const terrain = addMesh(world, new THREE.PlaneGeometry(260, 260, 1, 1), ground, 0, -88, -58, false);
  terrain.rotation.x = -Math.PI / 2;

  // Layered distant mountain silhouettes add scale and a visible horizon.
  for (let i = 0; i < 19; i++) {
    const height = 24 + rng() * 43;
    const color = index === 0 ? 0x6e9278 : index === 1 ? 0x9b9a7d : index === 2 ? 0x8795a4 : 0x303b54;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    const ridge = addMesh(world, new THREE.ConeGeometry(13 + rng() * 13, height, 6), mat, (i - 9) * 19, -65 + rng() * 8, -105 - rng() * 30);
    ridge.rotation.z = (rng() - .5) * .12;
  }

  // A central landmark gives each age a different silhouette.
  if (index <= 1) {
    makeTemple(world, 0, -86, -57, index === 0 ? 1.25 : 1.05, stone, accent);
    if (index === 0) {
      const halo = addMesh(world, new THREE.TorusGeometry(10, .35, 10, 64), accent, 0, -76, -59, false);
      halo.rotation.x = Math.PI / 2;
    }
  } else if (index === 2) {
    addMesh(world, new THREE.BoxGeometry(23, 37, 17), stone, 0, -68, -60);
    addMesh(world, new THREE.BoxGeometry(29, 3, 22), accent, 0, -48, -60);
    for (const x of [-13, 13]) addMesh(world, new THREE.CylinderGeometry(1.1, 1.4, 30, 10), accent, x, -69, -60);
    for (const x of [-1, 1]) addMesh(world, new THREE.ConeGeometry(4, 11, 4), stone, x * 7, -45, -60);
  } else {
    for (let i = -2; i <= 2; i++) {
      const h = 30 + rng() * 38;
      const tower = addMesh(world, new THREE.BoxGeometry(8 + rng() * 4, h, 8 + rng() * 4), stone, i * 13, -86 + h / 2, -60 - rng() * 18);
      tower.rotation.y = (rng() - .5) * .12;
      for (let y = -h / 2 + 5; y < h / 2 - 2; y += 7) {
        addMesh(world, new THREE.BoxGeometry(2.4, 1, .2), accent, i * 13, -86 + h / 2 + y, -54 - rng() * 2, false);
      }
    }
  }

  // Era-specific landscape dressing.
  for (let i = 0; i < 30; i++) {
    const x = (rng() - .5) * 180;
    const z = -18 - rng() * 115;
    if (index <= 1) {
      if (i % 4 === 0) makeTemple(world, x, -87, z, .35 + rng() * .28, stone, accent);
      else makeTree(world, x, -87, z, .8 + rng() * 1.5, true, rng);
    } else if (index === 2) {
      const width = 4 + rng() * 6, height = 10 + rng() * 25;
      addMesh(world, new THREE.BoxGeometry(width, height, width), stone, x, -87 + height / 2, z);
      if (i % 3 === 0) addMesh(world, new THREE.ConeGeometry(4, 8, 4), accent, x, -87 + height + 4, z);
    } else {
      const width = 5 + rng() * 7, height = 18 + rng() * 45;
      addMesh(world, new THREE.BoxGeometry(width, height, width), stone, x, -87 + height / 2, z);
      addMesh(world, new THREE.BoxGeometry(width * .55, .45, .2), accent, x, -87 + height / 2, z + width / 2 + .12, false);
    }
  }

  // Floating dust, pollen or luminous ash, depending on the age.
  const count = 420;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - .5) * 190;
    positions[i * 3 + 1] = -15 - rng() * 115;
    positions[i * 3 + 2] = -12 - rng() * 140;
  }
  const particles = new THREE.BufferGeometry();
  particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  world.add(new THREE.Points(particles, new THREE.PointsMaterial({
    color: data.accent, size: index === 3 ? .85 : .52, transparent: true, opacity: .72,
    sizeAttenuation: true, depthWrite: false
  })));

  return world;
}
