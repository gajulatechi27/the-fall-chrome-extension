const form=document.getElementById("form");
const ion=document.getElementById("ion");
const quality=document.getElementById("quality");
const buildings=document.getElementById("buildings");
const saved=document.getElementById("saved");
async function get(){
  if(globalThis.chrome?.storage?.local)return chrome.storage.local.get(["cesiumIonToken","fallQuality","osmBuildings"]);
  return {cesiumIonToken:localStorage.getItem("cesiumIonToken"),fallQuality:localStorage.getItem("fallQuality")||"medium",osmBuildings:localStorage.getItem("osmBuildings")!=="false"};
}
async function set(values){
  if(globalThis.chrome?.storage?.local)return chrome.storage.local.set(values);
  Object.entries(values).forEach(([key,value])=>localStorage.setItem(key,String(value)));
}
async function init(){
  const values=await get();
  ion.value=values.cesiumIonToken||"";
  quality.value=values.fallQuality||"medium";
  buildings.checked=values.osmBuildings!==false;
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    try{
      await set({cesiumIonToken:ion.value.trim(),fallQuality:quality.value,osmBuildings:buildings.checked});
      saved.textContent="Saved locally. Open a new tab to apply token changes.";
    }catch(error){
      console.error("Could not save settings:",error);
      saved.textContent="Settings could not be saved. Check Chrome storage permissions.";
    }
  });
}
init().catch(error=>{
  console.error("THE FALL settings initialization failed:",error);
  saved.textContent="Could not load settings. Refresh this page.";
});
