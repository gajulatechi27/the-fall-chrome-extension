import * as THREE from "three";

// Shared low-poly tree geometry keeps vegetation to one draw call per terrain chunk.
const treeGeometry = (() => {
  // A trunk plus three overlapping canopy tiers reads as a tree silhouette
  // from the low flight camera, unlike the previous single dark cone.
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 2.15, 6, 1);
  trunk.translate(0, 1.075, 0);
  const lower = new THREE.ConeGeometry(1.28, 2.55, 8, 2);
  lower.translate(0, 2.45, 0);
  const middle = new THREE.ConeGeometry(1.02, 2.25, 8, 2);
  middle.translate(0, 3.55, 0);
  const crown = new THREE.ConeGeometry(0.72, 1.95, 8, 2);
  crown.translate(0, 4.55, 0);

  const geometries = [trunk, lower, middle, crown];
  const merged = new THREE.BufferGeometry();
  const positions = [], normals = [], indices = [], colors = [];
  let offset = 0;
  for (const geometry of geometries) {
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      const y = p.getY(i);
      const color = y < 2.0
        ? new THREE.Color(0x594331)
        : new THREE.Color(0x3f7048).lerp(new THREE.Color(0x79a85c), Math.max(0, 1 - Math.abs(y - 3.5) / 3.5) * 0.48);
      colors.push(color.r, color.g, color.b);
    }
    const index = geometry.index;
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
    geometry.dispose();
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
})();
const treeMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  metalness: 0
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashChunk(seed, x, z) {
  let value = (seed ^ Math.imul(Math.round(x), 0x45d9f3b) ^ Math.imul(Math.round(z), 0x119de1f3)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function createVegetation({ seed, biome, environment, xOffset, chunkZ, chunkSize, segments, heightAt, seaLevel = -28 }) {
  const types = environment?.vegetation?.types || [];
  const desert = biome === "desert" && types.includes("desert-shrub");
  const supportsTrees = types.includes("pine") || types.includes("deciduous-trees");
  if ((!supportsTrees && !desert) || (!desert && biome !== "forest" && biome !== "snow") || segments < 32) return null;

  const density = THREE.MathUtils.clamp(environment?.vegetation?.density ?? 0.3, 0.08, 0.8);
  const lodFactor = segments >= 128 ? 1 : segments >= 64 ? 0.62 : 0.2;
  const targetCount = Math.round((desert ? 34 : biome === "snow" ? 150 : 112) * density * lodFactor);
  if (targetCount < 1) return null;

  const random = seededRandom(hashChunk(seed, xOffset, chunkZ));
  const shrubGeometry = desert ? new THREE.DodecahedronGeometry(1, 0) : treeGeometry;
  const shrubMaterial = desert ? new THREE.MeshStandardMaterial({ color: 0x9b7542, roughness: 1 }) : treeMaterial;
  const instances = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, targetCount);
  instances.name = "procedural-vegetation";
  instances.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  const attempts = targetCount * 7;

  for (let attempt = 0; attempt < attempts && placed < targetCount; attempt++) {
    const x = (random() - 0.5) * chunkSize * 0.94;
    const z = (random() - 0.5) * chunkSize * 0.94;
    const worldX = xOffset + x;
    const worldZ = chunkZ + z;
    const rawHeight = heightAt(worldX, worldZ);
    const worldHeight = 20 + rawHeight;
    if (worldHeight < seaLevel + (desert ? 8 : 24)) continue;

    const sample = 34;
    const dx = heightAt(worldX + sample, worldZ) - heightAt(worldX - sample, worldZ);
    const dz = heightAt(worldX, worldZ + sample) - heightAt(worldX, worldZ - sample);
    const slope = Math.hypot(dx, dz) / (sample * 2);
    if (slope > (desert ? 0.34 : biome === "snow" ? 0.58 : 0.48)) continue;

    // Keep trees away from the deepest river channel and leave irregular clearings.
    if (environment?.water?.type === "river" && worldHeight < seaLevel + 78) continue;
    if (random() < 0.09) continue;

    const scale = desert ? 0.8 + random() * 1.15 : (biome === "snow" ? 3.0 : 3.1) + random() * (biome === "snow" ? 2.1 : 2.4);
    dummy.position.set(x, worldHeight, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale * (0.82 + random() * 0.34), scale, scale * (0.82 + random() * 0.34));
    dummy.updateMatrix();
    instances.setMatrixAt(placed, dummy.matrix);

    const shade = 0.82 + random() * 0.3;
    tint.setHSL(
      desert ? 0.10 + random() * 0.06 : biome === "snow" ? 0.31 + random() * 0.025 : 0.34 + random() * 0.035,
      desert ? 0.42 : biome === "snow" ? 0.28 : 0.5,
      (desert ? 0.42 : biome === "snow" ? 0.46 : 0.44) * shade
    );
    instances.setColorAt(placed, tint);
    placed++;
  }

  if (placed === 0) return null;
  instances.count = placed;
  instances.instanceMatrix.needsUpdate = true;
  if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  instances.computeBoundingSphere();
  return instances;
}
