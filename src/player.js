import * as THREE from "three";

const SKIN = new THREE.MeshStandardMaterial({ color: 0xc88762, roughness: 0.78 });
const SUIT = new THREE.MeshStandardMaterial({ color: 0x26394b, roughness: 0.82 });
const SUIT_LIGHT = new THREE.MeshStandardMaterial({ color: 0x40596d, roughness: 0.78 });
const GLOVE = new THREE.MeshStandardMaterial({ color: 0x17232e, roughness: 0.9 });
const BOOT = new THREE.MeshStandardMaterial({ color: 0x111a22, roughness: 0.92 });
const ACCENT = new THREE.MeshStandardMaterial({ color: 0xe49a42, roughness: 0.65 });
const VISOR = new THREE.MeshStandardMaterial({ color: 0x263d50, metalness: 0.55, roughness: 0.22 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x17232d, roughness: 0.9 });

function capsuleBetween(parent, start, end, radius, material, radialSegments = 10) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = delta.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, radialSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function sphere(parent, position, scale, material, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(8, segments >> 1)), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, position, size, material, bevel = 0) {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeArm(parent, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.27, 0.28, 0);
  parent.add(pivot);
  capsuleBetween(pivot, [0, 0, 0], [side * 0.48, 0.02, 0.015], 0.115, SUIT_LIGHT);
  sphere(pivot, [side * 0.48, 0.02, 0.015], [0.12, 0.12, 0.12], SUIT);
  capsuleBetween(pivot, [side * 0.48, 0.02, 0.015], [side * 0.91, -0.10, 0.06], 0.085, SUIT);
  capsuleBetween(pivot, [side * 0.91, -0.10, 0.06], [side * 1.03, -0.13, 0.09], 0.075, GLOVE);
  sphere(pivot, [side * 1.07, -0.14, 0.09], [0.105, 0.075, 0.12], GLOVE);
  // Small orange sleeve patch.
  box(pivot, [side * 0.66, -0.005, 0.02], [0.12, 0.035, 0.17], ACCENT);
  return pivot;
}

function makeLeg(parent, side) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.13, -0.43, 0);
  parent.add(pivot);
  capsuleBetween(pivot, [0, 0, 0], [side * 0.11, -0.43, 0.025], 0.15, SUIT);
  sphere(pivot, [side * 0.11, -0.43, 0.025], [0.15, 0.15, 0.15], SUIT_LIGHT);
  capsuleBetween(pivot, [side * 0.11, -0.43, 0.025], [side * 0.20, -0.78, 0.11], 0.105, SUIT_LIGHT);
  capsuleBetween(pivot, [side * 0.20, -0.78, 0.11], [side * 0.23, -0.91, 0.19], 0.105, BOOT);
  sphere(pivot, [side * 0.23, -0.93, 0.23], [0.12, 0.09, 0.19], BOOT);
  return pivot;
}

function buildSkydiver() {
  const model = new THREE.Group();
  model.name = "ProceduralFreefallSkydiver";

  // Torso, waist and flight equipment.
  capsuleBetween(model, [0, -0.48, 0], [0, 0.48, 0], 0.245, SUIT_LIGHT, 14);
  sphere(model, [0, -0.39, 0.015], [0.255, 0.19, 0.24], SUIT);
  box(model, [0, 0.04, -0.205], [0.34, 0.53, 0.14], SUIT);
  // Harness straps and chest buckle.
  capsuleBetween(model, [-0.19, 0.37, -0.015], [-0.11, -0.22, -0.20], 0.027, ACCENT, 7);
  capsuleBetween(model, [0.19, 0.37, -0.015], [0.11, -0.22, -0.20], 0.027, ACCENT, 7);
  box(model, [0, -0.04, -0.225], [0.12, 0.10, 0.035], ACCENT);

  // Backpack and parachute container on the back.
  const pack = box(model, [0, 0.03, 0.245], [0.39, 0.58, 0.22], SUIT);
  pack.rotation.x = -0.06;
  box(model, [0, 0.12, 0.37], [0.30, 0.25, 0.045], SUIT_LIGHT);
  box(model, [0, -0.17, 0.37], [0.30, 0.13, 0.045], ACCENT);

  // Neck, head, ears and simple face details.
  capsuleBetween(model, [0, 0.43, 0], [0, 0.59, 0], 0.09, SKIN);
  sphere(model, [0, 0.72, 0], [0.19, 0.235, 0.19], SKIN, 20);
  sphere(model, [-0.185, 0.72, 0], [0.045, 0.07, 0.055], SKIN);
  sphere(model, [0.185, 0.72, 0], [0.045, 0.07, 0.055], SKIN);
  // Eyes and brows face the camera-facing side of the model.
  sphere(model, [-0.067, 0.755, -0.168], [0.022, 0.018, 0.012], DARK, 10);
  sphere(model, [0.067, 0.755, -0.168], [0.022, 0.018, 0.012], DARK, 10);
  // Skydiving goggles: dark lenses with a warm strap.
  sphere(model, [-0.083, 0.80, -0.16], [0.075, 0.055, 0.035], VISOR);
  sphere(model, [0.083, 0.80, -0.16], [0.075, 0.055, 0.035], VISOR);
  capsuleBetween(model, [-0.16, 0.81, -0.12], [0.16, 0.81, -0.12], 0.018, ACCENT, 7);

  const arms = [makeArm(model, -1), makeArm(model, 1)];
  const legs = [makeLeg(model, -1), makeLeg(model, 1)];

  // Small shoulder and knee seams add readable suit detail.
  for (const side of [-1, 1]) {
    sphere(model, [side * 0.25, 0.28, 0], [0.13, 0.13, 0.13], SUIT);
    box(model, [side * 0.16, -0.58, -0.11], [0.09, 0.16, 0.025], ACCENT);
  }

  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return { model, arms, legs };
}

/**
 * Self-contained Three.js skydiver. No external model or texture downloads.
 * The character is posed belly-down with arms and legs spread in freefall.
 */
export class Skydiver {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = "SkydiverFollowRoot";
    this.scene = scene;
    this.phase = Math.random() * Math.PI * 2;
    this.parts = buildSkydiver();
    this.model = this.parts.model;
    this.model.scale.setScalar(1.45);
    this.model.rotation.x = -0.10;
    this.root.add(this.model);
    scene.add(this.root);
    this.ready = true;
  }

  async load() {
    // Keep the async interface used by main.js; no GLB is required.
    return true;
  }

  update(dt, elapsed, speed = 90) {
    const gust = Math.sin(elapsed * 1.7 + this.phase);
    const flutter = Math.sin(elapsed * 3.1 + this.phase);
    this.parts.arms[0].rotation.z = -0.06 + gust * 0.075;
    this.parts.arms[1].rotation.z = 0.06 - gust * 0.075;
    this.parts.arms[0].rotation.x = flutter * 0.035;
    this.parts.arms[1].rotation.x = -flutter * 0.035;
    this.parts.legs[0].rotation.x = 0.045 + Math.sin(elapsed * 1.25 + this.phase) * 0.07;
    this.parts.legs[1].rotation.x = -0.045 + Math.sin(elapsed * 1.25 + this.phase + 1.2) * 0.07;
    this.root.rotation.z = Math.sin(elapsed * 0.62 + this.phase) * 0.025;
    this.root.rotation.x = -0.08 + Math.sin(elapsed * 0.43 + this.phase) * 0.018;
    this.root.rotation.y = Math.sin(elapsed * 0.31) * 0.025;
    this.root.position.x = Math.sin(elapsed * 0.15) * 0.48;
    this.root.position.y = Math.sin(elapsed * 0.8) * 0.075;
    this.root.position.z = -0.5 + Math.sin(elapsed * 0.35) * Math.min(0.06, speed * 0.00035);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    const geometries = new Set();
    const materials = new Set();
    this.model.traverse((node) => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
