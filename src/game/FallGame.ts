import * as THREE from "three";
import { GameScene } from "./scene";
import { Skydiver } from "./player";
import { SkyEffects } from "./effects";

export type GameMode="play"|"watch";
export type GameState={score:number;distance:number;altitude:number;speed:number;parachute:boolean;modelReady:boolean;assetError?:string};
export class FallGame {
  private view:GameScene;
  private player=new Skydiver();
  private effects:SkyEffects;
  private clock=new THREE.Clock();
  private running=false;private paused=false;private disposed=false;private mode:GameMode="play";
  private frame=0;private elapsed=0;private score=0;private altitude=12000;private speed=48;private playerX=0;private steer=0;
  private keys=new Set<string>();private soundEnabled=true;private audio?:AudioContext;
  private callbacks:Array<(s:GameState)=>void>=[];
  private assetError?:string;private parachute=false;private readonly baseFov=62;
  constructor(canvas:HTMLCanvasElement){
    this.view=new GameScene(canvas);this.effects=new SkyEffects(this.view.scene);
    void this.player.load().then(names=>{console.info("Skydiver GLB loaded. Animation clips:",names);this.emit();}).catch(error=>{this.assetError=String(error);console.error("Unable to load /assets/skydiver-freefall.glb",error);this.emit();});
    this.bindControls();this.view.render();document.addEventListener("visibilitychange",this.visibility);
  }
  private bindControls(){
    window.addEventListener("keydown",this.keyDown);window.addEventListener("keyup",this.keyUp);
    window.addEventListener("blur",this.clearKeys);
  }
  private keyDown=(e:KeyboardEvent)=>{if(["ArrowLeft","ArrowRight","Space","ArrowUp","ArrowDown"].includes(e.code))e.preventDefault();this.keys.add(e.code);};
  private keyUp=(e:KeyboardEvent)=>this.keys.delete(e.code);
  private clearKeys=()=>this.keys.clear();
  private visibility=()=>{if(document.hidden&&this.running)this.pause();};
  onUpdate(cb:(s:GameState)=>void){this.callbacks.push(cb);cb(this.state());}
  private state():GameState{return{score:this.score,distance:12000-this.altitude,altitude:this.altitude,speed:this.speed,parachute:this.parachute,modelReady:this.player.loaded,assetError:this.assetError};}
  private emit(){const s=this.state();this.callbacks.forEach(cb=>cb(s));}
  start(mode:GameMode){
    if(!this.player.loaded){this.assetError=this.assetError??"Skydiver model is not ready. Add public/assets/skydiver-freefall.glb.";this.emit();return false;}
    this.mode=mode;this.running=true;this.paused=false;this.clock.start();if(this.soundEnabled)this.startAudio();this.animate();return true;
  }
  pause(){this.paused=true;this.clearKeys();}
  togglePause(){if(!this.running)return false;this.paused=!this.paused;if(!this.paused){this.clock.start();this.animate();}return this.paused;}
  isRunning(){return this.running;}
  toggleSound(){this.soundEnabled=!this.soundEnabled;if(!this.soundEnabled)void this.audio?.suspend();else if(this.running)this.startAudio();return this.soundEnabled;}
  private startAudio(){try{if(!this.audio)this.audio=new AudioContext();if(this.audio.state==="suspended")void this.audio.resume();}catch{/* Sound is optional. */}}
  private animate=()=>{if(!this.running||this.paused||this.disposed)return;this.frame=requestAnimationFrame(this.animate);const dt=Math.min(this.clock.getDelta(),.033);this.update(dt);this.view.render();};
  private update(dt:number){
    this.elapsed+=dt;
    const left=this.keys.has("ArrowLeft")||this.keys.has("KeyA"),right=this.keys.has("ArrowRight")||this.keys.has("KeyD");
    this.steer=this.mode==="watch"?Math.sin(this.elapsed*.25)*.18:(left?-1:0)+(right?1:0);
    const dive=this.keys.has("KeyS")||this.keys.has("ArrowDown"),flare=this.keys.has("KeyW")||this.keys.has("ArrowUp");
    const terminal=this.parachute?9:dive?92:flare?25:48;
    this.speed=THREE.MathUtils.damp(this.speed,terminal,1.8,dt);
    this.altitude=Math.max(0,this.altitude-this.speed*dt*3.6);
    if(this.altitude<=260&&!this.parachute){this.parachute=true;this.player.deployParachute();}
    this.player.update(dt,{steer:this.steer,dive,flare:this.parachute||flare},this.elapsed);
    this.playerX=this.player.root.position.x;
    this.view.update(dt,this.speed,this.altitude);
    this.effects.update(dt,this.speed,this.elapsed,this.player.root.position,()=>{this.score+=100;this.emit();});
    const camera=this.view.camera;
    const targetFov=this.baseFov+Math.min(18,(this.speed-25)*.22);
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,2.4,dt);camera.updateProjectionMatrix();
    const shake=Math.max(0,(this.speed-40)/70);
    camera.position.set(this.playerX*.24+Math.sin(this.elapsed*31)*shake*.16,5.2+Math.sin(this.elapsed*23)*shake*.12,15.5+Math.sin(this.elapsed*17)*shake*.1);
    camera.lookAt(this.playerX*.16,-5,-28);
    this.view.terrain.position.y=-THREE.MathUtils.lerp(210,55,1-this.altitude/12000);
    this.view.sun.intensity=this.parachute?2.5:3.4;
    this.score+=Math.floor(dt*2);
    this.emit();
  }
  private onDummy(){}
  dispose(){this.disposed=true;this.running=false;cancelAnimationFrame(this.frame);window.removeEventListener("keydown",this.keyDown);window.removeEventListener("keyup",this.keyUp);window.removeEventListener("blur",this.clearKeys);document.removeEventListener("visibilitychange",this.visibility);this.effects.dispose();this.view.dispose();void this.audio?.close();}
}
