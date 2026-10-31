import * as THREE from "three";
import {EffectComposer,RenderPass,EffectPass,BloomEffect,DepthOfFieldEffect,VignetteEffect,BrightnessContrastEffect,ChromaticAberrationEffect,FXAAEffect,Effect} from "postprocessing";
const motionBlurShader = "uniform float blurStrength;\nvoid mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {\n vec2 direction=(uv-vec2(0.5))*blurStrength;\n vec4 sum=inputColor*0.36;\n sum+=texture2D(inputBuffer,uv-direction*0.35)*0.16;\n sum+=texture2D(inputBuffer,uv+direction*0.35)*0.16;\n sum+=texture2D(inputBuffer,uv-direction*0.70)*0.16;\n sum+=texture2D(inputBuffer,uv+direction*0.70)*0.16;\n outputColor=sum;\n}";
class RadialMotionBlurEffect extends Effect {
 constructor(){super("RadialMotionBlurEffect",motionBlurShader,{uniforms:new Map([["blurStrength",new THREE.Uniform(0.0015)]])});}
 setSpeed(speed){this.uniforms.get("blurStrength").value=THREE.MathUtils.clamp((speed-45)*0.000035,0,0.003);}
}
export class CinematicEffects {
 constructor(renderer,scene,camera,quality=1){
  this.scene=scene;this.quality=quality;this.composer=new EffectComposer(renderer,{multisampling:0});this.composer.addPass(new RenderPass(scene,camera));
  this.bloom=new BloomEffect({intensity:0.8,luminanceThreshold:0.78,luminanceSmoothing:0.18});
  this.dof=new DepthOfFieldEffect(camera,{focusDistance:0.018,focusRange:0.035,bokehScale:1.2});
  this.grade=new BrightnessContrastEffect({brightness:0.015,contrast:0.08});
  this.motion=new RadialMotionBlurEffect();
  this.fringe=new ChromaticAberrationEffect({offset:new THREE.Vector2(0.00018,0.00018)});
  this.vignette=new VignetteEffect({offset:0.24,darkness:0.34});
  this.fxaa=new FXAAEffect();
  this.composer.addPass(new EffectPass(camera,this.bloom,this.dof,this.grade,this.motion,this.fringe,this.vignette,this.fxaa));
  const count=quality<1.25?450:850;this.positions=new Float32Array(count*3);this.velocities=new Float32Array(count);
  for(let i=0;i<count;i++){this.positions[i*3]=(Math.random()-0.5)*100;this.positions[i*3+1]=(Math.random()-0.5)*70;this.positions[i*3+2]=-Math.random()*220;this.velocities[i]=0.65+Math.random()*1.8;}
  this.windGeometry=new THREE.BufferGeometry();this.windGeometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3));
  this.windMaterial=new THREE.PointsMaterial({color:0xeaf5ff,size:0.8,transparent:true,opacity:0.42,depthWrite:false,sizeAttenuation:true});
  this.wind=new THREE.Points(this.windGeometry,this.windMaterial);this.wind.frustumCulled=false;scene.add(this.wind);this.resize();
 }
 update(dt,speed,elapsed){this.motion.setSpeed(speed);this.windMaterial.opacity=THREE.MathUtils.clamp(0.18+speed*0.0022,0.2,0.48);for(let i=0;i<this.positions.length/3;i++){const k=i*3;this.positions[k+2]+=dt*(speed*0.12+22)*this.velocities[i];this.positions[k]+=Math.sin(elapsed*1.8+i)*dt*0.7;if(this.positions[k+2]>16){this.positions[k]=(Math.random()-0.5)*100;this.positions[k+1]=(Math.random()-0.5)*70;this.positions[k+2]=-180-Math.random()*50;}}this.windGeometry.attributes.position.needsUpdate=true;}
 render(dt){this.composer.render(dt);}
 resize(){this.composer.setSize(Math.max(1,innerWidth),Math.max(1,innerHeight));}
 dispose(){this.scene.remove(this.wind);this.windGeometry.dispose();this.windMaterial.dispose();this.composer.dispose();}
}