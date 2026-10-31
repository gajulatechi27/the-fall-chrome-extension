import * as THREE from "three";
import {createSky} from "./sky.js";
import {CloudField} from "./clouds.js";
import {Terrain} from "./terrain.js";
import {Skydiver} from "./player.js";
import {CinematicEffects} from "./effects.js";
import "./style.css";

const canvas=document.querySelector("#world"),fade=document.querySelector("#fade");
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance"});
const quality=Math.min(devicePixelRatio,matchMedia("(max-width:700px)").matches?1:1.5);
renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,6000);
camera.position.set(0,5,18);
let sky,clouds,terrain,player,effects,seed=0,time=0,altitude=32000,speed=95,running=false,paused=false,frame=0,clock=new THREE.Clock();

const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
function dispose(){sky?.dispose();clouds?.dispose();terrain?.dispose();player?.dispose();effects?.dispose();scene.clear();effects=undefined;}
async function descent(){
 cancelAnimationFrame(frame);running=false;fade.classList.remove("out");fade.classList.add("in");
 await new Promise(resolve=>setTimeout(resolve,850));
 try{
  dispose();seed=randomSeed();time=0;altitude=32000;speed=95;
  scene.background=new THREE.Color(0x9fb9ca);scene.fog=new THREE.FogExp2(0x9fb9ca,.00004);
  sky=createSky(scene,renderer,seed);terrain=new Terrain(scene,seed);clouds=new CloudField(scene,seed^0x4a21);player=new Skydiver(scene);
  try{effects=new CinematicEffects(renderer,scene,camera);}catch(error){console.warn("Postprocessing unavailable; using direct WebGL rendering.",error);effects=undefined;}
  try{await player.load();}catch(error){console.error("Skydiver GLB missing or invalid. Add public/assets/skydiver-freefall.glb. Environment will still render.",error);}
  running=true;paused=false;clock.start();fade.classList.remove("in");animate();
 }catch(error){console.error("THE FALL scene startup failed:",error);fade.classList.remove("in");renderer.setClearColor(0x9fb9ca);renderer.render(scene,camera);}
}
function animate(){
 if(!running||paused||document.hidden)return;
 frame=requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.033);time+=dt;
 const progress=1-altitude/32000,target=altitude<500?26:altitude<4000?112:altitude<12000?104:95;
 speed=THREE.MathUtils.damp(speed,target,1.3,dt);altitude=Math.max(0,altitude-speed*dt*3.6);
 player?.update(dt,time);clouds?.update(dt,speed);terrain?.update(dt,speed);
 camera.fov=THREE.MathUtils.damp(camera.fov,64+Math.min(16,speed*.09),1.6,dt);camera.updateProjectionMatrix();
 const shake=Math.min(.12,speed*.0008);camera.position.set(Math.sin(time*19)*shake,5+Math.sin(time*13)*shake,18);camera.lookAt(player?.root.position.x*.15||0,-7,-38);
 if(scene.fog instanceof THREE.FogExp2)scene.fog.density=THREE.MathUtils.lerp(.00004,.0018,THREE.MathUtils.smoothstep(progress,.38,.96));
 try{effects?.update(dt,speed);if(effects)effects.render(dt);else renderer.render(scene,camera);}catch(error){console.warn("Postprocessing failed; switched to direct renderer.",error);effects?.dispose();effects=undefined;renderer.render(scene,camera);}
 if(altitude<=0){running=false;fade.classList.add("out");window.setTimeout(descent,1800);}
}
document.addEventListener("visibilitychange",()=>{if(document.hidden){paused=true;cancelAnimationFrame(frame);}else if(running){paused=false;clock.start();animate();}});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);effects?.resize();});
window.addEventListener("error",event=>console.error("THE FALL runtime error:",event.error||event.message));
window.addEventListener("unhandledrejection",event=>console.error("THE FALL async error:",event.reason));
descent();
