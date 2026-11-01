import * as THREE from "three";
import { createSky } from "./sky.js";
import { CloudField } from "./clouds.js";
import { Terrain } from "./terrain.js";
import { CinematicEffects } from "./effects.js";
import { WeatherSystem } from "./weather.js";
import { JourneyAudio } from "./audio.js";
import "./style.css";

const canvas=document.querySelector("#world");
const fade=document.querySelector("#fade");
const isSmall=matchMedia("(max-width:700px)").matches;
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:"high-performance",stencil:false,alpha:false,logarithmicDepthBuffer:true});
let quality=Math.min(devicePixelRatio,2);
renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,1.5,30000);
const sceneTypes=[
 {id:"himalayas",param:"himalaya",name:"Himalayan Peaks & Glaciers"},
 {id:"green",param:"hills",name:"Green Hills & Terraced Valleys"},
 {id:"delta",param:"river",name:"Winding River & Farmland"},
 {id:"lake",param:"lake",name:"Alpine Lake & Mountains"},
 {id:"coast",param:"coast",name:"Coast, Beaches & Islands"},
 {id:"desert",param:"desert",name:"Desert Dunes & Red Canyons"},
 {id:"forest",param:"forest",name:"Dense Forest & Waterfall"},
 {id:"rainforest",param:"rainforest",name:"Misty Rainforest Valley"}
];
const weatherTypes=["clear","scattered clouds","overcast","mist","light rain","heavy rain","storm","dust haze","golden dusk"];
const phases=[
 {id:"FREEFALL",duration:7},
 {id:"STORM LAYER",duration:7},
 {id:"BREAKTHROUGH",duration:4},
 {id:"TRAVELLER FLIGHT",duration:32},
 {id:"TRANSITION",duration:5}
];
const phaseDuration=phases.reduce((n,p)=>n+p.duration,0);
const params=new URLSearchParams(location.search);
const sceneAliases={himalaya:"himalayas",hills:"green",river:"delta"};
const phaseAliases={"freefall":"FREEFALL","storm":"STORM LAYER","storm-layer":"STORM LAYER","storm layer":"STORM LAYER","breakthrough":"BREAKTHROUGH","flight":"TRAVELLER FLIGHT","traveller":"TRAVELLER FLIGHT","traveller flight":"TRAVELLER FLIGHT","transition":"TRANSITION"};
const testMode=["scene","biome","seed","time","weather","freeze","speed","phase"].some(k=>params.has(k));
const testSettings={
 scene:params.get("biome")||params.get("scene")||"hills",
 seed:Number.isFinite(Number(params.get("seed")))?Number(params.get("seed")):Math.floor(Math.random()*0x7fffffff),
 time:["dawn","noon","sunset","night"].includes(params.get("time"))?params.get("time"):"noon",
 weather:weatherTypes.includes(params.get("weather"))?params.get("weather"):params.get("weather")==="clouds"?"scattered clouds":"clear",
 freeze:params.get("freeze")==="1",
 speed:params.has("speed")&&Number.isFinite(Number(params.get("speed")))?Math.max(0,Number(params.get("speed"))):null,
 phase:phaseAliases[(params.get("phase")||"").toLowerCase()]||(params.has("scene")||params.has("biome")?"TRAVELLER FLIGHT":"FREEFALL")
};
const label=document.createElement("div");label.id="scene-label";document.body.appendChild(label);
const debug=document.createElement("pre");debug.id="fall-debug";debug.style.cssText="display:none;position:fixed;z-index:30;left:12px;top:12px;margin:0;padding:12px 14px;max-width:min(520px,calc(100vw - 24px));background:rgba(3,12,20,.84);color:#d8f3ff;border:1px solid rgba(180,220,240,.35);border-radius:8px;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";document.body.appendChild(debug);
const muteButton=document.createElement("button");muteButton.id="fall-mute";muteButton.type="button";muteButton.textContent="SOUND: OFF";muteButton.setAttribute("aria-label","Enable or mute THE FALL audio");document.body.appendChild(muteButton);
const whiteout=document.createElement("div");whiteout.id="weather-whiteout";document.body.appendChild(whiteout);

let sky,clouds,terrain,effects,weatherSystem;
const audio=new JourneyAudio();
let seed=testSettings.seed,activeScene=sceneTypes[0],weather=testSettings.weather,timeOfDay=testSettings.time;
let phaseIndex=0,phaseElapsed=0,journeyElapsed=0,phaseTimeLeft=7,phaseName="FREEFALL";
let speed=0,altitude=5000,pitchDegrees=-60,windSpeed=0,fps=0,fpsFrames=0,fpsElapsed=0,eyeHeight=3,pathCurvature=0,horizonVisible=false;
let running=false,paused=false,frame=0,verticalVelocity=0,worldDistance=0,terrainHeightUnder=0,cameraClearance=0,groundWarning="",adaptiveScale=1,qualityCheckElapsed=0;
let previousBiome="",previousWeather="",transitionTriggered=false,phaseForced=testMode?testSettings.phase:null;
let debugVisible=false,devPanel=null,lastFrameTime=performance.now(),lightningWasActive=false;
const sceneRandom=(s)=>{let v=s>>>0;return()=>((v=Math.imul(v,1664525)+1013904223>>>0)/4294967296);};
function chooseDifferent(list,previous){const choices=list.filter(x=>x!==previous);return choices[Math.floor(Math.random()*choices.length)];}
function randomScene(){const id=chooseDifferent(sceneTypes.map(x=>x.id),previousBiome);return sceneTypes.find(x=>x.id===id);}
function randomWeather(){return chooseDifferent(weatherTypes,previousWeather);}
function randomTime(nextWeather=null){return nextWeather==="golden dusk"?"sunset":["dawn","noon","sunset","night"][Math.floor(Math.random()*4)];}
function normalizeWeather(w){return w==="scattered clouds"?"light clouds":w==="overcast"?"heavy clouds":w==="heavy rain"?"storm":w==="dust haze"?"mist":w==="golden dusk"?"clear":w;}
function disposeScene(){
 try{effects?.dispose();}catch(e){console.warn("effects dispose",e);}effects=undefined;
 try{sky?.dispose();}catch(e){}sky=undefined;
 try{clouds?.dispose();}catch(e){}clouds=undefined;
 try{weatherSystem?.dispose();}catch(e){}weatherSystem=undefined;
 try{terrain?.dispose();}catch(e){}terrain=undefined;
 scene.clear();
}
function weatherForBiome(biome, requested){
 if(biome==="rainforest")return "heavy rain";
 if(biome==="desert")return "dust haze";
 if(biome==="himalayas")return requested==="overcast"?"clear":requested;
 return requested;
}
function createScene(nextScene,nextSeed,nextWeather,nextTime){
 activeScene=nextScene;seed=nextSeed;weather=weatherForBiome(activeScene.id,nextWeather);timeOfDay=nextTime;
 previousBiome=activeScene.id;previousWeather=weather;
 sky=createSky(scene,renderer,seed,activeScene.id,normalizeWeather(weather),timeOfDay);
 scene.background=sky.horizonColor.clone();
 const fogColor=activeScene.id==="himalayas"?new THREE.Color(0xc8dce7):activeScene.id==="desert"?new THREE.Color(0xf2c9a5):sky.horizonColor.clone();
 const fogDensity=activeScene.id==="himalayas"?.000075:activeScene.id==="desert"?.000045:weather==="mist"?.000052:weather==="storm"||weather==="heavy rain"?.000044:.000027;
 scene.fog=new THREE.FogExp2(fogColor,fogDensity);
 terrain=new Terrain(scene,seed,activeScene.id);
 const ground=Math.max(terrain.getHeightAt(camera.position.x,camera.position.z),terrain.getWaterLevel());
 camera.position.y=ground+(testMode&&(params.has("scene")||params.has("biome"))?(activeScene.id==="himalayas"?145:110):500);
 clouds=new CloudField(scene,seed,normalizeWeather(weather));
 weatherSystem=new WeatherSystem(scene,seed,weather,quality);
 try{effects=new CinematicEffects(renderer,scene,camera,quality,"clear");}catch(e){console.warn("Post effects unavailable",e);effects=undefined;}
 label.textContent=activeScene.name;label.classList.add("visible");
}
function phaseFor(index){return phases[index]||phases[0];}
function setPhase(index){phaseIndex=(index+phases.length)%phases.length;phaseElapsed=0;phaseName=phaseFor(phaseIndex).id;phaseTimeLeft=phaseFor(phaseIndex).duration;}
function getPhaseMotion(dt){
 const p=phaseName,t=phaseElapsed,d=phaseFor(phaseIndex).duration;
 const f=THREE.MathUtils.clamp(t/d,0,1);
 if(p==="FREEFALL")return{speed:THREE.MathUtils.lerp(200,155,f),clearance:THREE.MathUtils.lerp(500,220,f),pitch:THREE.MathUtils.lerp(-60,-55,f),fov:THREE.MathUtils.lerp(82,85,f)};
 if(p==="STORM LAYER")return{speed:THREE.MathUtils.lerp(155,125,f),clearance:THREE.MathUtils.lerp(220,115,f),pitch:-60,fov:84};
 if(p==="BREAKTHROUGH")return{speed:THREE.MathUtils.lerp(125,90,f),clearance:THREE.MathUtils.lerp(115,55,f),pitch:THREE.MathUtils.lerp(-60,-20,f),fov:THREE.MathUtils.lerp(82,72,f)};
 if(p==="TRAVELLER FLIGHT"){const lowFlight=true;return{speed:(activeScene.id==="himalayas"?68:56)+Math.sin(t*.19)*7,clearance:activeScene.id==="himalayas"?145:110,pitch:-5+Math.sin(t*.21)*.45,fov:THREE.MathUtils.clamp(72+speed*.045,72,80)};}
 return{speed:THREE.MathUtils.lerp(85,145,f),clearance:THREE.MathUtils.lerp(55,260,f),pitch:THREE.MathUtils.lerp(-20,-52,f),fov:THREE.MathUtils.lerp(70,82,f)};
}
function setPhaseWeather(){
 if(!weatherSystem)return;
 weatherSystem.setState(phaseName==="STORM LAYER"?"storm":weather);
}
function beginNextJourney(){
 fade.classList.remove("dissolve");
 disposeScene();
 const next=randomScene();
 const nextSeed=Math.floor(Math.random()*0x7fffffff);
 const nextWeather=randomWeather();
 const nextTime=randomTime(nextWeather);
 createScene(next,nextSeed,nextWeather,nextTime);
 worldDistance=0;journeyElapsed=0;verticalVelocity=0;transitionTriggered=false;
 setPhase(0);
 if(testMode&&testSettings.freeze){camera.position.y=Math.max(terrain.getHeightAt(camera.position.x,camera.position.z)+80,terrain.getWaterLevel()+40);}
}
function advancePhase(){
 if(phaseIndex===phases.length-1){
   if(testMode){setPhase(0);setPhaseWeather();return;}
   beginNextJourney();return;
 }
 setPhase(phaseIndex+1);setPhaseWeather();
 if(phaseName==="STORM LAYER")weatherSystem?.setState("storm");
 if(phaseName==="BREAKTHROUGH")weatherSystem?.setWhiteout(.42);
 if(phaseName==="TRANSITION")weatherSystem?.setWhiteout(.24);
}
function setForcedPhase(name){
 const index=phases.findIndex(p=>p.id===name);
 if(index>=0){setPhase(index);phaseForced=name;setPhaseWeather();}
}
function updateCamera(dt){
 const motion=getPhaseMotion(dt);
 speed=testMode&&testSettings.speed!==null?testSettings.speed:motion.speed;
 if(testMode&&testSettings.freeze){speed=0;}
 const phaseProgress=phaseElapsed/phaseFor(phaseIndex).duration;
 const forwardSpeed=speed; // metres/second; displacement below is forwardSpeed * dt (metres)
 const curve=Math.sin(worldDistance*.00042)*420+Math.sin(worldDistance*.00017)*260;
 const curveNext=Math.sin((worldDistance+forwardSpeed*dt+400)*.00042)*420+Math.sin((worldDistance+forwardSpeed*dt+400)*.00017)*260;
 const x=curve;
 if(!(testMode&&testSettings.freeze)){
   camera.position.x=THREE.MathUtils.damp(camera.position.x,x,phaseName==="TRAVELLER FLIGHT"?1.1:1.8,dt);
   camera.position.z-=forwardSpeed*dt;
 }
 const lookDistance=phaseName==="TRAVELLER FLIGHT"?2200:1100;
 const yaw=Math.atan2(curveNext-curve,400);
 const pitch=THREE.MathUtils.degToRad(motion.pitch);
 camera.rotation.order="YXZ";
 if(!(testMode&&testSettings.freeze)){
   camera.lookAt(camera.position.x+Math.sin(yaw)*lookDistance,camera.position.y-Math.tan(-pitch)*lookDistance,camera.position.z-lookDistance);
   const scenicYaw=Math.sin(journeyElapsed*.16)*.16+Math.sin(journeyElapsed*.055)*.07;
   camera.rotateY(scenicYaw);
   const bank=THREE.MathUtils.clamp(-yaw*1.25+Math.sin(journeyElapsed*.7)*.025,-.14,.14);
   camera.rotateZ(bank);
 }else{
   camera.lookAt(camera.position.x,camera.position.y-Math.tan(THREE.MathUtils.degToRad(20))*1200,camera.position.z-1200);
 }
 pitchDegrees=motion.pitch;
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 const samples=[0,100,250,500,850].map(distance=>terrain.getHeightAt(camera.position.x,camera.position.z-distance));
 terrainHeightUnder=samples[0];
 const ridge=Math.max(...samples,terrain.getWaterLevel());
 const requiredClearance=phaseName==="TRAVELLER FLIGHT"?90:phaseName==="BREAKTHROUGH"?70:95;
 const targetY=ridge+requiredClearance;
 // Clearance is a one-way, damped safety correction: it never snaps the camera
 // down to the terrain or overwrites forward movement.
 if(camera.position.y<targetY){
   const gap=targetY-camera.position.y;
   verticalVelocity=Math.max(verticalVelocity,0);
   verticalVelocity+=Math.min(gap*2.2,42)*dt;
 }else{
   verticalVelocity=Math.max(0,verticalVelocity*Math.exp(-2.4*dt));
 }
 camera.position.y+=verticalVelocity*dt;
 groundWarning=camera.position.y<targetY-8?"CLEARANCE RECOVERY":"";
 cameraClearance=camera.position.y-terrainHeightUnder;
 altitude=Math.round(camera.position.y*10);
 camera.fov=THREE.MathUtils.damp(camera.fov,motion.fov,3.5,dt);camera.updateProjectionMatrix();
 worldDistance+=forwardSpeed*dt;
 return motion;
}
function animate(){
 if(!running||paused||document.hidden)return;
 frame=requestAnimationFrame(animate);
 const now=performance.now();
 const dt=Math.min(Math.max((now-lastFrameTime)/1000,0),.05);
 lastFrameTime=now;
 phaseElapsed+=dt;journeyElapsed+=dt;phaseTimeLeft=Math.max(0,phaseFor(phaseIndex).duration-phaseElapsed);
 if(phaseElapsed>=phaseFor(phaseIndex).duration){advancePhase();}
 const motion=updateCamera(dt);
 setPhaseWeather();
 const forcedRain=phaseName==="STORM LAYER";
 if(weatherSystem){
   if(forcedRain)weatherSystem.setState("storm");
   else if(activeScene.id==="rainforest")weatherSystem.setState("heavy rain");
   else if(activeScene.id==="desert")weatherSystem.setState("dust haze");
   else if(activeScene.id==="himalayas"&&weather==="overcast")weatherSystem.setState("clear");
   const lightning=weatherSystem.update(dt,camera,speed);
   if(lightning&&audio.started)audio.thunder(900+Math.random()*1700);
   windSpeed=weatherSystem.wind.length();
   whiteout.style.opacity=String(weatherSystem.whiteout*.72);
   audio.update(speed,weatherSystem.intensity);
 }
 sky?.update(camera);
 terrain?.update(dt,speed,altitude,camera);
 if(clouds)clouds.weather=phaseName==="STORM LAYER"?"storm":normalizeWeather(weather);
 clouds?.update(dt,speed,camera,altitude);
 if(scene.fog){
   scene.fog.color.set(activeScene.id==="himalayas"?0xc8dce7:activeScene.id==="desert"?0xf2c9a5:sky.horizonColor);
   const target=activeScene.id==="himalayas"?.000075:activeScene.id==="desert"?.000045:weather==="mist"?.000052:phaseName==="STORM LAYER"?.000047:weather==="storm"?.00004:.000027;
   scene.fog.density=THREE.MathUtils.damp(scene.fog.density,target,.55,dt);
 }
 try{effects?.update(dt,speed,journeyElapsed,camera,"clear");if(effects)effects.render(dt);else renderer.render(scene,camera);}
 catch(e){console.warn("Render fallback",e);try{effects?.dispose();}catch{}effects=undefined;renderer.render(scene,camera);}
 fpsFrames++;fpsElapsed+=dt;if(fpsElapsed>=1){fps=fpsFrames/fpsElapsed;fpsFrames=0;fpsElapsed=0;
   qualityCheckElapsed+=1;
   if(qualityCheckElapsed>=2){
     qualityCheckElapsed=0;
     if(fps<48)adaptiveScale=Math.max(.68,adaptiveScale-.08);
     else if(fps>58)adaptiveScale=Math.min(1,adaptiveScale+.035);
     const nextPixelRatio=Math.min(devicePixelRatio,1.6)*adaptiveScale;
     if(Math.abs(renderer.getPixelRatio()-nextPixelRatio)>.025){
       renderer.setPixelRatio(nextPixelRatio);renderer.setSize(innerWidth,innerHeight,false);effects?.resize();
     }
   }
 }
 if(debugVisible){
  const stats=terrain?.getDebugInfo?.()||{};
  const slowFlight=phaseName==="TRAVELLER FLIGHT"&&speed<20;
  debug.style.color=slowFlight?"#ff5555":"#d8f3ff";
  debug.textContent="THE FALL — JOURNEY DEBUG\nPhase: "+phaseName+" | left "+phaseTimeLeft.toFixed(1)+" s\nBiome: "+activeScene.param+" | Weather: "+weather+"\nSpeed: "+speed.toFixed(1)+" m/s | Eye height: "+eyeHeight.toFixed(1)+" m\nPath curvature: "+pathCurvature.toFixed(5)+" | Horizon visible: "+horizonVisible+"\nTime left: "+phaseTimeLeft.toFixed(1)+" s\nCamera: x "+camera.position.x.toFixed(1)+" / y "+camera.position.y.toFixed(1)+" / z "+camera.position.z.toFixed(1)+"\nChunks: "+(stats.chunkCount||0)+" | FPS: "+fps.toFixed(1)+" | Render scale: "+adaptiveScale.toFixed(2);
 }
 label.style.opacity=String(THREE.MathUtils.smoothstep(phaseElapsed,.2,1.8)*(1-THREE.MathUtils.smoothstep(phaseElapsed,phaseFor(phaseIndex).duration-1.2,phaseFor(phaseIndex).duration)));
 if(phaseName==="TRANSITION"&&phaseTimeLeft<1.8&&!transitionTriggered){transitionTriggered=true;fade.classList.add("dissolve");}
 // Scene switching is handled once by advancePhase at the end of TRANSITION.
}
document.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="d"&&!e.repeat){debugVisible=!debugVisible;debug.style.display=debugVisible?"block":"none";}});
muteButton.addEventListener("click",async()=>{
 if(!audio.started){await audio.start();audio.muted=false;muteButton.textContent="SOUND: ON";return;}
 const muted=audio.toggleMute();muteButton.textContent=muted?"SOUND: MUTED":"SOUND: ON";
});
window.addEventListener("pointerdown",()=>{if(!audio.started)audio.start().then(()=>{muteButton.textContent="SOUND: ON";}).catch(()=>{});},{once:true});
if(testMode){
 devPanel=document.createElement("section");devPanel.id="dev-test-panel";
 devPanel.innerHTML='<strong>DEV JOURNEY TEST</strong><label>Biome<select id="dt-biome">'+sceneTypes.map(s=>'<option value="'+s.param+'">'+s.name+'</option>').join("")+'</select></label><label>Phase<select id="dt-phase">'+phases.map(p=>'<option value="'+p.id+'">'+p.id+'</option>').join("")+'</select></label><label>Weather<select id="dt-weather">'+weatherTypes.map(w=>'<option value="'+w+'">'+w+'</option>').join("")+'</select></label><label>Seed<input id="dt-seed" type="number"></label><label>Time<select id="dt-time"><option>dawn</option><option>noon</option><option>sunset</option><option>night</option></select></label><label>Speed override<input id="dt-speed" type="number" min="0" max="250" placeholder="automatic"></label><label class="dt-check"><input id="dt-freeze" type="checkbox"> Freeze camera</label><button id="dt-apply">Apply test settings</button><button id="dt-copy">Copy settings URL</button>';
 document.body.appendChild(devPanel);
 const el=id=>devPanel.querySelector("#dt-"+id);
 el("biome").value=testSettings.scene;el("phase").value=testSettings.phase;el("weather").value=testSettings.weather;el("seed").value=seed;el("time").value=timeOfDay;el("speed").value=testSettings.speed??"";el("freeze").checked=testSettings.freeze;
 let open=false;document.addEventListener("keydown",e=>{if(e.key.toLowerCase()==="t"&&!e.repeat){open=!open;devPanel.classList.toggle("open",open);}});
 el("apply").addEventListener("click",()=>{
   testSettings.scene=el("biome").value;testSettings.seed=Number(el("seed").value)||1;testSettings.time=el("time").value;testSettings.weather=el("weather").value;testSettings.speed=el("speed").value===""?null:Number(el("speed").value);testSettings.freeze=el("freeze").checked;
   const chosen=sceneTypes.find(s=>s.param===testSettings.scene)||sceneTypes[0];disposeScene();createScene(chosen,testSettings.seed,testSettings.weather,testSettings.time);phaseElapsed=0;setForcedPhase(el("phase").value);if(testSettings.freeze){camera.position.y=Math.max(terrain.getHeightAt(camera.position.x,camera.position.z)+80,terrain.getWaterLevel()+40);}
   fade.classList.remove("dissolve");
 });
 el("copy").addEventListener("click",async()=>{
   const q=new URLSearchParams({biome:testSettings.scene,seed:String(testSettings.seed),time:testSettings.time,weather:testSettings.weather,phase:phaseName,freeze:testSettings.freeze?"1":"0"});
   if(testSettings.speed!==null)q.set("speed",String(testSettings.speed));
   const url=location.origin+location.pathname+"?"+q.toString();
   try{await navigator.clipboard.writeText(url);el("copy").textContent="Copied!";}catch{window.prompt("Copy test URL",url);}
 });
}
function resize(){quality=Math.min(devicePixelRatio,2);renderer.setPixelRatio(quality);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();effects?.resize();}
window.addEventListener("resize",resize);
document.addEventListener("visibilitychange",()=>{if(document.hidden){paused=true;cancelAnimationFrame(frame);}else{paused=false;lastFrameTime=performance.now();if(running)animate();}});
window.addEventListener("error",e=>console.error("THE FALL runtime error",e.error||e.message));
const initial=testMode?(sceneTypes.find(s=>s.id===(sceneAliases[testSettings.scene]||testSettings.scene))||sceneTypes[0]):sceneTypes[Math.floor(Math.random()*sceneTypes.length)];
createScene(initial,seed,testSettings.weather,testSettings.time);
if(testMode)setForcedPhase(testSettings.phase);
if(testMode&&testSettings.freeze){camera.position.y=Math.max(terrain.getHeightAt(camera.position.x,camera.position.z)+80,terrain.getWaterLevel()+40);}
running=true;lastFrameTime=performance.now();animate();
