import "./style.css";
import { FallGame, type GameState } from "./game/FallGame";
const canvas=document.querySelector<HTMLCanvasElement>("#world")!;
const game=new FallGame(canvas);
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const intro=$("intro"),play=$("play-button") as HTMLButtonElement,watch=$("watch-button") as HTMLButtonElement,pause=$("pause-button") as HTMLButtonElement,sound=$("sound-button") as HTMLButtonElement;
const score=$("score"),distance=$("distance"),meter=$("fall-meter-fill"),mode=$("mode-label"),toast=$("toast");
let toastTimer=0;
function notify(message:string){toast.textContent=message;toast.classList.add("visible");clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast.classList.remove("visible"),2400);}
function start(kind:"play"|"watch"){if(!game.start(kind)){notify("Add the rigged skydiver GLB and HDRI assets first — see README.");return;}intro.classList.add("hidden");mode.textContent=kind==="play"?"A/D STEER · S DIVE · W FLARE":"CINEMATIC DESCENT";notify(kind==="play"?"FREEFALL ENGAGED":"CINEMATIC MODE");}
play.addEventListener("click",()=>start("play"));watch.addEventListener("click",()=>start("watch"));
pause.addEventListener("click",()=>{const p=game.togglePause();pause.textContent=p?"▶":"Ⅱ";notify(p?"DESCENT PAUSED":"DESCENT RESUMED");});
sound.addEventListener("click",()=>{const on=game.toggleSound();sound.textContent=on?"SOUND ON":"SOUND OFF";});
game.onUpdate((s:GameState)=>{score.textContent=String(s.score).padStart(6,"0");distance.textContent=Math.max(0,Math.floor(s.altitude)).toLocaleString()+" m";meter.style.width=(100-s.altitude/12000*100).toFixed(1)+"%";if(s.assetError)mode.textContent="MISSING SKYDIVER GLB";else if(s.parachute)mode.textContent="PARACHUTE DEPLOYED";else if(s.modelReady)mode.textContent=Math.round(s.speed)+" KM/H";});
window.addEventListener("keydown",e=>{if(e.code==="Space"&&!intro.classList.contains("hidden"))return;if(e.code==="Space"){e.preventDefault();const p=game.togglePause();pause.textContent=p?"▶":"Ⅱ";}if(e.code==="KeyF"){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}});
window.addEventListener("beforeunload",()=>game.dispose());
