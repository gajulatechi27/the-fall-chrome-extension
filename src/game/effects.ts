import * as THREE from "three";
export class SkyEffects {
  private wind:THREE.Points;
  private cloudTexture:THREE.CanvasTexture;
  private clouds:THREE.Group;
  private rings:THREE.Group;
  private ringMeshes:THREE.Mesh[]=[];
  private windPositions:Float32Array;
  constructor(private scene:THREE.Scene){
    const count=1500;this.windPositions=new Float32Array(count*3);
    for(let i=0;i<count;i++){this.windPositions[i*3]=(Math.random()-.5)*110;this.windPositions[i*3+1]=(Math.random()-.5)*90;this.windPositions[i*3+2]=-Math.random()*260;}
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.BufferAttribute(this.windPositions,3));
    this.wind=new THREE.Points(geo,new THREE.PointsMaterial({color:0xe8f4ff,size:.11,transparent:true,opacity:.62,depthWrite:false}));scene.add(this.wind);
    const canvas=document.createElement("canvas");canvas.width=128;canvas.height=128;const ctx=canvas.getContext("2d")!;const grad=ctx.createRadialGradient(64,64,5,64,64,64);grad.addColorStop(0,"rgba(255,255,255,.8)");grad.addColorStop(.35,"rgba(255,255,255,.4)");grad.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);this.cloudTexture=new THREE.CanvasTexture(canvas);
    this.clouds=new THREE.Group();scene.add(this.clouds);
    for(let i=0;i<42;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.cloudTexture,color:0xffffff,transparent:true,opacity:.12+Math.random()*.2,depthWrite:false}));sprite.position.set((Math.random()-.5)*180,(Math.random()-.5)*65,-20-Math.random()*230);const s=8+Math.random()*28;sprite.scale.set(s*1.9,s,1);this.clouds.add(sprite);}
    this.rings=new THREE.Group();scene.add(this.rings);
    for(let i=0;i<8;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(3.2,.13,10,56),new THREE.MeshStandardMaterial({color:0xffd68b,emissive:0xffa94d,emissiveIntensity:1.2,metalness:.55,roughness:.28}));ring.position.set((Math.random()-.5)*28,-8-Math.random()*28,-55-i*45);ring.rotation.x=Math.PI/2;ring.userData.collected=false;this.rings.add(ring);this.ringMeshes.push(ring);}
  }
  update(dt:number,speed:number,elapsed:number,player:THREE.Vector3,onCollect:()=>void){
    const p=this.wind.geometry.attributes.position as THREE.BufferAttribute;
    for(let i=0;i<p.count;i++){let z=p.getZ(i)+dt*(80+speed*2);if(z>18){z=-260-Math.random()*40;p.setX(i,(Math.random()-.5)*110);p.setY(i,(Math.random()-.5)*90);}p.setZ(i,z);}
    p.needsUpdate=true;this.wind.rotation.z=Math.sin(elapsed*.2)*.03;
    this.clouds.position.z+=dt*(26+speed*.55);for(const s of this.clouds.children){if(s.position.z+this.clouds.position.z>25)s.position.z-=260;}
    for(const ring of this.ringMeshes){if(ring.userData.collected)continue;ring.position.z+=dt*(26+speed*.55);ring.rotation.z+=dt*.65;if(ring.position.z>14){ring.position.z=-360;ring.position.x=(Math.random()-.5)*28;ring.userData.collected=false;}
      if(ring.position.distanceTo(player)<4.2){ring.userData.collected=true;ring.visible=false;onCollect();window.setTimeout(()=>{ring.visible=true;},800);}}
  }
  dispose(){this.scene.remove(this.wind,this.clouds,this.rings);this.wind.geometry.dispose();(this.wind.material as THREE.Material).dispose();this.cloudTexture.dispose();}
}
