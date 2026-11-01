import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export function createSky(scene, renderer, seed, environment = null) {
  const skyGeo = new THREE.SphereGeometry(1800, 48, 32);
  const horizonColor = new THREE.Color(environment?.sky?.horizon || 0x9fc8d9);
  const zenithColor = new THREE.Color(environment?.sky?.zenith || 0x244766);
  const sunColor = new THREE.Color(environment?.sky?.sun || 0xffdfb4);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(-0.5, 0.55, -0.7) },
      horizon: { value: horizonColor },
      zenith: { value: zenithColor },
      sunColor: { value: sunColor }
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 sunDirection, horizon, zenith, sunColor;
      void main() {
        float h = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, smoothstep(0.18, 0.9, h));
        float sunDot = max(dot(normalize(vDirection), normalize(sunDirection)), 0.0);
        float glow = pow(sunDot, 18.0);
        float disk = pow(sunDot, 420.0);
        c += sunColor * (glow * 0.32 + disk * 2.1);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x536d69, 1.55);
  scene.add(hemi);

  const angle = (seed % 6283) / 1000;
  const sun = new THREE.DirectionalLight(0xffe3c2, environment?.sun?.intensity ?? 2.5);
  sun.position.set(...(environment?.sun?.position || [Math.cos(angle) * 260, 180 + (seed % 80), Math.sin(angle) * 260]));
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  scene.add(sun);

  let environmentTexture;
  const loader = new RGBELoader();
  loader.load(
    "/assets/toposcope_sunset_1k.hdr",
    hdr => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      environmentTexture = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = environmentTexture;
      hdr.dispose();
      pmrem.dispose();
    },
    undefined,
    () => {
      const message = "/assets/toposcope_sunset_1k.hdr (optional HDRI)";
      window.__fallAssetFailures ||= [];
      window.__fallAssetFailures.push(message);
      console.warn("Optional local HDRI failed; procedural sky fallback remains active:", message);
    }
  );

  return {
    horizonColor,
    zenithColor,
    sunColor,
    update(camera) {
      if (camera) sky.position.copy(camera.position);
    },
    dispose() {
      scene.remove(sky, hemi, sun);
      skyGeo.dispose();
      skyMat.dispose();
      environmentTexture?.dispose();
      if (scene.environment === environmentTexture) scene.environment = null;
    }
  };
}
