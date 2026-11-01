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
    this.gustPhase = (this.gustPhase || 0) + dt * (weather === "storm" ? 2.8 : 1.35);
    const gust = Math.sin(this.gustPhase) * 0.5 + Math.sin(this.gustPhase * 0.43) * 0.5;
    const windy = weather === "storm" ? 1 : weather === "rain" ? .78 : weather === "mist" ? .18 : weather === "light clouds" || weather === "heavy clouds" ? .34 : .12;
    this.wind.material.opacity = THREE.MathUtils.clamp((.035 + speed * .00135) * windy * (0.72 + Math.abs(gust) * .55), .015, .34);
    this.rain.material.opacity = weather === "storm" ? .7 : weather === "rain" ? .48 : 0;
    this.moveStreaks(this.wind,dt,speed,gust * (weather === "storm" ? 8 : 4),weather === "storm" ? 1.6 : .55);
    if(this.rain.count) this.moveRain(dt,speed,weather === "storm" ? 1.9 : 1.15,gust);
  }
  moveStreaks(system,dt,speed,gust,fall){
    for(let i=0;i<system.count;i++){
      const k=i*6;
      const dz=dt*(speed*.075+10)*(1.0+(i%7)*.055);
      const dx=dt*(gust*22+(i%5-2)*1.8);
      system.positions[k+2]+=dz; system.positions[k+5]+=dz;
      system.positions[k]+=dx; system.positions[k+3]+=dx;
      system.positions[k+1]-=dt*fall*(4+(i%6)); system.positions[k+4]-=dt*fall*(4+(i%6));
      if(system.positions[k+2]>-1 || system.positions[k+1]<-34){
        const x=(Math.random()-.5)*90,y=18+Math.random()*32,z=-145-Math.random()*55;
        const len=system.width*(.5+Math.random()*1.8);
        system.positions[k]=x; system.positions[k+1]=y; system.positions[k+2]=z;
        system.positions[k+3]=x+(Math.random()-.5)*.22+gust*.025; system.positions[k+4]=y-len; system.positions[k+5]=z;
      }
    }
    system.geometry.attributes.position.needsUpdate=true;
  }
  moveRain(dt,speed,intensity,gust){
    const system=this.rain;
    for(let i=0;i<system.count;i++){
      const k=i*6;
      const fallSpeed=(34+speed*.24)*(i%9===0?1.35:1)*intensity;
      const dx=dt*(9+speed*.035)*gust, dy=dt*fallSpeed;
      system.positions[k]+=dx; system.positions[k+3]+=dx;
      system.positions[k+1]-=dy; system.positions[k+4]-=dy;
      system.positions[k+2]+=dt*(speed*.025+3); system.positions[k+5]+=dt*(speed*.025+3);
      if(system.positions[k+1]<-28 || system.positions[k+2]>-1){
        const x=(Math.random()-.5)*92,y=24+Math.random()*36,z=-135-Math.random()*70;
        const len=1.2+Math.random()*2.8, slant=.08+gust*.06;
        system.positions[k]=x; system.positions[k+1]=y; system.positions[k+2]=z;
        system.positions[k+3]=x+slant; system.positions[k+4]=y-len; system.positions[k+5]=z+.2;
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
