import * as THREE from "three";
import {createNoise2D} from "simplex-noise";

function makeCloudTexture(seed){
  let state=seed>>>0;
  const noise=createNoise2D(()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;});
  const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
  const ctx=canvas.getContext("2d"),image=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    let value=0,amplitude=.58;
    for(let octave=0;octave<6;octave++){const frequency=Math.pow(2,octave)*.021;value+=noise(x*frequency,y*frequency)*amplitude;amplitude*=.51;}
    const radial=Math.hypot((x-128)/144,(y-128)/144);
    const edge=THREE.MathUtils.smoothstep(1.02-radial,.02,.82);
    const alpha=THREE.MathUtils.clamp((value+.28)*2.05*edge,0,1);
    const index=(y*256+x)*4;
    image.data[index]=image.data[index+1]=image.data[index+2]=255;
    image.data[index+3]=Math.round(alpha*255);
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export class CloudField{
  constructor(scene,seed){
    this.group=new THREE.Group();scene.add(this.group);
    this.texture=makeCloudTexture(seed);
    this.layers=[];
    let state=(seed^0x9e3779b9)>>>0;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const layerConfigs=[
      {speed:.48,count:72,y:-105,zRange:4600,opacity:.23,color:0xcbd7e1},
      {speed:.86,count:78,y:-10,zRange:4300,opacity:.29,color:0xffffff},
      {speed:1.32,count:72,y:85,zRange:4000,opacity:.25,color:0xe5edf3}
    ];
    for(const config of layerConfigs){
      const layer=new THREE.Group();layer.userData.speed=config.speed;this.group.add(layer);
      for(let i=0;i<config.count;i++){
        const material=new THREE.SpriteMaterial({map:this.texture,color:config.color,transparent:true,opacity:config.opacity+random()*.12,depthWrite:false});
        const cloud=new THREE.Sprite(material);
        cloud.position.set((random()-.5)*1900,config.y+(random()-.5)*185,-random()*config.zRange-140);
        const width=210+random()*430;
        cloud.scale.set(width,width*(.32+random()*.24),1);
        layer.add(cloud);
      }
      this.layers.push(layer);
    }
  }
  update(dt,speed){
    for(const layer of this.layers){
      layer.position.z+=dt*(48+speed*layer.userData.speed);
      for(const cloud of layer.children){
        if(cloud.position.z+layer.position.z>170){
          cloud.position.z-=4850;
          cloud.position.x=(Math.random()-.5)*1900;
          cloud.position.y=-115+Math.random()*300;
        }
      }
    }
  }
  dispose(){
    this.group.parent?.remove(this.group);
    this.texture.dispose();
    for(const layer of this.layers)for(const cloud of layer.children)cloud.material.dispose();
  }
}
