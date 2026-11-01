import * as THREE from "three";

export function createSky(scene, renderer, seed, biome = "green", weather = "clear") {
  const skyGeo = new THREE.SphereGeometry(1800, 48, 32);
  const palettes = {
    himalayas:[0xa8c8df,0x315274,0xffe3c5],green:[0xf0c28a,0x315779,0xffd49b],
    delta:[0xb7d5dc,0x3c6480,0xffe0b5],lake:[0xe9b7a4,0x4b5278,0xffc5a0],
    coast:[0x9dd7e7,0x28628b,0xffe0a8],desert:[0xe9a16f,0x633d54,0xffc07a],
    forest:[0x9ebfae,0x254c4b,0xffd3a1],rainforest:[0x9eb8ad,0x294c52,0xffc89d]
  };
  const palette=palettes[biome]||palettes.green;
  const horizonColor=new THREE.Color(palette[0]);
  const zenithColor=new THREE.Color(palette[1]);
  const sunColor=new THREE.Color(palette[2]);
  if(weather==="heavy clouds"||weather==="rain"||weather==="storm"){
    horizonColor.lerp(new THREE.Color(0x718493),weather==="storm"?.72:.42);
    zenithColor.lerp(new THREE.Color(0x273747),.58);
  }
  if(weather==="mist") horizonColor.lerp(new THREE.Color(0xd3d9d4),.48);
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
  const hemi = new THREE.HemisphereLight(0xe7f3ff, biome === "desert" ? 0x82604c : 0x536d55, weather === "storm" ? .8 : 1.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor, weather === "storm" || weather === "heavy clouds" ? 1.05 : 2.8);
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
    update(camera) { if (camera) sky.position.copy(camera.position); },
    dispose() {
      scene.remove(sky, hemi, sun);
      skyGeo.dispose();
      skyMat.dispose();
    }
  };
}
