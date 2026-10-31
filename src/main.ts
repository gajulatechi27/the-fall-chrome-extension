import "./style.css";
import { FallGame } from "./game/FallGame";
const game = new FallGame(document.querySelector<HTMLCanvasElement>("#world")!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const intro=$("intro"), playButton=$("play-button") as HTMLButtonElement, watchButton=$("watch-button") as HTMLButtonElement;
const pauseButton=$("pause-button") as HTMLButtonElement, soundButton=$("sound-button") as HTMLButtonElement;
const eraName=$("era-name"), eraSubtitle=$("era-subtitle"), score=$("score"), distance=$("distance");
const meter=$("fall-meter-fill"), modeLabel=$("mode-label"), transitionTitle=$("transition-title");
const transitionWorld=$("transition-world"), toast=$("toast");
let toastTimer=0;
function showToast(message:string){toast.textContent=message;toast.classList.add("visible");window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast.classList.remove("visible"),1800);}
function start(mode:"play"|"watch"){intro.classList.add("hidden");game.start(mode);modeLabel.textContent=mode==="play"?"INTERACTIVE DESCENT":"AUTOMATIC CINEMATIC";showToast(mode==="play"?"YOU ARE IN CONTROL":"WATCH THE WORLDS UNFOLD");}
playButton.addEventListener("click",()=>start("play"));watchButton.addEventListener("click",()=>start("watch"));
pauseButton.addEventListener("click",()=>{const paused=game.togglePause();pauseButton.textContent=paused?"▶":"Ⅱ";showToast(paused?"PAUSED":"DESCENT RESUMED");});
soundButton.addEventListener("click",()=>{const enabled=game.toggleSound();soundButton.textContent=enabled?"SOUND ON":"SOUND OFF";});
game.onUpdate(state=>{eraName.textContent=state.worldName.toUpperCase();eraSubtitle.textContent=`WORLD ${String(state.worldIndex+1).padStart(2,"0")} / 04`;score.textContent=String(state.score).padStart(6,"0");distance.textContent=`${Math.floor(state.distance).toLocaleString()} m`;meter.style.width=`${Math.min(100,state.worldProgress*100)}%`;if(state.transitioning){transitionWorld.textContent=state.nextWorldName.toUpperCase();transitionTitle.classList.add("visible");}else transitionTitle.classList.remove("visible");});
window.addEventListener("keydown",event=>{if(event.code==="Space"&&!intro.classList.contains("hidden"))return;if(event.code==="Space"){event.preventDefault();const paused=game.togglePause();pauseButton.textContent=paused?"▶":"Ⅱ";}if(event.code==="KeyF"){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&game.isRunning()){game.pause();pauseButton.textContent="▶";}});
window.addEventListener("beforeunload",()=>game.dispose());
