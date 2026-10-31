import * as THREE from "three";
import { createWorld, WORLDS } from "./worlds";

type GameMode = "play" | "watch";
type GameState = { worldName: string; worldIndex: number; score: number; distance: number; worldProgress: number; transitioning: boolean; nextWorldName: string };

export class FallGame {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 700);
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private player = new THREE.Group();
  private worldGroup = new THREE.Group();
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
    this.scene.fog = new THREE.Fog(WORLDS[0].fog, 55, 280);
    this.camera.position.set(0, 4.5, 19);
    this.camera.lookAt(0, 0, -9);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x344039, 1.8));
    const sun = new THREE.DirectionalLight(0xffdfb0, 3.1);
    sun.position.set(-32, 55, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    this.scene.add(sun);
    const rim = new THREE.PointLight(0x83c8ff, 85, 65);
    rim.position.set(0, 5, -10);
    this.scene.add(rim);

    this.createPlayer();
    this.scene.add(this.player);
    const portalMaterial = new THREE.MeshBasicMaterial({ color: 0xa5f5ed, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.portal = new THREE.Mesh(new THREE.TorusGeometry(10.5, .34, 16, 100), portalMaterial);
    this.portal.position.set(0, -52, -48);
    this.scene.add(this.portal);
    this.portalCore = new THREE.Mesh(new THREE.CircleGeometry(9.9, 64), new THREE.MeshBasicMaterial({ color: 0x7cdedb, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.portalCore.position.set(0, -52, -48.1);
    this.scene.add(this.portalCore);
    this.scene.add(this.worldGroup);
    this.loadWorld(0);
    this.bindControls();
    window.addEventListener("resize", this.onResize);
    this.renderer.render(this.scene, this.camera);
  }

  private createPlayer() {
    const suit = new THREE.MeshStandardMaterial({ color: 0x182535, roughness: .48, metalness: .18 });
    const suitLight = new THREE.MeshStandardMaterial({ color: 0x34485d, roughness: .5, metalness: .16 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb9785b, roughness: .88 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xcaa568, roughness: .35, metalness: .55 });
    const boot = new THREE.MeshStandardMaterial({ color: 0x111923, roughness: .7 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, pos: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // More human proportions: neck, tapered torso, pelvis, articulated limbs and boots.
    add(new THREE.CapsuleGeometry(.48, .92, 8, 16), suit, this.player, [0, .05, 0], [1, 1.05, .72]);
    add(new THREE.SphereGeometry(.48, 24, 18), suitLight, this.player, [0, -.66, .02], [1.05, .72, .72]);
    add(new THREE.CylinderGeometry(.16, .19, .25, 16), skin, this.player, [0, .82, 0]);
    add(new THREE.SphereGeometry(.31, 28, 22), skin, this.player, [0, 1.13, .02], [1, 1.12, .94]);
    add(new THREE.SphereGeometry(.08, 12, 10), skin, this.player, [-.3, 1.12, .02]);
    add(new THREE.SphereGeometry(.08, 12, 10), skin, this.player, [.3, 1.12, .02]);
    add(new THREE.BoxGeometry(.48, .34, .16), gold, this.player, [0, .38, .39]);
    add(new THREE.BoxGeometry(.12, .42, .12), gold, this.player, [0, -.2, .43]);
    add(new THREE.BoxGeometry(.48, .62, .3), suitLight, this.player, [0, .06, -.48]);
    add(new THREE.BoxGeometry(.56, .12, .34), gold, this.player, [0, .27, -.48]);

    this.leftArm.position.set(-.48, .48, 0);
    this.rightArm.position.set(.48, .48, 0);
    this.player.add(this.leftArm, this.rightArm);
    for (const [pivot, sign] of [[this.leftArm, -1], [this.rightArm, 1]] as const) {
      add(new THREE.SphereGeometry(.2, 16, 12), suitLight, pivot, [0, 0, 0]);
      const upper = add(new THREE.CapsuleGeometry(.15, .55, 6, 12), suit, pivot, [sign * .35, -.12, 0]);
      upper.rotation.z = sign * -.18;
      const forearm = add(new THREE.CapsuleGeometry(.125, .48, 6, 12), suitLight, pivot, [sign * .68, -.22, .02]);
      forearm.rotation.z = sign * -.1;
      add(new THREE.SphereGeometry(.14, 14, 12), boot, pivot, [sign * 1.0, -.27, .02]);
    }

    this.leftLeg.position.set(-.24, -.78, 0);
    this.rightLeg.position.set(.24, -.78, 0);
    this.player.add(this.leftLeg, this.rightLeg);
    for (const [pivot, sign] of [[this.leftLeg, -1], [this.rightLeg, 1]] as const) {
      add(new THREE.CapsuleGeometry(.19, .68, 7, 12), suit, pivot, [sign * .08, -.43, 0]);
      add(new THREE.CapsuleGeometry(.145, .62, 7, 12), suitLight, pivot, [sign * .12, -1.08, .02]);
      add(new THREE.BoxGeometry(.3, .18, .48), boot, pivot, [sign * .12, -1.48, .12]);
    }
    this.player.scale.setScalar(.92);
    this.player.rotation.x = -.12;
  }

  private loadWorld(index: number) {
    this.clearGroup(this.worldGroup);
    this.worldGroup.add(createWorld(this.scene, index));
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
    this.player.rotation.y = Math.sin(elapsed * 1.1) * .08;
    this.player.rotation.x = -.12 + Math.sin(elapsed * 2.1) * .045;
    this.leftArm.rotation.z = -.25 + Math.sin(elapsed * 2.4) * .09;
    this.rightArm.rotation.z = .25 - Math.sin(elapsed * 2.4) * .09;
    this.leftArm.rotation.x = Math.sin(elapsed * 1.8) * .08;
    this.rightArm.rotation.x = -Math.sin(elapsed * 1.8) * .08;
    this.leftLeg.rotation.x = .18 + Math.sin(elapsed * 2.2) * .12;
    this.rightLeg.rotation.x = -.12 - Math.sin(elapsed * 2.2) * .1;

    this.worldProgress += delta * .12 * speed;
    this.distance += delta * 92 * speed;
    this.score += Math.floor(delta * 12);
    this.worldGroup.position.y += delta * 18 * speed;

    const orbit = this.mode === "watch" ? Math.sin(elapsed * .2) * 1.1 : Math.sin(elapsed * .18) * .22;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.playerX * .3 + orbit, 1.5, delta);
    this.camera.position.y = 4.4 + Math.sin(elapsed * 1.4) * .22;
    this.camera.position.z = 18.5 + Math.sin(elapsed * .55) * .65;
    this.camera.lookAt(this.player.position.x * .3, -.8, -13);

    const approach = THREE.MathUtils.smoothstep(this.worldProgress, .68, .96);
    (this.portal.material as THREE.MeshBasicMaterial).opacity = approach * .88;
    (this.portalCore.material as THREE.MeshBasicMaterial).opacity = approach * .13;
    this.portal.rotation.z += delta * .42;
    this.portalCore.rotation.z -= delta * .18;
    const pulse = .92 + Math.sin(elapsed * 2.8) * .045;
    this.portal.scale.setScalar(pulse);
    this.portalCore.scale.setScalar(pulse);

    if (this.worldProgress >= .94 && !this.transitionActive) {
      this.transitionActive = true;
      this.transitionTimer = 1.05;
      this.flash = 1;
    }
    if (this.transitionActive) {
      this.transitionTimer -= delta;
      this.flash = Math.max(0, this.flash - delta * 1.65);
      if (this.transitionTimer <= 0) {
        this.worldIndex = (this.worldIndex + 1) % WORLDS.length;
        this.worldProgress = 0;
        this.worldGroup.position.y = 0;
        this.portal.position.y = -52;
        this.portalCore.position.y = -52;
        this.loadWorld(this.worldIndex);
        this.transitionActive = false;
      }
    }

    const background = this.scene.background as THREE.Color;
    background.lerp(this.targetSky, delta * 1.2);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.lerp(new THREE.Color(WORLDS[this.worldIndex].fog), delta * 1.2);
    this.renderer.toneMappingExposure = 1.25 + this.flash * .55;
    const state: GameState = {
      worldName: WORLDS[this.worldIndex].name, worldIndex: this.worldIndex,
      score: this.score, distance: this.distance, worldProgress: this.worldProgress,
      transitioning: this.transitionActive, nextWorldName: WORLDS[(this.worldIndex + 1) % WORLDS.length].name
    };
    this.callbacks.forEach(callback => callback(state));
  }

  onUpdate(callback: (state: GameState) => void) { this.callbacks.push(callback); }
  private onResize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
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
