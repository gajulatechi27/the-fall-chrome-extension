import * as THREE from "three";
import {createNoise2D} from "simplex-noise";
function makeCloudTexture(seed){
 let state=seed>>>0;const noise=createNoise2D(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;});
 const canvas=document.createElement("canvas");canvas.width=canvas.height=256;const ctx=canvas.getContext("2d"),image=ctx.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  let value=0,amp=.58;for(let o=0;o<6;o++){value+=noise(x*Math.pow(2,o)*.018,y*Math.pow(2,o)*.018)*amp;amp*=.51;}
  // A circular, feathered alpha mask removes the rectangular canvas boundary.
  // Keep the existing cloud noise, sprite scale, tint and opacity unchanged.
  const radial=Math.hypot((x-127.5)/127.5,(y-127.5)/127.5);
  const edge=1.0-THREE.MathUtils.smoothstep(radial,.58,1.0);
  const density=THREE.MathUtils.smoothstep(value,-.24,.34);
  const alpha=THREE.MathUtils.clamp(density*edge,0,1),i=(y*256+x)*4;
  image.data[i]=image.data[i+1]=image.data[i+2]=255;image.data[i+3]=Math.round(alpha*255);
 }
 ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class CloudField{
 constructor(scene,seed){
  this.group=new THREE.Group();scene.add(this.group);this.texture=makeCloudTexture(seed);this.layers=[];
  let state=(seed^0x9e3779b9)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const configs=[{speed:.42,count:88,y:-115,z:4800,opacity:.19,color:0xc6d9e8},{speed:.76,count:104,y:-8,z:4500,opacity:.25,color:0xffffff},{speed:1.12,count:92,y:100,z:4200,opacity:.22,color:0xe8f0f7}];
  for(const cfg of configs){
   const layer=new THREE.Group();layer.userData.speed=cfg.speed;this.group.add(layer);
   for(let i=0;i<cfg.count;i++){
    const material=new THREE.SpriteMaterial({map:this.texture,color:cfg.color,transparent:true,opacity:cfg.opacity+random()*.09,depthWrite:false});
    const cloud=new THREE.Sprite(material);cloud.position.set((random()-.5)*2050,cfg.y+(random()-.5)*205,-random()*cfg.z-160);
    const width=250+random()*470;cloud.scale.set(width,width*(.3+random()*.2),1);layer.add(cloud);
   }
   this.layers.push(layer);
  }
 }
 update(dt,speed){
  for(const layer of this.layers){layer.position.z+=dt*(42+speed*layer.userData.speed);for(const cloud of layer.children)if(cloud.position.z+layer.position.z>180){cloud.position.z-=5100;cloud.position.x=(Math.random()-.5)*2050;cloud.position.y=-145+Math.random()*330;}}
 }
 dispose(){this.group.parent?.remove(this.group);this.texture.dispose();for(const layer of this.layers)for(const cloud of layer.children)cloud.material.dispose();}
}
