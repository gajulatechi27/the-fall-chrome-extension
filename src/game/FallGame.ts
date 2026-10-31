import * as THREE from "three";
import { createWorld, WORLDS } from "./worlds";

type GameMode = "play" | "watch";
type GameState = { worldName: string; worldIndex: number; score: number; distance: number; worldProgress: number; transitioning: boolean; nextWorldName: string };

export class FallGame {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 760);
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private player = new THREE.Group();
  private worldGroup = new THREE.Group();
  private worldChunks: THREE.Group[] = [];
  private portal: THREE.Mesh;
  private portalCore: THREE.Mesh;
  private running = false;
  private paused = false;
  private mode: GameMode = "play";
  private worldIndex = 0;
  private worldProgress = 0;
  private distance = 0;
  private score = 0;
  private playerX = 0;
  private targetX = 0;
  private transitionTimer = 0;
  private transitionActive = false;
  private soundEnabled = true;
  private callbacks: Array<(s: GameState) => void> = [];
  private keys = new Set<string>();
  private frame = 0;
  private audio?: AudioContext;
  private disposed = false;
  private leftArm = new THREE.Group();
  private rightArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private targetSky = new THREE.Color(WORLDS[0].sky);
  private flash = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.scene.background = this.targetSky.clone();
    this.scene.fog = new THREE.Fog(WORLDS[0].fog, 70, 340);
    this.camera.position.set(0, 5.8, 13.5);
    this.camera.lookAt(0, 0, -10);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x344039, 1.9));
    const sun = new THREE.DirectionalLight(0xffdfb0, 3.3);
    sun.position.set(-32, 55, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x83c8ff, 95, 78);
    rim.position.set(0, 5, -10);
    this.scene.add(rim);

    this.createPlayer();
    this.scene.add(this.player);
    const portalMaterial = new THREE.MeshBasicMaterial({ color: 0xa5f5ed, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.portal = new THREE.Mesh(new THREE.TorusGeometry(10.5, .42, 18, 112), portalMaterial);
    this.portal.position.set(0, -52, -48);
    this.scene.add(this.portal);
    this.portalCore = new THREE.Mesh(new THREE.CircleGeometry(9.9, 72), new THREE.MeshBasicMaterial({ color: 0x7cdedb, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.portalCore.position.set(0, -52, -48.1);
    this.scene.add(this.portalCore);
    this.scene.add(this.worldGroup);
    this.loadWorld(0);
    this.bindControls();
    window.addEventListener("resize", this.onResize);
    this.renderer.render(this.scene, this.camera);
  }

  private createPlayer() {
    const suit = new THREE.MeshStandardMaterial({ color: 0x172535, roughness: .52, metalness: .12 });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x34495d, roughness: .8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb9785b, roughness: .9 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x30241f, roughness: .95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xcaa568, roughness: .4, metalness: .45 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x111923, roughness: .75 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, pos: [number, number, number], scale?: [number, number, number]) => {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...pos);
      if (scale) object.scale.set(...scale);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };

    // A more natural silhouette with tapered torso, shoulders, pelvis and articulated joints.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.43, .94, 10, 20), suit);
    torso.scale.set(.92, 1.08, .72); torso.position.y = .02; torso.castShadow = true; this.player.add(torso);
    add(new THREE.SphereGeometry(.43, 24, 18), fabric, this.player, [0, -.63, .015], [1.02, .65, .76]);
    add(new THREE.CylinderGeometry(.13, .17, .25, 18), skin, this.player, [0, .82, 0]);
    add(new THREE.SphereGeometry(.3, 32, 24), skin, this.player, [0, 1.12, .02], [.92, 1.14, .9]);
    const hairCap = add(new THREE.SphereGeometry(.305, 24, 14, 0, Math.PI * 2, 0, Math.PI * .55), hair, this.player, [0, 1.22, -.025]);
    hairCap.rotation.x = -.08;
    add(new THREE.BoxGeometry(.46, .32, .14), gold, this.player, [0, .36, .36]);
    add(new THREE.BoxGeometry(.1, .38, .1), gold, this.player, [0, -.18, .42]);
    add(new THREE.BoxGeometry(.5, .62, .28), fabric, this.player, [0, .04, -.43]);
    add(new THREE.BoxGeometry(.54, .1, .3), gold, this.player, [0, .28, -.43]);

    this.leftArm.position.set(-.42, .48, 0);
    this.rightArm.position.set(.42, .48, 0);
    this.player.add(this.leftArm, this.rightArm);
    for (const [pivot, sign] of [[this.leftArm, -1], [this.rightArm, 1]] as const) {
      add(new THREE.SphereGeometry(.19, 18, 14), fabric, pivot, [0, 0, 0]);
      const upper = add(new THREE.CapsuleGeometry(.145, .56, 8, 14), suit, pivot, [sign * .32, -.16, 0]);
      upper.rotation.z = sign * -.2;
      const elbow = add(new THREE.SphereGeometry(.13, 14, 12), fabric, pivot, [sign * .62, -.2, .015]);
      const forearm = add(new THREE.CapsuleGeometry(.12, .48, 8, 14), fabric, pivot, [sign * .78, -.31, .02]);
      forearm.rotation.z = sign * -.1;
      add(new THREE.SphereGeometry(.13, 16, 12), skin, pivot, [sign * 1.05, -.37, .03]);
    }

    this.leftLeg.position.set(-.22, -.72, 0);
    this.rightLeg.position.set(.22, -.72, 0);
    this.player.add(this.leftLeg, this.rightLeg);
    for (const [pivot, sign] of [[this.leftLeg, -1], [this.rightLeg, 1]] as const) {
      const thigh = add(new THREE.CapsuleGeometry(.18, .64, 8, 14), suit, pivot, [sign * .06, -.39, 0]);
      const knee = add(new THREE.SphereGeometry(.16, 16, 12), fabric, pivot, [sign * .08, -.79, .015]);
      add(new THREE.CapsuleGeometry(.135, .62, 8, 14), fabric, pivot, [sign * .1, -1.15, .02]);
      add(new THREE.BoxGeometry(.29, .17, .45), boot, pivot, [sign * .1, -1.5, .12]);
    }
    this.player.scale.setScalar(1.48);
    this.player.rotation.x = -.12;\n    this.player.rotation.y = Math.PI;
  }

  private loadWorld(index: number) {
    this.clearGroup(this.worldGroup);
    this.worldChunks = [];
    this.worldChunks.push(createWorld(this.scene, index, 0));
    this.worldChunks.push(createWorld(this.scene, index, -150));
    this.worldChunks.forEach(chunk => this.worldGroup.add(chunk));
    this.targetSky.setHex(WORLDS[index].sky);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(WORLDS[index].fog);
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
    }
  }

  private bindControls() {
    window.addEventListener("keydown", event => {
      this.keys.add(event.code);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) event.preventDefault();
    });
    window.addEventListener("keyup", event => this.keys.delete(event.code));
    this.canvas.addEventListener("pointermove", event => {
      if (this.mode === "play" && this.running && !this.paused) this.targetX = THREE.MathUtils.clamp((event.clientX / innerWidth * 2 - 1) * 5.2, -5.2, 5.2);
    });
    this.canvas.addEventListener("touchmove", event => {
      if (this.mode === "play" && this.running && !this.paused) this.targetX = THREE.MathUtils.clamp((event.touches[0].clientX / innerWidth * 2 - 1) * 5.2, -5.2, 5.2);
    }, { passive: true });
  }

  start(mode: GameMode) {
    this.mode = mode; this.running = true; this.paused = false;
    this.clock.start();
    if (this.soundEnabled) this.startAudio();
    this.animate();
  }
  pause() { this.paused = true; }
  togglePause() {
    if (!this.running) return false;
    this.paused = !this.paused;
    if (!this.paused) { this.clock.start(); this.animate(); }
    return this.paused;
  }
  isRunning() { return this.running; }
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled) void this.audio?.suspend();
    else if (this.running) this.startAudio();
    return this.soundEnabled;
  }
  private startAudio() {
    try { if (!this.audio) this.audio = new AudioContext(); if (this.audio.state === "suspended") void this.audio.resume(); }
    catch { /* Audio is optional. */ }
  }
  private animate = () => {
    if (!this.running || this.paused || this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), .04);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private update(delta: number) {
    const elapsed = this.clock.elapsedTime;
    const speed = this.mode === "watch" ? 1 : 1.08;
    if (this.mode === "play") {
      if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) this.targetX -= delta * 8;
      if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) this.targetX += delta * 8;
      this.targetX = THREE.MathUtils.clamp(this.targetX, -5.2, 5.2);
    } else this.targetX = Math.sin(elapsed * .42) * 2.5;

    this.playerX = THREE.MathUtils.damp(this.playerX, this.targetX, 4, delta);
    this.player.position.x = this.playerX;
    this.player.position.y = Math.sin(elapsed * 2.8) * .13;
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -this.playerX * .04, 3, delta);
    this.player.rotation.y = Math.PI + Math.sin(elapsed * 1.1) * .045;
    this.player.rotation.x = -.1 + Math.sin(elapsed * 2.1) * .045;
    this.leftArm.rotation.z = -.24 + Math.sin(elapsed * 2.4) * .1;
    this.rightArm.rotation.z = .24 - Math.sin(elapsed * 2.4) * .1;
    this.leftArm.rotation.x = Math.sin(elapsed * 1.8) * .08;
    this.rightArm.rotation.x = -Math.sin(elapsed * 1.8) * .08;
    this.leftLeg.rotation.x = .18 + Math.sin(elapsed * 2.2) * .12;
    this.rightLeg.rotation.x = -.12 - Math.sin(elapsed * 2.2) * .1;

    this.worldProgress = (this.worldProgress + delta * .12 * speed) % 1;
    this.distance += delta * 92 * speed;
    this.score += Math.floor(delta * 12);
    this.worldGroup.position.y += delta * 18 * speed;

    // Recycle the two scenery chunks before they leave the camera view.
    for (const chunk of this.worldChunks) {
      if (chunk.position.y + this.worldGroup.position.y > 62) chunk.position.y -= 300;
    }

    const orbit = this.mode === "watch" ? Math.sin(elapsed * .2) * 1.1 : Math.sin(elapsed * .18) * .22;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.playerX * .3 + orbit, 1.5, delta);
    this.camera.position.y = 5.8 + Math.sin(elapsed * 1.4) * .28;
    this.camera.position.z = 13.5 + Math.sin(elapsed * .55) * .45;
    this.camera.lookAt(this.player.position.x * .25, -9, -34);

    // No eras or portal transitions: this is one continuous freefall scene.\n\n    const background = this.scene.background as THREE.Color;
    background.lerp(this.targetSky, delta * 1.2);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.lerp(new THREE.Color(WORLDS[this.worldIndex].fog), delta * 1.2);
    this.renderer.toneMappingExposure = 1.28 + this.flash * .55;
    const state: GameState = {
      worldName: WORLDS[this.worldIndex].name, worldIndex: this.worldIndex,
      score: this.score, distance: this.distance, worldProgress: this.worldProgress,
      transitioning: false, nextWorldName: ""
    };
    this.callbacks.forEach(callback => callback(state));
  }

  onUpdate(callback: (state: GameState) => void) { this.callbacks.push(callback); }
  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  };
  dispose() {
    this.disposed = true; this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    this.clearGroup(this.worldGroup);
    this.renderer.dispose();
    void this.audio?.close();
  }
}
