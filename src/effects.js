import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect, BrightnessContrastEffect, FXAAEffect, Effect } from "postprocessing";

const motionBlurShader = `
uniform float blurStrength;
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  vec2 d=(uv-vec2(.5))*blurStrength;
  vec4 c=inputColor*.42;
  c+=texture2D(inputBuffer,uv-d*.35)*.145;
  c+=texture2D(inputBuffer,uv+d*.35)*.145;
  c+=texture2D(inputBuffer,uv-d*.75)*.145;
  c+=texture2D(inputBuffer,uv+d*.75)*.145;
  outputColor=c;
}`;
class RadialMotionBlurEffect extends Effect {
  constructor(){ super("RadialMotionBlurEffect",motionBlurShader,{uniforms:new Map([["blurStrength",new THREE.Uniform(.0008)]])}); }
  setSpeed(speed){ this.uniforms.get("blurStrength").value=THREE.MathUtils.clamp((speed-55)*.000035,0,.0048); }
}
function makeStreaks(count, color, opacity, width) {
  const positions = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const material = new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});
  const lines = new THREE.LineSegments(geometry,material);
  lines.frustumCulled=false;
  return {lines,positions,geometry,material,count,width};
}
export class CinematicEffects {
  constructor(renderer,scene,camera,quality=1,weather="clear"){
    this.scene=scene;this.camera=camera;this.quality=quality;this.weather=weather;
    this.composer=new EffectComposer(renderer,{multisampling:0});
    this.composer.addPass(new RenderPass(scene,camera));
    this.bloom=new BloomEffect({intensity:.62,luminanceThreshold:.82,luminanceSmoothing:.22});
    this.grade=new BrightnessContrastEffect({brightness:.015,contrast:.075});
    this.motion=new RadialMotionBlurEffect();
    this.vignette=new VignetteEffect({offset:.24,darkness:.3});
    this.fxaa=new FXAAEffect();
    this.composer.addPass(new EffectPass(camera,this.bloom,this.grade,this.motion,this.vignette,this.fxaa));
    const windCount=quality<1.2?190:320;
    const rainCount=weather==="rain"||weather==="storm"?(quality<1.2?900:1600):0;
    this.wind=makeStreaks(windCount,0xeaf6ff,.26,.4);
    this.rain=makeStreaks(rainCount,0xc8e4f4,.42,.8);
    camera.add(this.wind.lines);
    camera.add(this.rain.lines);
    this.wind.lines.position.set(0,0,-3);
    this.rain.lines.position.set(0,0,-2);
    this.seedStreaks(this.wind,82,52,165);
    if(rainCount)this.seedStreaks(this.rain,95,65,190);
    this.resize();
  }
  seedStreaks(system,w,h,depth){
    for(let i=0;i<system.count;i++){
      const k=i*6;
      const x=(Math.random()-.5)*w, y=(Math.random()-.5)*h, z=-Math.random()*depth;
      const len=system.width*(.5+Math.random()*1.8);
      system.positions[k]=x;system.positions[k+1]=y;system.positions[k+2]=z;
      system.positions[k+3]=x+(Math.random()-.5)*.22;
      system.positions[k+4]=y-len;
      system.positions[k+5]=z+Math.random()*1.5;
    }
    system.geometry.attributes.position.needsUpdate=true;
  }
  update(dt,speed,elapsed,camera,weather=this.weather){
    this.motion.setSpeed(speed);
    this.wind.material.opacity=THREE.MathUtils.clamp(.12+speed*.0012,.18,.42);
    this.rain.material.opacity=weather==="storm"?.62:weather==="rain"?.42:0;
    this.moveStreaks(this.wind,dt,speed,0);
    if(this.rain.count)this.moveStreaks(this.rain,dt,speed,weather==="storm"?1.8:1.15);
  }
  moveStreaks(system,dt,speed,wind){
    for(let i=0;i<system.count;i++){
      const k=i*6;
      const dz=dt*(speed*.12+18)*(1.1+(i%7)*.08);
      system.positions[k+2]+=dz;
      system.positions[k+5]+=dz;
      system.positions[k]+=dt*wind*3;
      system.positions[k+3]+=dt*wind*3;
      if(system.positions[k+2]>-1){
        const x=(Math.random()-.5)*90,y=(Math.random()-.5)*62,z=-150-Math.random()*45;
        const len=system.width*(.5+Math.random()*1.8);
        system.positions[k]=x;system.positions[k+1]=y;system.positions[k+2]=z;
        system.positions[k+3]=x+(Math.random()-.5)*.22+wind*.1;
        system.positions[k+4]=y-len;
        system.positions[k+5]=z;
      }
    }
    system.geometry.attributes.position.needsUpdate=true;
  }
  render(dt){this.composer.render(dt);}
  resize(){this.composer.setSize(Math.max(1,innerWidth),Math.max(1,innerHeight));}
  dispose(){
    this.camera.remove(this.wind.lines);this.camera.remove(this.rain.lines);
    for(const system of [this.wind,this.rain]){system.geometry.dispose();system.material.dispose();}
    this.composer.dispose();
  }
}
