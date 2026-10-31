import * as THREE from "three";
import {EffectComposer,RenderPass,EffectPass,BloomEffect,DepthOfFieldEffect,VignetteEffect,ChromaticAberrationEffect,SMAAEffect,ToneMappingEffect,ToneMappingMode} from "postprocessing";
export class CinematicEffects{
 constructor(renderer,scene,camera){
  this.composer=new EffectComposer(renderer,{multisampling:0});
  this.composer.addPass(new RenderPass(scene,camera));
  const bloom=new BloomEffect({intensity:1.05,luminanceThreshold:.72});
  const dof=new DepthOfFieldEffect(camera,{focusDistance:.012,focusRange:.035,bokehScale:1.5});
  const vignette=new VignetteEffect({offset:.24,darkness:.4});
  const speedFringe=new ChromaticAberrationEffect({offset:new THREE.Vector2(.00025,.00025)});
  const tone=new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC});
  const smaa=new SMAAEffect();
  this.composer.addPass(new EffectPass(camera,bloom,dof,speedFringe,vignette,tone,smaa));
 }
 render(dt){this.composer.render(dt);}
 resize(){this.composer.setSize(innerWidth,innerHeight);}
 dispose(){this.composer.dispose();}
}