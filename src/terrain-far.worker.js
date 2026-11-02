import { createNoise2D } from "simplex-noise";

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function fbm(noise, x, z, octaves) {
  let value = 0, amplitude = 0.55, frequency = 0.00135, norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, z * frequency) * amplitude;
    norm += amplitude; amplitude *= 0.48; frequency *= 1.9;
  }
  return value / norm;
}
self.onmessage = ({ data }) => {
  const { request, seed, centerX, centerZ, size, segments, biome, baseHeight, ridgeWeight, octaves } = data;
  const noise = createNoise2D(random(seed));
  const row = segments + 1, count = row * row;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const indices = new Uint32Array(segments * segments * 6);
  const step = size / segments;
  const heightAt = (x, z) => {
    const wx = x + noise(x * .0007, z * .0007) * 115;
    const wz = z + noise((x + 900) * .0007, (z - 400) * .0007) * 115;
    let h = fbm(noise, wx, wz, octaves) * baseHeight;
    if (biome === "desert") {
      const field = wz * .00034 + noise(wx * .00028, wz * .00016) * 1.25;
      h = h * .32 + Math.sin(field) * 58 + Math.sin(field * .52 + 1.3) * 30;
    } else if (biome === "snow" || biome === "mountains") {
      const r1 = 1 - Math.abs(noise(wx * .00082, wz * .00082));
      const r2 = 1 - Math.abs(noise(wx * .00215 + 13, wz * .00215 - 7));
      h += (Math.pow(Math.max(0, r1), 2.4) * 112 + Math.pow(Math.max(0, r2), 3.1) * 24) * ridgeWeight;
    } else {
      h += noise(wx * .00034 + 31, wz * .00034 - 17) * (biome === "islands" ? 30 : 15);
    }
    return h + 20;
  };
  for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
    const i = z * row + x, wx = centerX - size / 2 + x * step, wz = centerZ - size / 2 + z * step;
    positions[i * 3] = x * step - size / 2;
    positions[i * 3 + 1] = heightAt(wx, wz);
    positions[i * 3 + 2] = z * step - size / 2;
    const d = Math.max(8, step * .55);
    const dx = heightAt(wx + d, wz) - heightAt(wx - d, wz);
    const dz = heightAt(wx, wz + d) - heightAt(wx, wz - d);
    const nx = -dx / (2 * d), ny = 1, nz = -dz / (2 * d);
    const length = Math.hypot(nx, ny, nz);
    normals.set([nx / length, ny / length, nz / length], i * 3);
  }
  let p = 0;
  for (let z = 0; z < segments; z++) for (let x = 0; x < segments; x++) {
    const a = z * row + x, b = a + 1, c = a + row, d = c + 1;
    indices.set([a, c, b, b, c, d], p); p += 6;
  }
  self.postMessage({ request, centerX, centerZ, positions, normals, indices }, [positions.buffer, normals.buffer, indices.buffer]);
};