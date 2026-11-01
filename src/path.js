import * as THREE from "three";

const NODE_SPACING = 240;
const AHEAD_DISTANCE = 5200;
const BEHIND_DISTANCE = 480;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export class JourneyPath {
  constructor(seed, biome = "green") {
    this.seed = seed >>> 0;
    this.biome = biome;
    this.random = seeded(this.seed);
    this.startDistance = -BEHIND_DISTANCE;
    this.endDistance = AHEAD_DISTANCE;
    this.curve = null;
    this.line = null;
    this.group = new THREE.Group();
    this.nodes = [];
    this.build(this.startDistance, this.endDistance);
  }

  routePoint(distance) {
    const n = distance / NODE_SPACING;
    const a = Math.sin(n * 0.47);
    const b = Math.sin(n * 0.19);
    const c = Math.sin(n * 0.083);
    const amplitude = this.biome === "himalayas" ? 210 : this.biome === "coast" ? 150 : 105;
    const x = a * amplitude + b * amplitude * 0.42 + c * amplitude * 0.2;
    const y = Math.sin(n * 0.31) * 8 + Math.sin(n * 0.11) * 15;
    return new THREE.Vector3(x, y, -distance);
  }

  build(start, end) {
    this.startDistance = start;
    this.endDistance = end;
    const points = [];
    for (let d = start - NODE_SPACING; d <= end + NODE_SPACING; d += NODE_SPACING) {
      points.push(this.routePoint(d));
    }
    this.nodes = points;
    this.curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.35);
    this.curve.arcLengthDivisions = Math.max(200, points.length * 20);
    if (this.line) {
      this.group.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
    }
    const drawPoints = this.curve.getPoints(points.length * 12);
    const geometry = new THREE.BufferGeometry().setFromPoints(drawPoints);
    this.line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: this.biome === "desert" ? 0xd6b47a : 0xd5d0a5,
      transparent: true,
      opacity: 0.72
    }));
    this.line.frustumCulled = false;
    this.group.add(this.line);
  }

  ensureAhead(distance) {
    if (distance > this.endDistance - 1800) {
      const start = distance - BEHIND_DISTANCE;
      this.build(start, start + AHEAD_DISTANCE);
    }
  }

  getAt(distance) {
    this.ensureAhead(distance);
    const local = THREE.MathUtils.clamp(distance - (this.startDistance - NODE_SPACING), 0, this.endDistance - this.startDistance + NODE_SPACING * 2);
    const t = local / (this.endDistance - this.startDistance + NODE_SPACING * 2);
    const point = this.curve.getPoint(t);
    const tangent = this.curve.getTangent(t).normalize();
    return { point, tangent, curvature: this.getCurvature(distance) };
  }

  getCurvature(distance) {
    const a = this.getTangent(distance - 12);
    const b = this.getTangent(distance + 12);
    return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / 24;
  }

  getTangent(distance) {
    const local = THREE.MathUtils.clamp(distance - (this.startDistance - NODE_SPACING), 0, this.endDistance - this.startDistance + NODE_SPACING * 2);
    return this.curve.getTangent(local / (this.endDistance - this.startDistance + NODE_SPACING * 2)).normalize();
  }

  dispose() {
    if (this.line) {
      this.group.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
    }
    this.group.clear();
  }
}
