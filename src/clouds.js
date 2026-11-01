import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

function makeCloudTexture(seed) {
  let state = seed >>> 0;
  const noise = createNoise2D(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      let n = 0, amp = 0.6;
      for (let o = 0; o < 5; o++) {
        n += noise(x * 0.014 * 2 ** o, y * 0.014 * 2 ** o) * amp;
        amp *= 0.48;
      }
      const radial = Math.hypot((x - 128) / 150, (y - 128) / 150);
      const edge = THREE.MathUtils.smoothstep(1.02 - radial, 0.02, 0.9);
      const alpha = THREE.MathUtils.clamp((n - 0.04) * 1.35 * edge, 0, 0.62);
      const i = (y * 256 + x) * 4;
      image.data[i] = 245;
      image.data[i + 1] = 250;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CloudField {
  constructor(scene, seed, weather = "clear") {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.texture = makeCloudTexture(seed);
    this.clouds = [];
    let state = (seed ^ 0x9e3779b9) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    // Two narrow altitude bands: 3000–3500 m and 1500–1800 m.
    const dense = weather === "heavy clouds" || weather === "storm" || weather === "rain";
    const bands = [
      { y: 325, count: dense ? 14 : 9, opacity: dense ? 0.22 : 0.13, width: [95, 205] },
      { y: 165, count: dense || weather === "mist" ? 13 : 7, opacity: dense ? 0.2 : weather === "mist" ? 0.18 : 0.12, width: [75, 165] }
    ];
    for (const band of bands) {
      for (let i = 0; i < band.count; i++) {
        const material = new THREE.SpriteMaterial({
          map: this.texture,
          color: i % 3 === 0 ? 0xffffff : 0xdceafa,
          transparent: true,
          opacity: band.opacity + random() * 0.02,
          depthWrite: false,
          depthTest: true
        });
        const sprite = new THREE.Sprite(material);
        const width = band.width[0] + random() * (band.width[1] - band.width[0]);
        sprite.scale.set(width, width * (0.22 + random() * 0.12), 1);
        sprite.userData.bandY = band.y;
        sprite.userData.phase = random() * Math.PI * 2;
        sprite.userData.drift = 3 + random() * 7;
        sprite.userData.radius = 360 + random() * 650;
        sprite.userData.depth = 420 + random() * 1050;
        this.group.add(sprite);
        this.clouds.push(sprite);
      }
    }
  }

  update(dt, speed, camera, altitude) {
    const cameraY = camera?.position.y ?? 0;
    for (const cloud of this.clouds) {
      const bandY = cloud.userData.bandY;
      const inBand = Math.abs(cameraY - bandY) < 42;
      const phase = cloud.userData.phase;
      cloud.visible = inBand;
      if (!inBand) continue;

      const angle = phase + performance.now() * 0.000012 * cloud.userData.drift;
      cloud.position.set(
        (camera?.position.x ?? 0) + Math.cos(angle) * cloud.userData.radius,
        bandY + Math.sin(angle * 0.7) * 13,
        (camera?.position.z ?? 0) - cloud.userData.depth
      );
      const distance = camera.position.distanceTo(cloud.position);
      if (distance < 30) {
        cloud.position.z = camera.position.z - 45;
        cloud.position.x += 45;
      }
    }
  }

  get count() {
    return this.clouds.reduce((n, cloud) => n + (cloud.visible ? 1 : 0), 0);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.texture.dispose();
    for (const cloud of this.clouds) cloud.material.dispose();
    this.clouds.length = 0;
  }
}
