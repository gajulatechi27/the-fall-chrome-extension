import "./style.css";
import { FallGame } from "./game/FallGame";
const game=new FallGame(document.querySelector<HTMLCanvasElement>("#world")!);
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const intro=$("intro"),play=$("play-button") as HTMLButtonElement,watch=$("watch-button") as HTMLButtonElement,pause=$("pause-button") as HTMLButtonElement,sound=$("sound-button") as HTMLButtonElement;
const score=$("score"),distance=$("distance"),meter=$("fall-meter-fill"),mode=$("mode-label"),toast=$("toast");
let toastTimer=0;
function notify(message:string){toast.textContent=message;toast.classList.add("visible");clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast.classList.remove("visible"),1700);}
function start(kind:"play"|"watch"){intro.classList.add("hidden");game.start(kind);mode.textContent=kind==="play"?"INTERACTIVE FREEFALL":"CINEMATIC DESCENT";notify(kind==="play"?"YOU ARE IN CONTROL":"ENJOY THE VIEW");}
play.addEventListener("click",()=>start("play"));watch.addEventListener("click",()=>start("watch"));
pause.addEventListener("click",()=>{const p=game.togglePause();pause.textContent=p?"▶":"Ⅱ";notify(p?"DESCENT PAUSED":"DESCENT RESUMED");});
sound.addEventListener("click",()=>{const on=game.toggleSound();sound.textContent=on?"SOUND ON":"SOUND OFF";});
game.onUpdate(s=>{score.textContent=String(s.score).padStart(6,"0");distance.textContent=Math.floor(s.distance).toLocaleString()+" m";meter.style.width=(s.worldProgress*100).toFixed(1)+"%";});
window.addEventListener("keydown",e=>{if(e.code==="Space"&&!intro.classList.contains("hidden"))return;if(e.code==="Space"){e.preventDefault();const p=game.togglePause();pause.textContent=p?"▶":"Ⅱ";}if(e.code==="KeyF"){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&game.isRunning()){game.pause();pause.textContent="▶";}});
window.addEventListener("beforeunload",()=>game.dispose());