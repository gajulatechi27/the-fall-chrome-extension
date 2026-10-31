import * as THREE from "three";
import { createWorld, WORLDS } from "./worlds";
type GameMode="play"|"watch";
type GameState={worldName:string;worldIndex:number;score:number;distance:number;worldProgress:number;transitioning:boolean;nextWorldName:string};
export class FallGame{
private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,650);
private renderer:THREE.WebGLRenderer;private clock=new THREE.Clock();private player=new THREE.Group();private worldGroup=new THREE.Group();private portal:THREE.Mesh;
private running=false;private paused=false;private mode:GameMode="play";private worldIndex=0;private worldProgress=0;private distance=0;private score=0;private playerX=0;private targetX=0;private transitionTimer=0;private transitionActive=false;private soundEnabled=true;private callbacks:Array<(s:GameState)=>void>=[];private keys=new Set<string>();private frame=0;private audio?:AudioContext;private disposed=false;
constructor(private canvas:HTMLCanvasElement){
this.scene.background=new THREE.Color(WORLDS[0].sky);this.scene.fog=new THREE.Fog(WORLDS[0].fog,35,230);
this.camera.position.set(0,6,18);this.camera.lookAt(0,0,-8);
this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
this.scene.add(new THREE.HemisphereLight(0xe4efff,0x39404a,2));const sun=new THREE.DirectionalLight(0xffe0b1,2.8);sun.position.set(-35,60,25);this.scene.add(sun);
this.createPlayer();this.scene.add(this.player);
this.portal=new THREE.Mesh(new THREE.TorusGeometry(12,.7,16,96),new THREE.MeshBasicMaterial({color:0x8ce9df,transparent:true,opacity:0,side:THREE.DoubleSide}));this.portal.position.set(0,-72,-45);this.scene.add(this.portal);
this.scene.add(this.worldGroup);this.loadWorld(0);this.bindControls();window.addEventListener("resize",this.onResize);this.renderer.render(this.scene,this.camera);
}
private createPlayer(){
const suit=new THREE.MeshStandardMaterial({color:0x202b3b,roughness:.55,metalness:.25}),accent=new THREE.MeshStandardMaterial({color:0xd6b36e,roughness:.4,metalness:.35}),skin=new THREE.MeshStandardMaterial({color:0xc58e70,roughness:.85});
const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.58,1.1,5,10),suit);this.player.add(torso);
const head=new THREE.Mesh(new THREE.SphereGeometry(.38,20,16),skin);head.position.set(0,1.15,.02);this.player.add(head);
const ring=new THREE.Mesh(new THREE.TorusGeometry(.37,.055,8,24),accent);ring.position.copy(head.position);ring.rotation.x=Math.PI/2;this.player.add(ring);
const armGeo=new THREE.CapsuleGeometry(.16,.9,4,8),left=new THREE.Mesh(armGeo,suit);left.position.set(-.77,.28,0);left.rotation.z=-.8;this.player.add(left);const right=left.clone();right.position.x=.77;right.rotation.z=.8;this.player.add(right);
const legGeo=new THREE.CapsuleGeometry(.2,.8,4,8),leg=new THREE.Mesh(legGeo,suit);leg.position.set(-.28,-1.15,.05);leg.rotation.z=-.16;this.player.add(leg);const leg2=leg.clone();leg2.position.x=.28;leg2.rotation.z=.16;this.player.add(leg2);
const pack=new THREE.Mesh(new THREE.BoxGeometry(.72,.85,.3),accent);pack.position.set(0,.1,-.48);this.player.add(pack);this.player.scale.setScalar(.9);this.player.rotation.x=-.16;
}
private loadWorld(index:number){this.clearGroup(this.worldGroup);this.worldGroup.add(createWorld(this.scene,index));this.scene.background=new THREE.Color(WORLDS[index].sky);this.scene.fog=new THREE.Fog(WORLDS[index].fog,35,230);}
private clearGroup(group:THREE.Group){while(group.children.length){const child=group.children[0];group.remove(child);child.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(Array.isArray(m.material))m.material.forEach(x=>x.dispose());else if(m.material)m.material.dispose();});}}
private bindControls(){
window.addEventListener("keydown",e=>{this.keys.add(e.code);if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code))e.preventDefault();});
window.addEventListener("keyup",e=>this.keys.delete(e.code));
this.canvas.addEventListener("pointermove",e=>{if(this.mode==="play"&&this.running&&!this.paused)this.targetX=THREE.MathUtils.clamp((e.clientX/innerWidth*2-1)*5.5,-5.5,5.5);});
this.canvas.addEventListener("touchmove",e=>{if(this.mode==="play"&&this.running&&!this.paused){const t=e.touches[0];this.targetX=THREE.MathUtils.clamp((t.clientX/innerWidth*2-1)*5.5,-5.5,5.5);}},{passive:true});
}
start(mode:GameMode){this.mode=mode;this.running=true;this.paused=false;this.clock.start();if(this.soundEnabled)this.startAudio();this.animate();}
pause(){this.paused=true;}
togglePause(){if(!this.running)return false;this.paused=!this.paused;if(!this.paused){this.clock.start();this.animate();}return this.paused;}
isRunning(){return this.running;}
toggleSound(){this.soundEnabled=!this.soundEnabled;if(!this.soundEnabled)this.audio?.suspend();else if(this.running)this.startAudio();return this.soundEnabled;}
private startAudio(){try{if(!this.audio)this.audio=new AudioContext();if(this.audio.state==="suspended")void this.audio.resume();}catch{/* Audio is optional. */}}
private animate=()=>{if(!this.running||this.paused||this.disposed)return;this.frame=requestAnimationFrame(this.animate);const delta=Math.min(this.clock.getDelta(),.04);this.update(delta);this.renderer.render(this.scene,this.camera);};
private update(delta:number){
const elapsed=this.clock.elapsedTime,speed=this.mode==="watch"?1:1.08;
if(this.mode==="play"){if(this.keys.has("ArrowLeft")||this.keys.has("KeyA"))this.targetX-=delta*8;if(this.keys.has("ArrowRight")||this.keys.has("KeyD"))this.targetX+=delta*8;this.targetX=THREE.MathUtils.clamp(this.targetX,-5.5,5.5);}else this.targetX=Math.sin(elapsed*.42)*2.7;
this.playerX=THREE.MathUtils.damp(this.playerX,this.targetX,4.2,delta);this.player.position.x=this.playerX;this.player.rotation.z=THREE.MathUtils.damp(this.player.rotation.z,-this.playerX*.045,3.5,delta);this.player.rotation.y=Math.sin(elapsed*1.4)*.06;this.player.rotation.x=-.16+Math.sin(elapsed*2.2)*.035;
this.worldProgress+=delta*.115*speed;this.distance+=delta*92*speed;this.score+=Math.floor(delta*12);this.worldGroup.position.y+=delta*18*speed;if(this.worldGroup.position.y>30){this.worldGroup.position.y=0;this.worldProgress=0;}
const orbit=this.mode==="watch"?Math.sin(elapsed*.22)*.55:Math.sin(elapsed*.18)*.12;this.camera.position.x=THREE.MathUtils.damp(this.camera.position.x,this.playerX*.32+orbit,1.7,delta);this.camera.position.y=5.8+Math.sin(elapsed*1.9)*.18;this.camera.position.z=17.5+Math.sin(elapsed*.7)*.45;this.camera.lookAt(this.player.position.x*.35,-1.2,-12);
this.portal.rotation.z+=delta*.5;const approach=this.worldProgress>.72;(this.portal.material as THREE.MeshBasicMaterial).opacity=approach?Math.min(.75,(this.worldProgress-.72)*2.7):0;this.portal.scale.setScalar(.75+Math.sin(elapsed*3)*.035);
if(this.worldProgress>=.98&&!this.transitionActive){this.transitionActive=true;this.transitionTimer=1.35;}
if(this.transitionActive&&((this.transitionTimer-=delta)<=0)){this.worldIndex=(this.worldIndex+1)%WORLDS.length;this.worldProgress=0;this.worldGroup.position.y=0;this.loadWorld(this.worldIndex);this.transitionActive=false;}
const state:GameState={worldName:WORLDS[this.worldIndex].name,worldIndex:this.worldIndex,score:this.score,distance:this.distance,worldProgress:this.worldProgress,transitioning:this.transitionActive,nextWorldName:WORLDS[(this.worldIndex+1)%WORLDS.length].name};this.callbacks.forEach(cb=>cb(state));
}
onUpdate(callback:(state:GameState)=>void){this.callbacks.push(callback);}
private onResize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));};
dispose(){this.disposed=true;this.running=false;cancelAnimationFrame(this.frame);window.removeEventListener("resize",this.onResize);this.clearGroup(this.worldGroup);this.renderer.dispose();void this.audio?.close();}
}