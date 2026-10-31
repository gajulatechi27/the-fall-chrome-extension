import * as THREE from "three";

const mat=(color,roughness=.78,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const M={
 skin:mat(0xd99b78),suit:mat(0x263b59),suitLight:mat(0x3f6285),seam:mat(0x172b43),
 glove:mat(0x202b3b),boot:mat(0x172334),accent:mat(0xf2b45f),visor:mat(0x75c7d5,.24,.35),
 buckle:mat(0xf4d08a,.35,.45),sole:mat(0x101a27)
};
function capsule(parent,a,b,r,material,segments=12){
 const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
 const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(.01,delta.length()-2*r),5,segments),material);
 mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;parent.add(mesh);return mesh;
}
function ellipsoid(parent,p,s,material,segments=18){
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,segments,Math.max(8,segments>>1)),material);
 mesh.position.set(...p);mesh.scale.set(...s);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function block(parent,p,s,material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...s),material);mesh.position.set(...p);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function arm(parent,side){
 const pivot=new THREE.Group();pivot.position.set(side*.25,.25,0);parent.add(pivot);
 capsule(pivot,[0,0,0],[side*.48,.04,0],.125,M.suitLight);
 ellipsoid(pivot,[side*.48,.04,0],[.13,.13,.13],M.seam);
 capsule(pivot,[side*.48,.04,0],[side*.91,-.09,.035],.09,M.suit);
 capsule(pivot,[side*.91,-.09,.035],[side*1.03,-.13,.07],.075,M.glove);
 ellipsoid(pivot,[side*1.07,-.14,.08],[.11,.08,.12],M.glove);
 block(pivot,[side*.68,.02,-.01],[.13,.045,.18],M.accent);
 return pivot;
}
function leg(parent,side){
 const pivot=new THREE.Group();pivot.position.set(side*.13,-.43,0);parent.add(pivot);
 capsule(pivot,[0,0,0],[side*.11,-.43,.02],.15,M.suit);
 ellipsoid(pivot,[side*.11,-.43,.02],[.15,.15,.15],M.suitLight);
 capsule(pivot,[side*.11,-.43,.02],[side*.2,-.78,.1],.105,M.suitLight);
 capsule(pivot,[side*.2,-.78,.1],[side*.23,-.91,.17],.105,M.boot);
 ellipsoid(pivot,[side*.23,-.93,.22],[.12,.09,.19],M.boot);
 return pivot;
}
function build(){
 const model=new THREE.Group();model.name="StylizedFreefallSkydiver";
 // Rounded torso and waist, with a clear silhouette.
 ellipsoid(model,[0,-.28,0],[.265,.28,.245],M.suit);
 capsule(model,[0,-.37,0],[0,.43,0],.235,M.suitLight,14);
 ellipsoid(model,[0,.27,-.015],[.28,.23,.25],M.suitLight);
 // Parachute pack and bright harness details on the back.
 block(model,[0,.02,.245],[.4,.58,.22],M.seam);
 block(model,[0,.13,.37],[.31,.25,.045],M.suitLight);
 block(model,[0,-.17,.37],[.31,.13,.045],M.accent);
 capsule(model,[-.19,.36,-.02],[-.11,-.22,-.2],.027,M.accent,8);
 capsule(model,[.19,.36,-.02],[.11,-.22,-.2],.027,M.accent,8);
 block(model,[0,-.04,-.225],[.13,.11,.04],M.buckle);
 // Head, helmet cap and large stylized visor.
 capsule(model,[0,.42,0],[0,.59,0],.09,M.skin);
 ellipsoid(model,[0,.72,0],[.19,.23,.19],M.skin,20);
 ellipsoid(model,[0,.855,.015],[.195,.105,.195],M.seam,20);
 ellipsoid(model,[0,.80,-.155],[.155,.075,.055],M.visor,20);
 capsule(model,[-.17,.81,-.12],[.17,.81,-.12],.018,M.accent,8);
 ellipsoid(model,[-.185,.72,0],[.045,.07,.055],M.skin);
 ellipsoid(model,[.185,.72,0],[.045,.07,.055],M.skin);
 const arms=[arm(model,-1),arm(model,1)],legs=[leg(model,-1),leg(model,1)];
 for(const side of [-1,1]){
  ellipsoid(model,[side*.25,.25,0],[.14,.14,.14],M.suit);
  block(model,[side*.16,-.58,-.11],[.09,.16,.025],M.accent);
 }
 model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
 return{model,arms,legs};
}
export class Skydiver{
 constructor(scene){
  this.root=new THREE.Group();this.root.name="SkydiverFollowRoot";this.phase=Math.random()*Math.PI*2;
  this.parts=build();this.model=this.parts.model;this.model.scale.setScalar(1.38);this.root.add(this.model);scene.add(this.root);
 }
 async load(){return true;}
 update(dt,t,speed=90){
  const gust=Math.sin(t*1.55+this.phase),flutter=Math.sin(t*2.8+this.phase);
  this.parts.arms[0].rotation.z=-.055+gust*.06;this.parts.arms[1].rotation.z=.055-gust*.06;
  this.parts.arms[0].rotation.x=flutter*.025;this.parts.arms[1].rotation.x=-flutter*.025;
  this.parts.legs[0].rotation.x=.035+Math.sin(t*1.1+this.phase)*.055;
  this.parts.legs[1].rotation.x=-.035+Math.sin(t*1.1+this.phase+1.1)*.055;
  this.root.rotation.z=Math.sin(t*.48+this.phase)*.022;
  this.root.rotation.x=-.07+Math.sin(t*.38+this.phase)*.015;
  this.root.rotation.y=Math.sin(t*.25)*.02;
  this.root.position.set(Math.sin(t*.13)*.38,Math.sin(t*.65)*.055,-.5+Math.sin(t*.3)*Math.min(.05,speed*.0003));
 }
 dispose(){
  this.root.parent?.remove(this.root);const geometries=new Set(),materials=new Set();
  this.model.traverse(n=>{if(!n.isMesh)return;geometries.add(n.geometry);for(const m of(Array.isArray(n.material)?n.material:[n.material]))materials.add(m);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
 }
}
