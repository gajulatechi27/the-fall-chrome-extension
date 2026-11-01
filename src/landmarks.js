import * as THREE from "three";
const M={
 road:new THREE.MeshStandardMaterial({color:0x343a3d,roughness:.95}),concrete:new THREE.MeshStandardMaterial({color:0x99958c,roughness:1}),
 house:new THREE.MeshStandardMaterial({color:0xc5ad8c,roughness:1}),glass:new THREE.MeshStandardMaterial({color:0x52788a,roughness:.4}),
 water:new THREE.MeshStandardMaterial({color:0x397f9a,roughness:.25}),sand:new THREE.MeshStandardMaterial({color:0xc7b184}),
 green:new THREE.MeshStandardMaterial({color:0x244b35}),snow:new THREE.MeshStandardMaterial({color:0xe9edf0}),
 temple:new THREE.MeshStandardMaterial({color:0xd8a76d}),red:new THREE.MeshStandardMaterial({color:0x9b4d3b}),white:new THREE.MeshStandardMaterial({color:0xe9e2d0})
};
export const themes=["himalayas","river","sea","village","town","city","ghats","highway","tollgate","temple"];
function box(p,x,y,z,w,h,d,m){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o;}
function tower(p,x,z,s=1){box(p,x,-57,z,34*s,26*s,28*s,M.temple);for(let i=0;i<5;i++){const o=new THREE.Mesh(new THREE.ConeGeometry((1-i*.14)*17*s,7*s,8),M.red);o.position.set(x,-42*s+i*6*s,z);p.add(o);}}
function curveRoad(p,pts,w){const c=new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v)));const o=new THREE.Mesh(new THREE.TubeGeometry(c,90,w/2,7,false),M.road);p.add(o);}
function building(p,x,z,w,h,d,mat){box(p,x,-70+h/2,z,w,h,d,mat);if(h>38)for(let r=0;r<Math.min(4,Math.floor(h/45));r++)box(p,x,-60+r*42,z-d/2-.6,Math.min(5,w*.22),6,.5,M.glass);}
function addTheme(p,t,seed,z){let s=seed>>>0;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 if(t==="himalayas")for(let i=0;i<18;i++){const x=(rand()-.5)*1700,d=z-250-rand()*2100,h=300+rand()*520,r=170+rand()*240;const a=new THREE.Mesh(new THREE.ConeGeometry(r,h,5),i%3?M.concrete:M.snow);a.position.set(x,-100+h/2,d);p.add(a);const cap=new THREE.Mesh(new THREE.ConeGeometry(r*.3,h*.3,5),M.snow);cap.position.set(x,-100+h*.84,d);p.add(cap);}
 if(t==="river"){for(let side of [-1,1])for(let i=0;i<14;i++){const x=side*(190+rand()*420),zz=z-200-i*125;building(p,x,zz,25,22,26,M.house);if(i%4===0)tower(p,x,zz,1);}}
 if(t==="sea"){ /* Stage B adds biome-aware vegetation. */ }
 if(["village","town","city"].includes(t)){const n=t==="village"?42:t==="town"?76:115;for(let i=0;i<n;i++){const x=(rand()-.5)*(t==="village"?1000:1550),d=z-220-rand()*1900,w=t==="city"?30+rand()*38:18+rand()*25,h=t==="city"?90+rand()*250:t==="town"?28+rand()*65:12+rand()*25;building(p,x,d,w,h,20+rand()*28,i%4?M.house:M.concrete);if(t==="village"&&i%5===0){const roof=new THREE.Mesh(new THREE.ConeGeometry(15,12,4),M.red);roof.position.set(x,-55+h,d);p.add(roof);}}}
 if(t==="ghats"){curveRoad(p,[[-700,-62,z-1850],[-360,-62,z-1300],[280,-62,z-900],[520,-62,z-480],[100,-62,z-80],[-250,-62,z+280]],38);for(let side of [-1,1])for(let i=0;i<22;i++){const tree=new THREE.Mesh(new THREE.ConeGeometry(17+rand()*9,70,7),M.green);tree.position.set(side*(360+i*23),-38,z-200-i*85);p.add(tree);}}
 if(t==="highway"||t==="tollgate"){curveRoad(p,[[-90,-62,z-2000],[-65,-62,z-1100],[-65,-62,z+300]],t==="highway"?55:75);for(let side of [-1,1])box(p,side*42,-49,z-900,2,24,1900,M.concrete);if(t==="tollgate"){for(let lane=-2;lane<=2;lane++){box(p,lane*27,-42,z-720,5,38,9,M.white);box(p,lane*27,-20,z-720,25,5,16,M.red);box(p,lane*27,-62,z-704,3,34,3,M.white);}box(p,0,-29,z-670,190,12,24,M.concrete);}}
 if(t==="temple"){for(let i=0;i<7;i++)tower(p,(i-3)*100,z-650-Math.abs(i-3)*45,i===3?2:1.15);for(let i=0;i<18;i++)box(p,(rand()-.5)*700,-60,z-200-rand()*650,26,18,26,M.white);}
}
export class Landmarks{
 constructor(scene,seed,theme){this.group=new THREE.Group();this.group.position.y=135;scene.add(this.group);this.segments=[];this.theme=theme;for(let i=0;i<3;i++){const g=new THREE.Group();g.position.z=-i*2600;addTheme(g,theme,seed+i*137,0);this.group.add(g);this.segments.push(g);}}
 update(dt,speed){this.group.position.z+=dt*(speed*1.65+70);for(const g of this.segments)if(g.position.z+this.group.position.z>950)g.position.z-=7800;}
 dispose(){this.group.parent?.remove(this.group);this.group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
}
