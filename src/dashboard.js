const $ = (selector) => document.querySelector(selector);
const state = { tasks: [], notes: "", bookmarks: [], focusMinutes: 25, breakMinutes: 5, secondsLeft: 25 * 60, timer: null, mode: "focus", running: false, streak: 0, lastFocusDate: "", weather: null };

const todayKey = () => new Date().toLocaleDateString("en-CA");
const pad = (value) => String(value).padStart(2, "0");
const formatTime = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const storage = {
  async get(key, fallback) {
    try {
      if (globalThis.chrome?.storage?.local) {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? fallback;
      }
    } catch (error) { console.info("Chrome storage unavailable; using local preview storage.", error); }
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  async set(key, value) {
    try {
      if (globalThis.chrome?.storage?.local) return await chrome.storage.local.set({ [key]: value });
    } catch (error) { console.info("Chrome storage unavailable; using local preview storage.", error); }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn("Could not save dashboard data.", error); }
  }
};

function renderClock() {
  const now = new Date();
  $("#dash-time").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  $("#dash-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("#dash-greeting").textContent = now.getHours() < 12 ? "GOOD MORNING" : now.getHours() < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

async function saveTasks() { await storage.set("theFallTasks", state.tasks); }
function renderTasks() {
  const list = $("#task-list");
  list.replaceChildren();
  if (!state.tasks.length) {
    const empty = document.createElement("li"); empty.className = "empty-state"; empty.textContent = "Nothing on your list. Add one thing to get moving."; list.append(empty);
  }
  state.tasks.forEach((task) => {
    const li = document.createElement("li"); li.className = "task-row";
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = task.done; check.setAttribute("aria-label", "Complete task");
    check.addEventListener("change", async () => { task.done = check.checked; await saveTasks(); renderTasks(); });
    const label = document.createElement("span"); label.textContent = task.text; label.className = task.done ? "task-done" : "";
    const remove = document.createElement("button"); remove.className = "icon-button"; remove.type = "button"; remove.textContent = "×"; remove.title = "Delete task";
    remove.addEventListener("click", async () => { state.tasks = state.tasks.filter((item) => item.id !== task.id); await saveTasks(); renderTasks(); });
    li.append(check, label, remove); list.append(li);
  });
  $("#task-count").textContent = `${state.tasks.filter((task) => !task.done).length} remaining`;
}

async function saveBookmarks() { await storage.set("theFallBookmarks", state.bookmarks); }
function renderBookmarks() {
  const list = $("#bookmark-list"); list.replaceChildren();
  if (!state.bookmarks.length) {
    const empty = document.createElement("li"); empty.className = "empty-state"; empty.textContent = "Add the sites you open every day."; list.append(empty);
  }
  state.bookmarks.forEach((bookmark) => {
    const li = document.createElement("li"); li.className = "bookmark-row";
    const link = document.createElement("a"); link.href = bookmark.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = bookmark.title;
    const remove = document.createElement("button"); remove.className = "icon-button"; remove.type = "button"; remove.textContent = "×"; remove.title = "Remove bookmark";
    remove.addEventListener("click", async () => { state.bookmarks = state.bookmarks.filter((item) => item.id !== bookmark.id); await saveBookmarks(); renderBookmarks(); });
    li.append(link, remove); list.append(li);
  });
}

function updateTimerUI() {
  $("#timer-value").textContent = formatTime(state.secondsLeft);
  $("#timer-mode").textContent = state.mode === "focus" ? "FOCUS SESSION" : "SHORT BREAK";
  $("#timer-toggle").textContent = state.running ? "Pause" : state.secondsLeft === (state.mode === "focus" ? state.focusMinutes : state.breakMinutes) * 60 ? "Start focus" : "Resume";
  $("#timer-progress").style.width = `${100 * (1 - state.secondsLeft / ((state.mode === "focus" ? state.focusMinutes : state.breakMinutes) * 60))}%`;
}
function stopTimer() { if (state.timer) clearInterval(state.timer); state.timer = null; state.running = false; }
async function completeFocus() {
  const today = todayKey();
  if (state.lastFocusDate !== today) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toLocaleDateString("en-CA");
    state.streak = state.lastFocusDate === yesterdayKey ? state.streak + 1 : 1;
    state.lastFocusDate = today;
    await storage.set("theFallStreak", { count: state.streak, lastDate: today });
  }
  $("#streak-count").textContent = state.streak;
  $("#timer-status").textContent = "Focus complete. Take a short break.";
}
function switchMode(mode) {
  stopTimer(); state.mode = mode; state.secondsLeft = (mode === "focus" ? state.focusMinutes : state.breakMinutes) * 60; updateTimerUI();
}
function startTimer() {
  if (state.running) { stopTimer(); updateTimerUI(); return; }
  state.running = true;
  if (state.mode === "focus" && state.secondsLeft === state.focusMinutes * 60) {
    window.dispatchEvent(new CustomEvent("thefall:focus-start"));
    $("#timer-status").textContent = "Your descent has started. Stay focused.";
  }
  state.timer = setInterval(async () => {
    state.secondsLeft = Math.max(0, state.secondsLeft - 1);
    updateTimerUI();
    if (state.secondsLeft === 0) {
      stopTimer();
      if (state.mode === "focus") { await completeFocus(); switchMode("break"); }
      else { $("#timer-status").textContent = "Break finished. Ready for another focus session?"; switchMode("focus"); }
    }
  }, 1000);
  updateTimerUI();
}

async function lookupWeather() {
  const city = $("#weather-city").value.trim();
  if (!city) { $("#weather-status").textContent = "Enter a city to check the weather."; return; }
  $("#weather-status").textContent = "Checking the sky…";
  $("#weather-result").hidden = true;
  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.search = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("Location lookup failed");
    const geo = await geoResponse.json();
    if (!geo.results?.length) throw new Error("City not found. Try another spelling.");
    const place = geo.results[0];
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m", daily: "temperature_2m_max,temperature_2m_min", timezone: "auto" });
    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw new Error("Weather service unavailable");
    const weather = await weatherResponse.json();
    const codes = {0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy showers",95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with hail"};
    $("#weather-place").textContent = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    $("#weather-temp").textContent = `${Math.round(weather.current.temperature_2m)}°`;
    $("#weather-description").textContent = codes[weather.current.weather_code] || "Current conditions";
    $("#weather-details").textContent = `Feels like ${Math.round(weather.current.apparent_temperature)}° · Wind ${Math.round(weather.current.wind_speed_10m)} km/h · Humidity ${weather.current.relative_humidity_2m}%`;
    $("#weather-result").hidden = false;
    $("#weather-status").textContent = "Updated just now · Open-Meteo";
    await storage.set("theFallWeatherCity", city);
  } catch (error) { $("#weather-status").textContent = error.message || "Couldn't load weather. Try again."; }
}

async function initDashboard() {
  state.tasks = await storage.get("theFallTasks", []);
  state.notes = await storage.get("theFallNotes", "");
  state.bookmarks = await storage.get("theFallBookmarks", []);
  const streak = await storage.get("theFallStreak", { count: 0, lastDate: "" });
  state.streak = streak.count || 0; state.lastFocusDate = streak.lastDate || "";
  const savedCity = await storage.get("theFallWeatherCity", "");
  $("#notes-input").value = state.notes; $("#weather-city").value = savedCity;
  $("#streak-count").textContent = state.streak;
  renderTasks(); renderBookmarks(); renderClock(); updateTimerUI();
  setInterval(renderClock, 1000);

  $("#task-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const input = $("#task-input"); const text = input.value.trim(); if (!text) return;
    state.tasks.unshift({ id: crypto.randomUUID(), text, done: false }); input.value = ""; await saveTasks(); renderTasks();
  });
  let notesSave;
  $("#notes-input").addEventListener("input", () => {
    state.notes = $("#notes-input").value; $("#notes-status").textContent = "Saving…";
    clearTimeout(notesSave); notesSave = setTimeout(async () => { await storage.set("theFallNotes", state.notes); $("#notes-status").textContent = "Saved"; }, 450);
  });
  $("#bookmark-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const title = $("#bookmark-title").value.trim(); let url = $("#bookmark-url").value.trim();
    if (!title || !url) return; if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); state.bookmarks.push({ id: crypto.randomUUID(), title, url: parsed.href }); await saveBookmarks(); renderBookmarks(); $("#bookmark-title").value = ""; $("#bookmark-url").value = ""; }
    catch { $("#bookmark-status").textContent = "Enter a valid website address."; }
  });
  $("#timer-toggle").addEventListener("click", startTimer);
  $("#timer-reset").addEventListener("click", () => { stopTimer(); switchMode(state.mode); $("#timer-status").textContent = "Timer reset."; });
  $("#weather-form").addEventListener("submit", (event) => { event.preventDefault(); lookupWeather(); });
  $("#dashboard-hide").addEventListener("click", () => document.body.classList.toggle("dashboard-minimized"));
  $("#dashboard-show").addEventListener("click", () => document.body.classList.remove("dashboard-minimized"));
}
initDashboard();
