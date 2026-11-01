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
    this.weather = weather;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.texture = makeCloudTexture(seed);
    this.clouds = [];
    let state = (seed ^ 0x9e3779b9) >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };

    // Three camera-relative cloud decks; they pass around the viewer instead of
    // requiring the camera to cross fixed world-space altitude bands.
    const stormy = weather === "heavy clouds" || weather === "storm" || weather === "rain";
    const bands = [
      { y: 105, count: stormy ? 18 : 12, opacity: stormy ? 0.30 : 0.17, width: [180, 330], depth: [420, 1100], drift: 1.0 },
      { y: 235, count: stormy ? 15 : 9, opacity: stormy ? 0.24 : 0.13, width: [140, 280], depth: [850, 1750], drift: 0.62 },
      { y: 390, count: stormy ? 12 : 7, opacity: stormy ? 0.19 : 0.10, width: [110, 240], depth: [1450, 2600], drift: 0.34 }
    ];
    for (let bandIndex=0;bandIndex<bands.length;bandIndex++) {
      const band=bands[bandIndex];
      for(let i=0;i<band.count;i++){
        const material=new THREE.SpriteMaterial({
          map:this.texture,
          color:stormy&&bandIndex===0?0x71808b:(i%3===0?0xffffff:0xdceafa),
          transparent:true,
          opacity:band.opacity+random()*0.035,
          depthWrite:false,
          depthTest:true
        });
        const sprite=new THREE.Sprite(material);
        const width=band.width[0]+random()*(band.width[1]-band.width[0]);
        sprite.scale.set(width,width*(0.24+random()*0.18),1);
        sprite.userData.bandOffset=band.y+(random()-.5)*65;
        sprite.userData.phase=random()*Math.PI*2;
        sprite.userData.drift=band.drift*(3+random()*8);
        sprite.userData.radius=280+random()*1250;
        sprite.userData.depth=band.depth[0]+random()*(band.depth[1]-band.depth[0]);
        sprite.userData.bandIndex=bandIndex;
        sprite.userData.baseColor=material.color.getHex();
        this.group.add(sprite);this.clouds.push(sprite);
      }
    }
  }

  update(dt, speed, camera, altitude) {
    if (!camera) return;
    const now = performance.now() * 0.001;
    const stormy = this.weather === "storm" || this.weather === "heavy clouds" || this.weather === "rain";
    for (const cloud of this.clouds) {
      const phase = cloud.userData.phase;
      const angle = phase + now * 0.018 * cloud.userData.drift;
      const band = cloud.userData.bandIndex;
      cloud.visible = true;
      cloud.position.set(
        camera.position.x + Math.cos(angle) * cloud.userData.radius,
        camera.position.y + cloud.userData.bandOffset + Math.sin(angle * 0.7) * 18,
        camera.position.z - cloud.userData.depth + Math.sin(angle * 0.31) * 180
      );
      const distance = camera.position.distanceTo(cloud.position);
      const fade = THREE.MathUtils.smoothstep(distance, 180, 420);
      cloud.material.opacity = (stormy ? 0.28 : 0.17) * fade;
      cloud.material.color.set(band === 0 && stormy ? 0x84909a : cloud.userData.baseColor);
      if (distance < 80) {
        cloud.position.x += 150;
        cloud.position.z -= 160;
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
