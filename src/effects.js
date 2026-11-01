import * as THREE from "three";
import {EffectComposer,RenderPass,EffectPass,BloomEffect,DepthOfFieldEffect,VignetteEffect,BrightnessContrastEffect,FXAAEffect,Effect} from "postprocessing";
const motionBlurShader="uniform float blurStrength;\nvoid mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){vec2 d=(uv-vec2(.5))*blurStrength;vec4 c=inputColor*.52;c+=texture2D(inputBuffer,uv-d*.4)*.12;c+=texture2D(inputBuffer,uv+d*.4)*.12;c+=texture2D(inputBuffer,uv-d*.8)*.12;c+=texture2D(inputBuffer,uv+d*.8)*.12;outputColor=c;}";
class RadialMotionBlurEffect extends Effect{
 constructor(){super("RadialMotionBlurEffect",motionBlurShader,{uniforms:new Map([["blurStrength",new THREE.Uniform(.0008)]])});}
 setSpeed(speed){this.uniforms.get("blurStrength").value=THREE.MathUtils.clamp((speed-55)*.000018,0,.0015);}
}
export class CinematicEffects{
 constructor(renderer,scene,camera,quality=1){
  this.scene=scene;this.quality=quality;this.composer=new EffectComposer(renderer,{multisampling:0});this.composer.addPass(new RenderPass(scene,camera));
  this.bloom=new BloomEffect({intensity:.48,luminanceThreshold:.86,luminanceSmoothing:.2});
  this.dof=new DepthOfFieldEffect(camera,{focusDistance:.025,focusRange:.065,bokehScale:.55});
  this.grade=new BrightnessContrastEffect({brightness:.035,contrast:.025});
  this.motion=new RadialMotionBlurEffect();this.vignette=new VignetteEffect({offset:.3,darkness:.22});this.fxaa=new FXAAEffect();
  this.composer.addPass(new EffectPass(camera,this.bloom,this.dof,this.grade,this.motion,this.vignette,this.fxaa));
  const count=quality<1.2?280:480;this.positions=new Float32Array(count*3);this.velocities=new Float32Array(count);
  for(let i=0;i<count;i++){this.positions[i*3]=(Math.random()-.5)*82;this.positions[i*3+1]=(Math.random()-.5)*54;this.positions[i*3+2]=-Math.random()*190;this.velocities[i]=.7+Math.random()*1.5;}
  this.windGeometry=new THREE.BufferGeometry();this.windGeometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3));
  this.windMaterial=new THREE.PointsMaterial({color:0xeaf5ff,size:.55,transparent:true,opacity:.3,depthWrite:false});
  this.wind=new THREE.Points(this.windGeometry,this.windMaterial);this.wind.frustumCulled=false;scene.add(this.wind);this.resize();
 }
 update(dt,speed,elapsed){
  this.motion.setSpeed(speed);this.windMaterial.opacity=THREE.MathUtils.clamp(.12+speed*.0015,.16,.32);
  for(let i=0;i<this.positions.length/3;i++){const k=i*3;this.positions[k+2]+=dt*(speed*.1+18)*this.velocities[i];this.positions[k]+=Math.sin(elapsed*1.5+i)*dt*.45;if(this.positions[k+2]>16){this.positions[k]=(Math.random()-.5)*82;this.positions[k+1]=(Math.random()-.5)*54;this.positions[k+2]=-170-Math.random()*40;}}
  this.windGeometry.attributes.position.needsUpdate=true;
 }
 render(dt){this.composer.render(dt);}
 resize(){this.composer.setSize(Math.max(1,innerWidth),Math.max(1,innerHeight));}
 dispose(){this.scene.remove(this.wind);this.windGeometry.dispose();this.windMaterial.dispose();this.composer.dispose();}
}
