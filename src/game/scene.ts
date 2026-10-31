import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const cinematicShader = {
  uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1,1) }, blur: { value: 0 }, vignette: { value: .32 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float blur; uniform float vignette; varying vec2 vUv;
    void main(){vec2 d=vec2(blur/resolution.x,0.0);vec4 c=texture2D(tDiffuse,vUv)*.4;c+=texture2D(tDiffuse,vUv+d)*.2;c+=texture2D(tDiffuse,vUv-d)*.2;c+=texture2D(tDiffuse,vUv+d*2.0)*.1;c+=texture2D(tDiffuse,vUv-d*2.0)*.1;
    float vig=smoothstep(1.15,.22,length((vUv-.5)*vec2(1.0,.82)));c.rgb*=mix(1.0,vig,vignette);gl_FragColor=c;}`
};

function makeGradientSky() {
  const geometry=new THREE.SphereGeometry(520,32,16);
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:`varying vec3 vWorld; void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`varying vec3 vWorld; void main(){float h=normalize(vWorld).y;vec3 horizon=vec3(.88,.79,.68);vec3 zenith=vec3(.16,.34,.52);vec3 c=mix(horizon,zenith,smoothstep(-.12,.75,h));float sun=pow(max(dot(normalize(vWorld),normalize(vec3(-.5,.55,-.7))),0.0),90.0);c+=vec3(1.0,.72,.42)*sun*.8;gl_FragColor=vec4(c,1.0);}`});
  return new THREE.Mesh(geometry,material);
}

function makeTerrainTexture() {
  const c=document.createElement("canvas");c.width=512;c.height=512;
  const ctx=c.getContext("2d")!;ctx.fillStyle="#536d50";ctx.fillRect(0,0,512,512);
  for(let i=0;i<18000;i++){const x=Math.random()*512,y=Math.random()*512,r=Math.random()*3+.4;ctx.fillStyle=Math.random()>.5?"rgba(22,48,34,.18)":"rgba(202,184,132,.13)";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,5);return t;
}

function terrainChunk(z:number,seed:number) {
  const n=96,size=240,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const height=(x:number,y:number)=>Math.sin(x*.035+seed)*3.4+Math.cos(y*.028-seed)*4.5+Math.sin((x+y)*.018)*5+Math.sin(x*.11)*Math.cos(y*.08)*1.5;
  for(let iy=0;iy<=n;iy++)for(let ix=0;ix<=n;ix++){const x=(ix/n-.5)*size,y=(iy/n-.5)*size;positions.push(x,height(x,y),y);uv.push(ix/n*5,iy/n*5);}
  for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){const a=iy*(n+1)+ix,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const m=new THREE.MeshStandardMaterial({map:makeTerrainTexture(),roughness:.96,metalness:0});const mesh=new THREE.Mesh(g,m);mesh.position.set(0,-100,z);mesh.receiveShadow=true;return mesh;
}

export class GameScene {
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,1800);
  renderer:THREE.WebGLRenderer;
  composer:EffectComposer;
  cinematic:ShaderPass;
  bloom:UnrealBloomPass;
  sky:THREE.Mesh;
  terrain:THREE.Group=new THREE.Group();
  cloudGroup:THREE.Group=new THREE.Group();
  rings:THREE.Group=new THREE.Group();
  sun:THREE.DirectionalLight;
  private hdrReady=false;
  constructor(private canvas:HTMLCanvasElement) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene.background=new THREE.Color(0x91b8d2);this.sky=makeGradientSky();this.scene.add(this.sky);
    this.scene.fog=new THREE.FogExp2(0x9db6c7,.0019);
    this.scene.add(new THREE.HemisphereLight(0xe5f2ff,0x425247,1.55));
    this.sun=new THREE.DirectionalLight(0xffd8ae,3.4);this.sun.position.set(-160,220,100);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-180;this.sun.shadow.camera.right=180;this.sun.shadow.camera.top=180;this.sun.shadow.camera.bottom=-180;this.scene.add(this.sun);
    this.scene.add(this.terrain,this.cloudGroup,this.rings);
    for(let i=0;i<3;i++)this.terrain.add(terrainChunk(-180-i*240,i*9+3));
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.62,.7,.82);this.composer.addPass(this.bloom);
    this.cinematic=new ShaderPass(cinematicShader);this.composer.addPass(this.cinematic);
    const fxaa=new ShaderPass(FXAAShader);fxaa.material.uniforms["resolution"].value.set(1/(innerWidth*this.renderer.getPixelRatio()),1/(innerHeight*this.renderer.getPixelRatio()));this.composer.addPass(fxaa);
    void this.loadEnvironment();
    window.addEventListener("resize",this.resize);
  }
  private async loadEnvironment(){
    try{const hdr=await new RGBELoader().loadAsync("/assets/toposcope_sunset_1k.hdr");hdr.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(this.renderer);const env=pmrem.fromEquirectangular(hdr).texture;this.scene.environment=env;hdr.dispose();pmrem.dispose();this.hdrReady=true;}
    catch{console.warn("Poly Haven HDRI missing. Gradient sky and physical lights remain active. Add public/assets/toposcope_sunset_1k.hdr.");}
  }
  get hasHDRI(){return this.hdrReady;}
  update(dt:number,speed:number,altitude:number){
    this.terrain.position.z+=dt*(16+speed*.5);
    for(const chunk of [...this.terrain.children])if(chunk.position.z+this.terrain.position.z>120){chunk.position.z-=720;}
    this.cloudGroup.position.z+=dt*(30+speed*.9);
    for(const cloud of this.cloudGroup.children)if(cloud.position.z+this.cloudGroup.position.z>45)cloud.position.z-=280;
    const density=THREE.MathUtils.lerp(.0011,.0045,1-altitude/12000);
    (this.scene.fog as THREE.FogExp2).density=density;
    this.cinematic.uniforms["blur"].value=THREE.MathUtils.clamp(speed*.00012,0,.8);
    this.bloom.strength=.48+speed*.001;
  }
  render(){this.composer.render();}
  private resize=()=>{const w=innerWidth,h=innerHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.composer.setSize(w,h);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.cinematic.uniforms["resolution"].value.set(w,h);};
  dispose(){window.removeEventListener("resize",this.resize);this.composer.dispose();this.renderer.dispose();}
}
