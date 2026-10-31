import * as THREE from "three";

export type WorldDefinition = { name:string; subtitle:string; sky:number; fog:number; ground:number; accent:number; stone:number; light:number; atmosphere:string };
export const WORLDS: WorldDefinition[] = [
  { name:"ALPINE VALLEY", subtitle:"ENDLESS FREEFALL", sky:0x8eb9d6, fog:0xc5d1d2, ground:0x355b43, accent:0xf2c78b, stone:0x788b8b, light:0xffdfb0, atmosphere:"A vast mountain valley beneath a sea of clouds." }
];
function seeded(seed:number){let v=seed>>>0;return()=>{v=(v*1664525+1013904223)>>>0;return v/4294967296;};}
function add(g:THREE.Group,geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,cast=true){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;g.add(m);return m;}
function pine(g:THREE.Group,x:number,y:number,z:number,s:number,mat:THREE.Material,trunk:THREE.Material){add(g,new THREE.CylinderGeometry(.18*s,.38*s,3*s,8),trunk,x,y+1.5*s,z);for(let i=0;i<3;i++){const c=add(g,new THREE.ConeGeometry((2.3-i*.42)*s,(4.2-i*.25)*s,9),mat,x,y+(3.4+i*1.55)*s,z);c.rotation.y=i*.3;}}
function cloud(g:THREE.Group,x:number,y:number,z:number,s:number,mat:THREE.Material){for(let i=0;i<5;i++){const m=add(g,new THREE.SphereGeometry(1,16,12),mat,x+(i-2)*2.7*s,y+Math.sin(i*2)*.6*s,z+Math.cos(i)*.7*s,false);m.scale.set(3.8*s,1.5*s,2.5*s);}}
function chalet(g:THREE.Group,x:number,y:number,z:number,s:number,wall:THREE.Material,roof:THREE.Material){add(g,new THREE.BoxGeometry(7*s,4*s,6*s),wall,x,y+2*s,z);const r=add(g,new THREE.ConeGeometry(5.4*s,4*s,4),roof,x,y+6*s,z);r.rotation.y=Math.PI/4;add(g,new THREE.BoxGeometry(1.2*s,2.1*s,.2*s),new THREE.MeshStandardMaterial({color:0x493a30}),x,y+1.1*s,z+3.08*s);}
export function createWorld(_scene:THREE.Scene,index=0,yOffset=0):THREE.Group{
 const rng=seeded(7811+Math.round(Math.abs(yOffset))*31),g=new THREE.Group();g.position.y=yOffset;
 const rock=new THREE.MeshStandardMaterial({color:0x66777a,roughness:1}),snow=new THREE.MeshStandardMaterial({color:0xe0e5e1,roughness:.9}),forest=new THREE.MeshStandardMaterial({color:0x244b38,roughness:1}),forest2=new THREE.MeshStandardMaterial({color:0x386448,roughness:1}),bark=new THREE.MeshStandardMaterial({color:0x514133,roughness:1}),grass=new THREE.MeshStandardMaterial({color:0x527553,roughness:1}),water=new THREE.MeshStandardMaterial({color:0x438d9d,metalness:.25,roughness:.18}),warm=new THREE.MeshStandardMaterial({color:0xe2c49a,roughness:.9}),roof=new THREE.MeshStandardMaterial({color:0x765044,roughness:.8}),cloudMat=new THREE.MeshStandardMaterial({color:0xf2f1e9,transparent:true,opacity:.62,roughness:1});
 const floor=add(g,new THREE.PlaneGeometry(380,380),grass,0,-95,-70,false);floor.rotation.x=-Math.PI/2;
 // Broad mountain walls with snowy caps and irregular ridgelines.
 for(let i=0;i<25;i++){const x=(i-12)*15+(rng()-.5)*8,z=-115-rng()*70,h=42+rng()*52,w=20+rng()*17;const m=add(g,new THREE.ConeGeometry(w,h,7),rock,x,-76+h/2,z);m.scale.z=.8+rng()*.8;m.rotation.z=(rng()-.5)*.1;const cap=add(g,new THREE.ConeGeometry(w*.52,h*.23,7),snow,x,-76+h*.88,z-.5);cap.scale.z=m.scale.z;}
 // Valley river, winding through forest toward the horizon.
 const river=add(g,new THREE.PlaneGeometry(23,260),water,8,-94.3,-70,false);river.rotation.x=-Math.PI/2;river.rotation.z=.12;
 // Forests on both valley sides.
 for(let i=0;i<105;i++){const side=rng()<.5?-1:1,x=side*(20+rng()*115),z=-12-rng()*165,s=.65+rng()*1.8;pine(g,x,-94,z,s,rng()<.5?forest:forest2,bark);}
 // A tiny mountain village adds scale to the landscape.
 for(let i=0;i<9;i++){const x=-24+(i%3)*11,z=-72-Math.floor(i/3)*12;chalet(g,x,-94,z,.55+rng()*.25,warm,roof);}
 // Cloud banks sit at multiple depths and drift subtly as the world scrolls.
 for(let i=0;i<24;i++)cloud(g,(rng()-.5)*280,-35-rng()*55,-100-rng()*90,.9+rng()*2.2,cloudMat);
 // Scattered rock spurs and foreground outcrops.
 for(let i=0;i<34;i++){const x=(rng()-.5)*240,z=-15-rng()*145,s=2+rng()*7;const m=add(g,new THREE.DodecahedronGeometry(s,1),rock,x,-91+s*.3,z);m.rotation.set(rng(),rng(),rng());}
 // Atmospheric motes.
 const count=420,positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=(rng()-.5)*240;positions[i*3+1]=-12-rng()*100;positions[i*3+2]=-10-rng()*180;}
 const pg=new THREE.BufferGeometry();pg.setAttribute("position",new THREE.BufferAttribute(positions,3));g.add(new THREE.Points(pg,new THREE.PointsMaterial({color:0xffffff,size:.45,transparent:true,opacity:.45,depthWrite:false})));
 return g;
}