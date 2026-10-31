import * as THREE from "three";
export type WorldDefinition={name:string;subtitle:string;sky:number;fog:number;ground:number;accent:number;building:number;atmosphere:string;};
export const WORLDS:WorldDefinition[]=[
{name:"Satya Yuga",subtitle:"THE AGE OF TRUTH",sky:0x8caeaa,fog:0xc4b89a,ground:0x6d8a62,accent:0xe7bd69,building:0xc99a55,atmosphere:"Golden light spills across an ancient world."},
{name:"Ancient Greece · c.1000 BCE",subtitle:"THE AEGEAN WORLD",sky:0x7ca6bb,fog:0xc3c8bd,ground:0x9a8969,accent:0xd7c49a,building:0xb7a17a,atmosphere:"A rugged coastline and early settlements emerge."},
{name:"The Ice Age",subtitle:"A FROZEN EARTH",sky:0x7895ad,fog:0xc8d7df,ground:0xb8cbd3,accent:0xd9f3ff,building:0x829eaf,atmosphere:"Wind and ice reshape the world below."},
{name:"Future Earth · 3000 AD",subtitle:"THE NEXT CIVILIZATION",sky:0x171d42,fog:0x343b69,ground:0x252b49,accent:0x69f0e0,building:0x343d69,atmosphere:"A city of impossible scale rises from the dark."}
];
export function createWorld(scene:THREE.Scene,index:number,yOffset=0):THREE.Group{
const world=new THREE.Group(),data=WORLDS[index];world.userData.worldIndex=index;
const terrainMat=new THREE.MeshStandardMaterial({color:data.ground,roughness:index===2?0.8:1});
const terrain=new THREE.Mesh(new THREE.PlaneGeometry(220,220),terrainMat);terrain.rotation.x=-Math.PI/2;terrain.position.set(0,yOffset-85,0);world.add(terrain);
const landmarkMat=new THREE.MeshStandardMaterial({color:data.building,roughness:0.78,metalness:index===3?0.45:0.05});
const accentMat=new THREE.MeshStandardMaterial({color:data.accent,emissive:index===3?data.accent:0x000000,emissiveIntensity:index===3?0.65:0});
for(let i=0;i<13;i++){const height=18+Math.random()*38;const ridge=new THREE.Mesh(new THREE.ConeGeometry(13+Math.random()*14,height,5),new THREE.MeshStandardMaterial({color:index===2?0xc4d8e2:data.ground,roughness:1}));ridge.position.set((i-6)*27,yOffset-66+Math.random()*10,-42-Math.random()*35);ridge.rotation.y=Math.random()*Math.PI;world.add(ridge);}
for(let i=0;i<38;i++){const x=(Math.random()-0.5)*170,z=-25-Math.random()*125,width=5+Math.random()*8,depth=5+Math.random()*8,height=index===3?20+Math.random()*65:7+Math.random()*22;const geometry=index===0?new THREE.CylinderGeometry(width*0.55,width,height,8):new THREE.BoxGeometry(width,height,depth);const building=new THREE.Mesh(geometry,landmarkMat);building.position.set(x,yOffset-85+height/2,z);world.add(building);
if(index===0||index===3){const cap=new THREE.Mesh(new THREE.ConeGeometry(width*0.75,height*0.18,8),accentMat);cap.position.set(x,building.position.y+height*0.55,z);world.add(cap);}
if(index===2){const ice=new THREE.Mesh(new THREE.ConeGeometry(width*0.9,height*1.25,5),new THREE.MeshStandardMaterial({color:0xd8e9ef,roughness:0.9}));ice.position.set(x,yOffset-85+height*0.5,z-8);world.add(ice);}}
const landmark=index===0?new THREE.Mesh(new THREE.CylinderGeometry(5,11,55,10),accentMat):index===1?new THREE.Mesh(new THREE.CylinderGeometry(9,12,32,10),landmarkMat):index===2?new THREE.Mesh(new THREE.ConeGeometry(18,60,6),accentMat):new THREE.Mesh(new THREE.BoxGeometry(16,72,16),accentMat);
landmark.position.set(0,yOffset-58,-54);world.add(landmark);
const particleCount=180,positions=new Float32Array(particleCount*3);
for(let i=0;i<particleCount;i++){positions[i*3]=(Math.random()-0.5)*180;positions[i*3+1]=yOffset-20-Math.random()*100;positions[i*3+2]=-20-Math.random()*130;}
const particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
world.add(new THREE.Points(particleGeometry,new THREE.PointsMaterial({color:data.accent,size:index===2?0.8:0.55,transparent:true,opacity:0.72})));
return world;
}