import * as THREE from "three";
import {createSky} from "./sky.js";
import {CloudField} from "./clouds.js";
import {Terrain} from "./terrain.js";
import {SkydiverPlaceholder} from "./player.js";
import "./style.css";
const canvas=document.querySelector("#world"),fade=document.querySelector("#fade"),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
const quality=Math.min(devicePixelRatio,2);renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,7000);camera.position.set(0,5,18);
let sky,clouds,terrain,player,seed=0,time=0,altitude=32000,speed=90,running=false,paused=false,frame=0,clock=new THREE.Clock(),descentNumber=0;
const biomes=["mountains","desert","islands","forest","snow"];
const randSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
async function saveDescent(){try{if(globalThis.chrome?.storage?.local)await chrome.storage.local.set({theFallLastSeed:seed,theFallDescentCount:descentNumber,theFallLastBiome:biome});}catch(e){console.info("Chrome storage unavailable in preview mode",e);}}
let biome="mountains";
function cleanup(){sky?.dispose();clouds?.dispose();terrain?.dispose();player?.dispose();scene.clear();}
async function beginDescent(){cancelAnimationFrame(frame);running=false;fade.classList.add("white");await new Promise(r=>setTimeout(r,950));cleanup();seed=randSeed();descentNumber++;biome=biomes[seed%biomes.length];time=0;altitude=32000;speed=90;
const timeOfDay=(seed%3),weather=(seed%4);const skyColors=[0xc4d1d9,0xe6c5a1,0x71879a];scene.background=new THREE.Color(skyColors[timeOfDay]);scene.fog=new THREE.FogExp2(skyColors[timeOfDay],.000035+weather*.000009);
sky=createSky(scene,renderer,seed);terrain=new Terrain(scene,seed,biome);clouds=new CloudField(scene,seed);player=new SkydiverPlaceholder(scene);await saveDescent();running=true;paused=false;clock.start();fade.classList.remove("white");animate();}
function animate(){if(!running||paused||document.hidden)return;frame=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.033);time+=dt;const progress=1-altitude/32000;const target=altitude<450?24:altitude<3500?110:altitude<11000?103:90;speed=THREE.MathUtils.damp(speed,target,1.15,dt);altitude=Math.max(0,altitude-speed*dt*3.6);player.update(dt,time);clouds.update(dt,speed);terrain.update(dt,speed,altitude);camera.fov=THREE.MathUtils.damp(camera.fov,64+Math.min(15,speed*.08),1.5,dt);camera.updateProjectionMatrix();const shake=Math.min(.08,speed*.0005);camera.position.set(Math.sin(time*17)*shake,5+Math.sin(time*11)*shake,18);camera.lookAt(player.root.position.x*.15,-7,-38);scene.fog.density=THREE.MathUtils.lerp(.000035,.0015,THREE.MathUtils.smoothstep(progress,.35,.96));renderer.render(scene,camera);if(altitude<=0){running=false;fade.classList.add("white");window.setTimeout(beginDescent,1800);}}
document.addEventListener("visibilitychange",()=>{if(document.hidden){paused=true;cancelAnimationFrame(frame);}else if(running){paused=false;clock.start();animate();}});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.addEventListener("error",e=>console.error("THE FALL error",e.error||e.message));
beginDescent();
