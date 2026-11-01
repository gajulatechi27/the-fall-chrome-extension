import * as THREE from "three";

// Shared low-poly tree geometry keeps vegetation to one draw call per terrain chunk.
const treeGeometry = (() => {
  const geometry = new THREE.ConeGeometry(1.15, 5.2, 7, 3);
  geometry.translate(0, 2.6, 0);
  const positions = geometry.attributes.position;
  const colors = [];
  const trunk = new THREE.Color(0x594331);
  const canopy = new THREE.Color(0x244b35);
  const underside = new THREE.Color(0x426b43);
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const color = y < 0.85 ? trunk : canopy.clone().lerp(underside, Math.max(0, 1 - y / 5.2) * 0.35);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
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
  const supportsTrees = types.includes("pine") || types.includes("deciduous-trees");
  if (!supportsTrees || (biome !== "forest" && biome !== "snow") || segments < 32) return null;

  const density = THREE.MathUtils.clamp(environment?.vegetation?.density ?? 0.3, 0.08, 0.8);
  const lodFactor = segments >= 128 ? 1 : segments >= 64 ? 0.62 : 0.2;
  const targetCount = Math.round((biome === "snow" ? 38 : 48) * density * lodFactor);
  if (targetCount < 1) return null;

  const random = seededRandom(hashChunk(seed, xOffset, chunkZ));
  const instances = new THREE.InstancedMesh(treeGeometry, treeMaterial, targetCount);
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
    if (worldHeight < seaLevel + 24) continue;

    const sample = 34;
    const dx = heightAt(worldX + sample, worldZ) - heightAt(worldX - sample, worldZ);
    const dz = heightAt(worldX, worldZ + sample) - heightAt(worldX, worldZ - sample);
    const slope = Math.hypot(dx, dz) / (sample * 2);
    if (slope > (biome === "snow" ? 0.58 : 0.48)) continue;

    // Keep trees away from the deepest river channel and leave irregular clearings.
    if (environment?.water?.type === "river" && worldHeight < seaLevel + 78) continue;
    if (random() < 0.13) continue;

    const scale = (biome === "snow" ? 2.2 : 1.8) + random() * (biome === "snow" ? 2.5 : 2.8);
    dummy.position.set(x, worldHeight, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale * (0.82 + random() * 0.34), scale, scale * (0.82 + random() * 0.34));
    dummy.updateMatrix();
    instances.setMatrixAt(placed, dummy.matrix);

    const shade = 0.82 + random() * 0.3;
    tint.setHSL(
      biome === "snow" ? 0.31 + random() * 0.025 : 0.34 + random() * 0.035,
      biome === "snow" ? 0.34 : 0.42,
      (biome === "snow" ? 0.22 : 0.2) * shade
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
