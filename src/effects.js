import * as THREE from "three";
import {EffectComposer,RenderPass,EffectPass,BloomEffect,DepthOfFieldEffect,VignetteEffect,ChromaticAberrationEffect,SMAAEffect,ToneMappingEffect,ToneMappingMode} from "postprocessing";
export class CinematicEffects{
 constructor(renderer,scene,camera){
  this.scene=scene;this.composer=new EffectComposer(renderer,{multisampling:0});this.composer.addPass(new RenderPass(scene,camera));
  const bloom=new BloomEffect({intensity:1.05,luminanceThreshold:.72}),dof=new DepthOfFieldEffect(camera,{focusDistance:.012,focusRange:.035,bokehScale:1.5}),vignette=new VignetteEffect({offset:.24,darkness:.4}),fringe=new ChromaticAberrationEffect({offset:new THREE.Vector2(.0002,.0002)}),tone=new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC}),smaa=new SMAAEffect();
  this.composer.addPass(new EffectPass(camera,bloom,dof,fringe,vignette,tone,smaa));
  const count=650,positions=new Float32Array(count*6);for(let i=0;i<count;i++){const k=i*6,x=(Math.random()-.5)*180,y=(Math.random()-.5)*120,z=-Math.random()*360;positions[k]=x;positions[k+1]=y;positions[k+2]=z;positions[k+3]=x;positions[k+4]=y-1-Math.random()*4;positions[k+5]=z-2;}
  this.streakGeometry=new THREE.BufferGeometry();this.streakGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));this.streaks=new THREE.LineSegments(this.streakGeometry,new THREE.LineBasicMaterial({color:0xe5f2ff,transparent:true,opacity:.2,depthWrite:false}));scene.add(this.streaks);
 }
 update(dt,speed){this.streaks.position.z+=dt*(speed*2+80);this.streaks.material.opacity=THREE.MathUtils.clamp(speed/180,.18,.7);if(this.streaks.position.z>100)this.streaks.position.z=-100;}
 render(dt){this.composer.render(dt);}resize(){this.composer.setSize(innerWidth,innerHeight);}dispose(){this.scene.remove(this.streaks);this.streakGeometry.dispose();this.streaks.material.dispose();this.composer.dispose();}
}