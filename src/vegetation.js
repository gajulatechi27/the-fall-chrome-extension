import * as THREE from "three";

// Shared low-poly tree geometry keeps vegetation to one draw call per terrain chunk.
const treeGeometry = (() => {
  // Organic, overlapping foliage masses replace the stacked cone silhouette.
  // The deliberately uneven crown reads as a broadleaf tree from flight height.
  const trunk = new THREE.CylinderGeometry(0.13, 0.24, 2.35, 7, 1);
  trunk.translate(0, 1.175, 0);

  const crownParts = [
    { x: 0, y: 3.15, z: 0, sx: 1.12, sy: 1.28, sz: 1.02 },
    { x: -0.58, y: 3.05, z: 0.12, sx: 0.78, sy: 0.88, sz: 0.82 },
    { x: 0.58, y: 3.28, z: -0.08, sx: 0.82, sy: 0.96, sz: 0.78 },
    { x: 0.12, y: 3.82, z: 0.52, sx: 0.72, sy: 0.82, sz: 0.72 },
    { x: -0.18, y: 3.88, z: -0.48, sx: 0.76, sy: 0.84, sz: 0.78 },
    { x: 0.04, y: 4.48, z: 0.02, sx: 0.62, sy: 0.78, sz: 0.62 }
  ];
  const foliage = crownParts.map((part, index) => {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.scale(part.sx, part.sy, part.sz);
    geometry.rotateY(index * 0.73);
    geometry.translate(part.x, part.y, part.z);
    return geometry;
  });

  const geometries = [trunk, ...foliage];
  const merged = new THREE.BufferGeometry();
  const positions = [], indices = [], colors = [];
  let offset = 0;
  for (const geometry of geometries) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      positions.push(px, py, pz);
      const color = py < 2.15
        ? new THREE.Color(0x594331)
        : new THREE.Color(0x315f3b).lerp(
            new THREE.Color(0x83ad62),
            THREE.MathUtils.clamp((py - 2.2) / 4.0, 0, 1) * 0.42
          );
      colors.push(color.r, color.g, color.b);
    }
    const index = geometry.index;
    if (index) for (let i = 0; i < index.count; i++) indices.push(index.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
    geometry.dispose();
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
})();
const treeMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  metalness: 0
});

const meadowGrassGeometry = (() => {
  const blade = new THREE.BufferGeometry();
  blade.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.22, 0, 0, 0.22, 0, 0, 0.015, 1.35, 0,
    0, 0, -0.22, 0, 0, 0.22, 0, 1.35, 0.015
  ], 3));
  blade.setIndex([0, 1, 2, 3, 4, 5]);
  blade.computeVertexNormals();
  return blade;
})();
const meadowGrassMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide
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
  const supportsMeadowGrass = types.includes("meadow-grass") && environment?.id === "green-hills";
  if ((!supportsTrees && !desert && !supportsMeadowGrass) || (!desert && biome !== "forest" && biome !== "snow") || segments < 32) return null;

  const density = THREE.MathUtils.clamp(environment?.vegetation?.density ?? 0.3, 0.08, 0.8);
  const lodFactor = segments >= 128 ? 1 : segments >= 64 ? 0.62 : 0.2;
  const targetCount = Math.round((desert ? 34 : biome === "snow" ? 150 : environment?.id === "green-hills" ? 245 : 112) * density * lodFactor);

  const random = seededRandom(hashChunk(seed, xOffset, chunkZ));
  const shrubGeometry = desert ? new THREE.DodecahedronGeometry(1, 0) : treeGeometry;
  const shrubMaterial = desert ? new THREE.MeshStandardMaterial({ color: 0x9b7542, roughness: 1 }) : treeMaterial;
  const instances = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, Math.max(1, targetCount));
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
    // In the Himalayan scene, keep conifers in lower forest belts only.
    // Above the configured tree line the ridges remain completely bare/snowy.
    if (!desert && Number.isFinite(environment?.vegetation?.maxElevation) &&
        rawHeight > environment.vegetation.maxElevation) continue;

    const sample = 34;
    const dx = heightAt(worldX + sample, worldZ) - heightAt(worldX - sample, worldZ);
    const dz = heightAt(worldX, worldZ + sample) - heightAt(worldX, worldZ - sample);
    const slope = Math.hypot(dx, dz) / (sample * 2);
    const maxTreeSlope = environment?.vegetation?.maxSlope ?? (biome === "snow" ? 0.58 : 0.48);
    if (slope > (desert ? 0.34 : maxTreeSlope)) continue;

    // Keep trees away from the deepest river channel and leave irregular clearings.
    if (environment?.water?.type === "river" && worldHeight < seaLevel + 78) continue;
    if (random() < 0.09) continue;

    const scale = desert ? 0.8 + random() * 1.15 : environment?.id === "green-hills" ? 6.0 + random() * 3.2 : (biome === "snow" ? 3.0 : 3.1) + random() * (biome === "snow" ? 2.1 : 2.4);
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

  const group = new THREE.Group();
  if (placed > 0) {
    instances.count = placed;
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    instances.computeBoundingSphere();
    group.add(instances);
  }

  if (supportsMeadowGrass) {
    const grassCount = Math.round(720 * density * lodFactor * (environment?.vegetation?.grassDensity ?? 1));
    const grass = new THREE.InstancedMesh(meadowGrassGeometry, meadowGrassMaterial, grassCount);
    grass.name = "meadow-grass";
    grass.frustumCulled = false;
    let grassPlaced = 0;
    for (let attempt = 0; attempt < grassCount * 3 && grassPlaced < grassCount; attempt++) {
      const x = (random() - 0.5) * chunkSize * 0.96;
      const z = (random() - 0.5) * chunkSize * 0.96;
      const worldX = xOffset + x;
      const worldZ = chunkZ + z;
      const height = heightAt(worldX, worldZ);
      if (20 + height < seaLevel + 82) continue;
      const sample = 28;
      const dx = heightAt(worldX + sample, worldZ) - heightAt(worldX - sample, worldZ);
      const dz = heightAt(worldX, worldZ + sample) - heightAt(worldX, worldZ - sample);
      if (Math.hypot(dx, dz) / (sample * 2) > 0.34) continue;
      if (random() < 0.22) continue;
      const scale = 1.1 + random() * 1.8;
      dummy.position.set(x, 20 + height, z);
      dummy.rotation.set(0, random() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      grass.setMatrixAt(grassPlaced, dummy.matrix);
      tint.setHSL(0.25 + random() * 0.08, 0.48 + random() * 0.18, 0.31 + random() * 0.18);
      grass.setColorAt(grassPlaced, tint);
      grassPlaced++;
    }
    grass.count = grassPlaced;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.computeBoundingSphere();
    if (grassPlaced > 0) group.add(grass);
  }
  return group.children.length ? group : null;
}
