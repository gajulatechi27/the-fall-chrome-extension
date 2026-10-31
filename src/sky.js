import * as THREE from "three";
import {RGBELoader} from "three/addons/loaders/RGBELoader.js";
export function createSky(scene,renderer,seed){
 const skyGeo=new THREE.SphereGeometry(1800,48,32);
 const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sunDirection:{value:new THREE.Vector3(-.5,.55,-.7)},horizon:{value:new THREE.Color(0xd4c5ae)},zenith:{value:new THREE.Color(0x244766)},sunColor:{value:new THREE.Color(0xffd5a1)}},vertexShader:`varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDirection;uniform vec3 sunDirection,horizon,zenith,sunColor;void main(){float h=clamp(vDirection.y*.5+.5,0.,1.);vec3 c=mix(horizon,zenith,smoothstep(.2,.88,h));float g=pow(max(dot(normalize(vDirection),normalize(sunDirection)),0.),18.);float disk=pow(max(dot(normalize(vDirection),normalize(sunDirection)),0.),380.);c+=sunColor*(g*.38+disk*2.);gl_FragColor=vec4(c,1.);}`});
 const sky=new THREE.Mesh(skyGeo,skyMat);scene.add(sky);
 scene.add(new THREE.HemisphereLight(0xdcecff,0x52604c,1.6));
 const angle=(seed%6283)/1000;const sun=new THREE.DirectionalLight(0xffdfbd,2.8);sun.position.set(Math.cos(angle)*260,180+(seed%80),Math.sin(angle)*260);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
 let environment;
 const loader=new RGBELoader();loader.load("/assets/toposcope_sunset_1k.hdr",hdr=>{hdr.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromEquirectangular(hdr).texture;scene.environment=environment;hdr.dispose();pmrem.dispose();},undefined,()=>console.info("Optional local HDRI not found; gradient sky remains active."));
 return{update(){},dispose(){scene.remove(sky,sun);skyGeo.dispose();skyMat.dispose();environment?.dispose();}};
}