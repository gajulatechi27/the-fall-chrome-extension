import * as THREE from "three";

export type WorldDefinition = {
  name: string; subtitle: string; sky: number; fog: number; ground: number;
  accent: number; stone: number; light: number; atmosphere: string;
};

export const WORLDS: WorldDefinition[] = [
  { name: "Satya Yuga", subtitle: "THE AGE OF TRUTH", sky: 0x9bcbd2, fog: 0xc5d9c5, ground: 0x456e50, accent: 0xf5d58a, stone: 0xd9c69b, light: 0xffe1a3, atmosphere: "An untouched world of sacred groves and golden light." },
  { name: "Treta Yuga", subtitle: "THE AGE OF DHARMA", sky: 0x82b8d0, fog: 0xd5c6aa, ground: 0x6a8057, accent: 0xe6b96f, stone: 0xc7a779, light: 0xffd39a, atmosphere: "Ancient kingdoms, river valleys and monumental shrines." },
  { name: "Dvapara Yuga", subtitle: "THE AGE OF EPIC KINGDOMS", sky: 0x718ca8, fog: 0xb7b6a9, ground: 0x626b55, accent: 0xd6a65e, stone: 0x9d8c73, light: 0xf2c98b, atmosphere: "Fortified cities rise beneath a dramatic twilight." },
  { name: "Kali Yuga", subtitle: "THE AGE OF DARKNESS", sky: 0x171d31, fog: 0x3b4058, ground: 0x292d39, accent: 0x62d9d0, stone: 0x454b5d, light: 0x91d9e8, atmosphere: "A fractured world of steel, smoke and electric light." }
];

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, cast = true) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = cast;
  object.receiveShadow = true;
  group.add(object);
  return object;
}

function tree(group: THREE.Group, x: number, y: number, z: number, scale: number, rng: () => number) {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x604a34, roughness: 1 });
  const palette = [0x3f7650, 0x54875a, 0x739963, 0x477e5c];
  const leaves = new THREE.MeshStandardMaterial({ color: palette[Math.floor(rng() * palette.length)], roughness: .95 });
  mesh(group, new THREE.CylinderGeometry(.25 * scale, .48 * scale, 4.8 * scale, 9), trunk, x, y + 2.4 * scale, z);
  const crown = mesh(group, new THREE.IcosahedronGeometry(2.25 * scale, 2), leaves, x, y + 5.3 * scale, z);
  crown.scale.set(1.05, 1.18, .95);
  const crown2 = mesh(group, new THREE.IcosahedronGeometry(1.55 * scale, 1), leaves, x + 1.1 * scale, y + 6.2 * scale, z + .25 * scale);
}

function temple(group: THREE.Group, x: number, y: number, z: number, scale: number, stone: THREE.Material, trim: THREE.Material) {
  mesh(group, new THREE.BoxGeometry(15 * scale, 1.4 * scale, 11 * scale), trim, x, y, z);
  mesh(group, new THREE.BoxGeometry(12 * scale, 5.4 * scale, 8 * scale), stone, x, y + 3.1 * scale, z);
  for (let p = -2; p <= 2; p++) {
    mesh(group, new THREE.CylinderGeometry(.34 * scale, .43 * scale, 5.2 * scale, 16), trim, x + p * 2.45 * scale, y + 3.1 * scale, z + 4.2 * scale);
  }
  const roof = mesh(group, new THREE.ConeGeometry(8.7 * scale, 4.5 * scale, 4), trim, x, y + 7.6 * scale, z);
  roof.rotation.y = Math.PI / 4;
  for (let p = -1; p <= 1; p++) mesh(group, new THREE.BoxGeometry(.5 * scale, 3.7 * scale, .6 * scale), trim, x + p * 3.6 * scale, y + 2.7 * scale, z + 4.7 * scale);
}

function cloud(group: THREE.Group, x: number, y: number, z: number, scale: number, material: THREE.Material) {
  const puff = mesh(group, new THREE.SphereGeometry(1, 12, 10), material, x, y, z, false);
  puff.scale.set(5.5 * scale, 1.35 * scale, 2.2 * scale);
  const puff2 = mesh(group, new THREE.SphereGeometry(1, 12, 10), material, x + 3.4 * scale, y + .8 * scale, z + .4 * scale, false);
  puff2.scale.set(3.8 * scale, 1.5 * scale, 2 * scale);
}

export function createWorld(_scene: THREE.Scene, index: number, yOffset = 0): THREE.Group {
  const data = WORLDS[index];
  const rng = seeded(9301 + index * 7919 + Math.round(Math.abs(yOffset)) * 13);
  const world = new THREE.Group();
  world.userData.worldIndex = index;
  world.position.y = yOffset;

  const ground = new THREE.MeshStandardMaterial({ color: data.ground, roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: data.stone, roughness: .82 });
  const trim = new THREE.MeshStandardMaterial({ color: data.accent, roughness: .48, metalness: index === 3 ? .58 : .16, emissive: index === 3 ? data.accent : 0x000000, emissiveIntensity: index === 3 ? .8 : 0 });
  const dark = new THREE.MeshStandardMaterial({ color: index === 3 ? 0x20283b : 0x59634d, roughness: .95 });
  const terrain = mesh(world, new THREE.PlaneGeometry(300, 300), ground, 0, -88, -58, false);
  terrain.rotation.x = -Math.PI / 2;

  // Soft cloud banks establish depth behind the landmark silhouettes.
  const cloudMat = new THREE.MeshStandardMaterial({ color: index === 3 ? 0x46516b : 0xe5e4d8, roughness: 1, transparent: true, opacity: index === 3 ? .2 : .48 });
  for (let i = 0; i < 10; i++) cloud(world, (rng() - .5) * 230, -35 - rng() * 48, -112 - rng() * 38, .8 + rng() * 1.5, cloudMat);

  // Distant ridges use layered, non-uniform silhouettes instead of repeated spikes.
  for (let i = 0; i < 17; i++) {
    const height = 22 + rng() * 36;
    const width = 18 + rng() * 20;
    const palette = index === 0 ? [0x648b70, 0x77977a] : index === 1 ? [0x8c9076, 0xa99a7d] : index === 2 ? [0x6d7e8e, 0x87909b] : [0x252f49, 0x35405c];
    const ridge = mesh(world, new THREE.ConeGeometry(width, height, 7), new THREE.MeshStandardMaterial({ color: palette[i % 2], roughness: 1 }), (i - 8) * 23, -70 + rng() * 8, -132 - rng() * 25);
    ridge.scale.z = .65 + rng() * .6;
    ridge.rotation.z = (rng() - .5) * .12;
  }

  if (index === 0) {
    // Satya: sacred grove, luminous shrine and broad forest canopy.
    temple(world, 0, -87, -62, 1.35, stone, trim);
    const halo = mesh(world, new THREE.TorusGeometry(12, .28, 12, 72), trim, 0, -76, -64, false);
    halo.rotation.x = Math.PI / 2;
    for (let i = 0; i < 34; i++) tree(world, (rng() - .5) * 190, -88, -18 - rng() * 118, .8 + rng() * 1.5, rng);
  } else if (index === 1) {
    // Treta: river valley, stepped ghats and a large temple complex.
    const river = mesh(world, new THREE.PlaneGeometry(28, 210), new THREE.MeshStandardMaterial({ color: 0x4d9ca8, roughness: .22, metalness: .25, transparent: true, opacity: .88 }), 28, -87.2, -73, false);
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = -.08;
    temple(world, -24, -87, -64, 1.45, stone, trim);
    for (let side = 0; side < 2; side++) for (let i = 0; i < 7; i++) {
      const x = side === 0 ? -58 - i * 2 : 58 + i * 2;
      mesh(world, new THREE.BoxGeometry(17, 1.2, 7), stone, x, -87 + i * .15, -40 - i * 10);
    }
    for (let i = 0; i < 17; i++) tree(world, (rng() - .5) * 190, -88, -22 - rng() * 110, .7 + rng() * 1.2, rng);
    for (let i = 0; i < 5; i++) temple(world, 58 + i * 17, -87, -100 - rng() * 20, .38, stone, trim);
  } else if (index === 2) {
    // Dvapara: fortified capital with walls, towers, gates and banners.
    mesh(world, new THREE.BoxGeometry(74, 19, 9), stone, 0, -77, -78);
    mesh(world, new THREE.BoxGeometry(28, 27, 12), trim, 0, -70, -80);
    for (const x of [-34, -17, 17, 34]) {
      mesh(world, new THREE.BoxGeometry(8, 35 + rng() * 8, 9), dark, x, -65, -78);
      mesh(world, new THREE.ConeGeometry(5, 7, 4), trim, x, -43, -78);
    }
    for (let i = 0; i < 20; i++) {
      const x = (rng() - .5) * 190, z = -18 - rng() * 115, h = 10 + rng() * 26;
      mesh(world, new THREE.BoxGeometry(7 + rng() * 5, h, 8), stone, x, -87 + h / 2, z);
    }
  } else {
    // Kali: a continuous futuristic skyline, illuminated windows and elevated transit.
    for (let i = 0; i < 32; i++) {
      const x = (rng() - .5) * 210, z = -20 - rng() * 125, w = 7 + rng() * 8, d = 7 + rng() * 8, h = 22 + rng() * 54;
      const tower = mesh(world, new THREE.BoxGeometry(w, h, d), dark, x, -87 + h / 2, z);
      tower.rotation.y = (rng() - .5) * .12;
      const windowMat = new THREE.MeshStandardMaterial({ color: data.accent, emissive: data.accent, emissiveIntensity: 1.1, roughness: .35 });
      for (let row = 0; row < Math.min(6, Math.floor(h / 9)); row++) {
        for (let col = -1; col <= 1; col++) mesh(world, new THREE.BoxGeometry(1.1, 1.6, .18), windowMat, x + col * 2.2, -87 + 5 + row * 8, z + d / 2 + .12, false);
      }
      if (i % 4 === 0) mesh(world, new THREE.ConeGeometry(1.8, 12, 8), trim, x, -87 + h + 6, z, false);
    }
    for (const x of [-42, 42]) {
      const rail = mesh(world, new THREE.BoxGeometry(3, 2, 155), trim, x, -62, -83, false);
      rail.rotation.x = .03;
    }
  }

  // Foreground stones and debris give the falling camera a stronger sense of scale.
  for (let i = 0; i < 24; i++) {
    const x = (rng() - .5) * 190, z = -8 - rng() * 105, size = 1.5 + rng() * 4;
    const rock = mesh(world, new THREE.DodecahedronGeometry(size, 1), index === 3 ? dark : stone, x, -87 + size * .35, z);
    rock.rotation.set(rng(), rng(), rng());
  }

  const count = index === 3 ? 620 : 440;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - .5) * 210;
    positions[i * 3 + 1] = -15 - rng() * 125;
    positions[i * 3 + 2] = -12 - rng() * 145;
  }
  const particles = new THREE.BufferGeometry();
  particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  world.add(new THREE.Points(particles, new THREE.PointsMaterial({ color: data.accent, size: index === 3 ? .9 : .55, transparent: true, opacity: .72, depthWrite: false })));
  return world;
}
