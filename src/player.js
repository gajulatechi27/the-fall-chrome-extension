import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";

/**
 * Stage 2 skydiver. No procedural/primitive fallback by design.
 * Put a rigged Mixamo GLB with an embedded freefall animation at:
 * public/assets/skydiver-freefall.glb
 */
export class Skydiver {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = "SkydiverFollowRoot";
    scene.add(this.root);
    this.loader = new GLTFLoader();
    this.mixer = null;
    this.model = null;
    this.ready = false;
    this.error = null;
    this.phase = Math.random() * Math.PI * 2;
  }

  async load() {
    try {
      const gltf = await this.loader.loadAsync("/assets/skydiver-freefall.glb");
      this.model = gltf.scene;
      this.model.scale.setScalar(2.0);
      this.model.rotation.y = Math.PI;
      this.model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) {
            material.needsUpdate = true;
          }
        }
      });
      this.root.add(this.model);
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(this.model);
        const freefall = gltf.animations.find((clip) => /fall|free.?fall|skydive|jump/i.test(clip.name));
        this.mixer.clipAction(freefall || gltf.animations[0]).reset().play();
      } else {
        console.warn("Skydiver GLB has no embedded animation clip.");
      }
      this.ready = true;
      return true;
    } catch (error) {
      this.error = error;
      console.error("Skydiver model unavailable. Add public/assets/skydiver-freefall.glb.", error);
      return false;
    }
  }

  update(dt, elapsed, speed = 90) {
    this.mixer?.update(dt);
    this.root.rotation.z = Math.sin(elapsed * 0.62 + this.phase) * 0.035;
    this.root.rotation.x = -0.1 + Math.sin(elapsed * 0.43 + this.phase) * 0.018;
    this.root.rotation.y = Math.PI + Math.sin(elapsed * 0.31) * 0.025;
    this.root.position.x = Math.sin(elapsed * 0.15) * 0.65;
    this.root.position.y = Math.sin(elapsed * 0.8) * 0.1;
    this.root.position.z = -0.5 + Math.sin(elapsed * 0.35) * Math.min(0.08, speed * 0.0005);
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.model?.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
  }
}
