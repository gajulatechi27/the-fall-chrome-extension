import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type PlayerControls={steer:number;dive:boolean;flare:boolean};
export class Skydiver {
  root=new THREE.Group();
  mixer?:THREE.AnimationMixer;
  model?:THREE.Object3D;
  loaded=false;
  private parachute?:THREE.Group;
  private velocity=0;
  private targetX=0;
  private readonly loader=new GLTFLoader();
  async load(){
    const gltf=await this.loader.loadAsync("/assets/skydiver-freefall.glb");
    this.model=gltf.scene;this.model.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=true;m.receiveShadow=true;if(m.material){const mats=Array.isArray(m.material)?m.material:[m.material];mats.forEach(x=>{x.roughness=Math.max(x.roughness??.6,.48);});}}});
    this.model.scale.setScalar(1.8);this.model.rotation.y=Math.PI;this.root.add(this.model);
    if(gltf.animations.length){this.mixer=new THREE.AnimationMixer(this.model);const clip=gltf.animations.find(a=>/fall|skydive|free.?fall|floating/i.test(a.name))??gltf.animations[0];this.mixer.clipAction(clip).reset().play();}
    this.loaded=true;return gltf.animations.map(a=>a.name);
  }
  update(dt:number,controls:PlayerControls,elapsed:number){
    this.targetX=THREE.MathUtils.clamp(this.targetX+controls.steer*dt*7,-24,24);
    this.root.position.x=THREE.MathUtils.damp(this.root.position.x,this.targetX,3.8,dt);
    const targetPitch=controls.dive?-.42:controls.flare?.2:-.12;
    this.root.rotation.x=THREE.MathUtils.damp(this.root.rotation.x,targetPitch,2.8,dt);
    this.root.rotation.z=THREE.MathUtils.damp(this.root.rotation.z,-controls.steer*.14,3.5,dt);
    this.root.rotation.y=Math.PI+Math.sin(elapsed*.8)*.035;
    this.mixer?.update(dt);
    if(this.parachute){this.parachute.position.y=controls.flare?4.2:0;this.parachute.visible=controls.flare;}
  }
  deployParachute(){
    if(this.parachute)return;
    const group=new THREE.Group();const pos:number[]=[],idx:number[]=[];const rings=16,segs=40;
    for(let r=0;r<=rings;r++){const v=r/rings;for(let s=0;s<=segs;s++){const a=s/segs*Math.PI*2;const radius=4.5*v;pos.push(Math.cos(a)*radius,2.5*(1-v*v),Math.sin(a)*radius);}}
    for(let r=0;r<rings;r++)for(let s=0;s<segs;s++){const a=r*(segs+1)+s,b=a+segs+1;idx.push(a,b,a+1,a+1,b,b+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
    const canopy=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xd94c35,side:THREE.DoubleSide,roughness:.75}));group.add(canopy);
    const lineMat=new THREE.LineBasicMaterial({color:0x252b32});
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const points=[new THREE.Vector3(Math.cos(a)*4.5,0,Math.sin(a)*4.5),new THREE.Vector3(0,-2,0)];group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),lineMat));}
    group.position.y=4.2;this.root.add(group);this.parachute=group;group.visible=false;
  }
  setParachuteVisible(value:boolean){if(value&&!this.parachute)this.deployParachute();if(this.parachute)this.parachute.visible=value;}
}
