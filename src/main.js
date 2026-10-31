import * as THREE from "three";
import {createSky} from "./sky.js";
import {CloudField} from "./clouds.js";
import {Terrain} from "./terrain.js";
import {Skydiver} from "./player.js";
import {CinematicEffects} from "./effects.js";
import "./style.css";

const canvas=document.querySelector("#world"),fade=document.querySelector("#fade");
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance",stencil:false});
let quality=Math.min(devicePixelRatio,matchMedia("(max-width:700px)").matches?1:2);
renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,7000);
camera.position.set(0,5,18);
let sky,clouds,terrain,player,effects,seed=0,time=0,altitude=32000,speed=90,running=false,paused=false,frame=0,clock=new THREE.Clock(),descentNumber=0;
const biomes=["mountains","desert","islands","forest","snow"];
const randSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
let biome="mountains";
async function saveDescent(){try{if(globalThis.chrome?.storage?.local)await chrome.storage.local.set({theFallLastSeed:seed,theFallDescentCount:descentNumber,theFallLastBiome:biome});}catch(error){console.info("Chrome storage unavailable in preview mode",error);}}
function cleanup(){effects?.dispose();effects=undefined;sky?.dispose();clouds?.dispose();terrain?.dispose();player?.dispose();scene.clear();}
async function beginDescent(){
 cancelAnimationFrame(frame);running=false;fade.classList.add("white");await new Promise(resolve=>setTimeout(resolve,950));cleanup();
 seed=randSeed();descentNumber++;biome=biomes[seed%biomes.length];time=0;altitude=32000;speed=90;
 const timeOfDay=seed%3,weather=seed%4,skyColors=[0xc4d1d9,0xe6c5a1,0x71879a];
 scene.background=new THREE.Color(skyColors[timeOfDay]);scene.fog=new THREE.FogExp2(skyColors[timeOfDay],.000035+weather*.000009);
 sky=createSky(scene,renderer,seed);terrain=new Terrain(scene,seed,biome);clouds=new CloudField(scene,seed);
 player=new Skydiver(scene);
 try{effects=new CinematicEffects(renderer,scene,camera,quality);}catch(error){console.error("Postprocessing setup failed; using direct renderer.",error);effects=undefined;}
 const modelLoaded=await player.load();
 if(!modelLoaded)console.warn("Environment will continue without a character. Download a Mixamo rigged freefall GLB and place it at public/assets/skydiver-freefall.glb.");
 await saveDescent();running=true;paused=false;clock.start();fade.classList.remove("white");animate();
}
function animate(){
 if(!running||paused||document.hidden)return;
 frame=requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.033);time+=dt;
 const progress=1-altitude/32000,target=altitude<450?24:altitude<3500?110:altitude<11000?103:90;
 speed=THREE.MathUtils.damp(speed,target,1.15,dt);altitude=Math.max(0,altitude-speed*dt*3.6);
 player?.update(dt,time,speed);clouds?.update(dt,speed);terrain?.update(dt,speed,altitude);
 const targetFov=64+Math.min(15,speed*.08);camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,1.5,dt);camera.updateProjectionMatrix();
 const shake=Math.min(.09,speed*.00055);
 camera.position.set(Math.sin(time*17)*shake,5+Math.sin(time*11)*shake,18+Math.sin(time*8)*shake*.5);
 camera.lookAt((player?.root.position.x||0)*.15,-7,-38);
 if(scene.fog instanceof THREE.FogExp2)scene.fog.density=THREE.MathUtils.lerp(.000035,.0015,THREE.MathUtils.smoothstep(progress,.35,.96));
 try{effects?.update(dt,speed,time);if(effects)effects.render(dt);else renderer.render(scene,camera);}
 catch(error){console.error("Postprocessing render failed; switching to direct rendering.",error);effects?.dispose();effects=undefined;renderer.render(scene,camera);}
 if(altitude<=0){running=false;fade.classList.add("white");window.setTimeout(beginDescent,1800);}
}
document.addEventListener("visibilitychange",()=>{if(document.hidden){paused=true;cancelAnimationFrame(frame);}else if(running){paused=false;clock.start();animate();}});
function resize(){quality=Math.min(devicePixelRatio,matchMedia("(max-width:700px)").matches?1:2);renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();effects?.resize();}
window.addEventListener("resize",resize);window.addEventListener("orientationchange",()=>window.setTimeout(resize,180));
window.addEventListener("error",event=>console.error("THE FALL error",event.error||event.message));
beginDescent();
