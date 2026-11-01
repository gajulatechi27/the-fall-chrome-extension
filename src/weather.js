import * as THREE from "three";

const WEATHER = ["clear","scattered clouds","overcast","mist","light rain","heavy rain","storm","dust haze","golden dusk"];
const clamp = THREE.MathUtils.clamp;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s,1664525)+1013904223)>>>0) / 4294967296);
}
function makeRainLayer(count, color, opacity, spread, depth, length) {
  const positions = new Float32Array(count * 6);
  const random = Math.random;
  for (let i=0;i<count;i++) {
    const k=i*6, x=(random()-.5)*spread, y=(random()-.5)*spread*.65, z=-random()*depth;
    positions[k]=x; positions[k+1]=y; positions[k+2]=z;
    positions[k+3]=x+.45; positions[k+4]=y-length*(.5+random()); positions[k+5]=z+.15;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});
  const lines=new THREE.LineSegments(geometry,material);
  lines.frustumCulled=false;
  return {lines,geometry,material,positions,count,spread,depth,length};
}
export class WeatherSystem {
  constructor(scene, seed, state="clear", quality=1) {
    this.scene=scene; this.random=seeded(seed); this.state=state; this.targetState=state;
    this.wind=new THREE.Vector3(1,0,.28).normalize().multiplyScalar(7+this.random()*12);
    this.group=new THREE.Group(); scene.add(this.group);
    const rainScale=quality<1.1?.55:quality>1.7?1.35:1;
    this.rainLayers=[
      makeRainLayer(Math.round(520*rainScale),0xd7e9f5,.28,90,180,2.2),
      makeRainLayer(Math.round(360*rainScale),0xb9d3e4,.20,180,360,3.8),
      makeRainLayer(Math.round(220*rainScale),0xa9c7dc,.14,300,650,5.4)
    ];
    for(const layer of this.rainLayers){this.group.add(layer.lines);layer.lines.visible=false;}
    this.mistGeometry=new THREE.BufferGeometry();
    const mistCount=90, mistPositions=new Float32Array(mistCount*3);
    for(let i=0;i<mistCount;i++){mistPositions[i*3]=(this.random()-.5)*1800;mistPositions[i*3+1]=(this.random()-.5)*90;mistPositions[i*3+2]=-this.random()*2600;}
    this.mistGeometry.setAttribute("position",new THREE.BufferAttribute(mistPositions,3));
    this.mistMaterial=new THREE.PointsMaterial({color:0xdce8e8,size:18,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
    this.mist=new THREE.Points(this.mistGeometry,this.mistMaterial);this.mist.frustumCulled=false;this.group.add(this.mist);
    this.lightningGroup=new THREE.Group();scene.add(this.lightningGroup);
    this.flashLight=new THREE.PointLight(0xc9e4ff,0,1800,2);scene.add(this.flashLight);
    this.flash=0;this.lightningTimer=5+this.random()*8;this.elapsed=0;this.intensity=0;
    this.whiteout=0;
    this.setState(state);
  }
  setState(state){this.targetState=state;this.state=state;}
  setWhiteout(value){this.whiteout=clamp(value,0,1);}
  update(dt,camera,speed=80) {
    this.elapsed+=dt;
    const rainTarget=this.state==="storm"?1:this.state==="heavy rain"?.82:this.state==="light rain"?.38:0;
    const mistTarget=this.state==="mist"?.55:this.state==="overcast"?.18:0;
    this.intensity=THREE.MathUtils.damp(this.intensity,rainTarget,1.8,dt);
    this.mistMaterial.opacity=THREE.MathUtils.damp(this.mistMaterial.opacity,mistTarget,.7,dt);
    const activeRain=this.intensity>.015;
    for(let l=0;l<this.rainLayers.length;l++){
      const layer=this.rainLayers[l];layer.lines.visible=activeRain;
      layer.material.opacity=this.intensity*[.36,.25,.17][l];
      const a=layer.geometry.attributes.position;
      for(let i=0;i<layer.count;i++){
        const k=i*6, fall=dt*(85+speed*.32)*(1+l*.22);
        for(const j of [1,4])layer.positions[k+j]-=fall;
        for(const j of [0,3])layer.positions[k+j]+=this.wind.x*dt*2.8;
        layer.positions[k+2]+=this.wind.z*dt*2.8;layer.positions[k+5]+=this.wind.z*dt*2.8;
        if(layer.positions[k+1]<-65){
          const x=(this.random()-.5)*layer.spread,y=35+this.random()*75,z=-this.random()*layer.depth;
          layer.positions[k]=x;layer.positions[k+1]=y;layer.positions[k+2]=z;
          layer.positions[k+3]=x+.45;layer.positions[k+4]=y-layer.length;layer.positions[k+5]=z+.15;
        }
      }
      a.needsUpdate=true;
    }
    if(camera){this.group.position.copy(camera.position);this.mist.position.set(camera.position.x,camera.position.y-55,camera.position.z);}
    this.lightningTimer-=dt;
    if(this.state==="storm"&&this.lightningTimer<=0){
      this.spawnLightning(camera);
      this.lightningTimer=4+this.random()*10;
      this.flash=0.9;
    }
    this.flash=THREE.MathUtils.damp(this.flash,0,5,dt);
    this.flashLight.intensity=this.flash*5;
    if(camera)this.flashLight.position.copy(camera.position).add(new THREE.Vector3(0,120,-180));
    this.whiteout=THREE.MathUtils.damp(this.whiteout,0,2.4,dt);
  }
  spawnLightning(camera){
    this.lightningGroup.clear();
    const points=[new THREE.Vector3((this.random()-.5)*500,220+this.random()*80,-850)];
    for(let i=1;i<8;i++){const p=points[i-1];points.push(new THREE.Vector3(p.x+(this.random()-.5)*110,p.y-45-this.random()*55,p.z+(this.random()-.5)*70));}
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const bolt=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xd8efff,transparent:true,opacity:.95}));
    this.lightningGroup.add(bolt);
    if(camera)this.lightningGroup.position.copy(camera.position);
    this.lightningGroup.userData.life=.18;
  }
  dispose(){
    this.scene.remove(this.group,this.lightningGroup,this.flashLight);
    for(const l of this.rainLayers){l.geometry.dispose();l.material.dispose();}
    this.mistGeometry.dispose();this.mistMaterial.dispose();
    this.lightningGroup.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});
  }
}
export { WEATHER };