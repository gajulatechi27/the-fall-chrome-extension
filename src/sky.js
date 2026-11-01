import * as THREE from "three";

export function createSky(scene, renderer, seed) {
  const skyGeo = new THREE.SphereGeometry(1800, 48, 32);
  const horizonColor = new THREE.Color(0x9fc8d9);
  const zenithColor = new THREE.Color(0x244766);
  const sunColor = new THREE.Color(0xffdfb4);
  const angle = (seed % 6283) / 1000;
  const sunDirection = new THREE.Vector3(Math.cos(angle) * 0.45, 0.62, Math.sin(angle) * 0.45).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection },
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
        c += sunColor * (pow(sunDot, 18.0) * 0.32 + pow(sunDot, 420.0) * 2.1);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x536d69, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3c2, 2.3);
  sun.position.copy(sunDirection).multiplyScalar(420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  scene.add(sun);
  return {
    horizonColor,
    update() {},
    dispose() {
      scene.remove(sky, hemi, sun);
      skyGeo.dispose();
      skyMat.dispose();
    }
  };
}
