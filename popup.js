"use strict";

// ── Constants ──────────────────────────────────────────────────────────────────

const TREND_VAL   = { "↓": 1, "=": 2, "↑": 3, "↑↑": 4 };
const MINUTE_MODE_MIN_DAYS = 5;

// ── State ──────────────────────────────────────────────────────────────────────

let schedule    = {};
let history     = [];
let iconMode    = "schedule";
let clockStyle  = "hands";   // "hands" | "digits"
let hourFormat  = "24";      // "24" | "12"
let activePaintColor = null;
let isPainting  = false;

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  rebuildAll();
  updateAllToggles();
  startClock();
  bindEvents();
});

function rebuildAll() {
  buildScheduleBar();
  buildHistoryBar();
  buildLabels("scheduleLabels");
  buildLabels("historyLabels");
  updateMarkers();
}

// ── Storage ────────────────────────────────────────────────────────────────────

async function loadData() {
  const data = await browser.storage.local.get(
    ["schedule", "history", "iconMode", "clockStyle", "hourFormat"]
  );

  const raw = data.schedule || {};
  schedule = {};
  for (const [k, v] of Object.entries(raw)) {
    schedule[parseInt(k, 10)] = v;
  }

  history    = data.history    || [];
  iconMode   = data.iconMode   || "schedule";
  clockStyle = data.clockStyle || "hands";
  hourFormat = data.hourFormat || "24";
}

async function saveSchedule()  { await browser.storage.local.set({ schedule }); }
async function saveHistory()   { await browser.storage.local.set({ history }); }
async function saveIconMode()  { await browser.storage.local.set({ iconMode }); }
async function saveClockStyle(){ await browser.storage.local.set({ clockStyle }); }
async function saveHourFormat(){ await browser.storage.local.set({ hourFormat }); }

// ── Hour formatting ────────────────────────────────────────────────────────────

function formatHourLabel(h) {
  if (hourFormat === "24") return String(h);
  if (h === 0)  return "12";
  if (h <= 11)  return String(h);
  if (h === 12) return "12";
  return String(h - 12);
}

function formatTime(date) {
  const hh = date.getHours();
  const mm  = String(date.getMinutes()).padStart(2, "0");
  if (hourFormat === "24") {
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }
  const period = hh < 12 ? "AM" : "PM";
  const h12    = hh % 12 || 12;
  return `${h12}:${mm} ${period}`;
}

// ── Schedule bar ───────────────────────────────────────────────────────────────

function buildScheduleBar() {
  const bar = document.getElementById("scheduleBar");
  bar.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.hour = h;
    const color = schedule[h] || null;
    if (color) cell.dataset.color = color;
    highlightCurrentHour(cell, h);
    bar.appendChild(cell);
  }
}

// ── History bar ────────────────────────────────────────────────────────────────

function buildHistoryBar() {
  const bar = document.getElementById("historyBar");
  bar.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.hour = h;

    if (isMinuteMode(h)) {
      cell.classList.add("has-subcells");
      for (let q = 0; q < 4; q++) {
        const sub = document.createElement("div");
        sub.className = "subcell";
        sub.dataset.trend = getQuadrantTrend(h, q);
        cell.appendChild(sub);
      }
    } else {
      cell.dataset.trend = getHourTrend(h);
    }

    highlightCurrentHour(cell, h);
    bar.appendChild(cell);
  }
}

function getHourTrend(hour) {
  const entries = history.filter(e => new Date(e.ts).getHours() === hour);
  if (entries.length === 0) return "empty";
  return meanToClass(calcMean(entries));
}

function getQuadrantTrend(hour, quadrant) {
  const minStart = quadrant * 15;
  const minEnd   = minStart + 14;
  const entries  = history.filter(e => {
    const d = new Date(e.ts);
    const m = d.getMinutes();
    return d.getHours() === hour && m >= minStart && m <= minEnd;
  });
  if (entries.length === 0) return "empty";
  return meanToClass(calcMean(entries));
}

function isMinuteMode(hour) {
  const byDay = {};
  history.forEach(e => {
    const d = new Date(e.ts);
    if (d.getHours() !== hour) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay[key]) byDay[key] = new Set();
    byDay[key].add(Math.floor(d.getMinutes() / 15));
  });
  let qualifyingDays = 0;
  for (const day of Object.values(byDay)) {
    if (day.size >= 3) qualifyingDays++;
  }
  return qualifyingDays >= MINUTE_MODE_MIN_DAYS;
}

function calcMean(entries) {
  return entries.reduce((s, e) => s + (TREND_VAL[e.trend] || 2), 0) / entries.length;
}

function meanToClass(mean) {
  if (mean > 3.5) return "excess";
  if (mean > 2.5) return "high";
  if (mean > 1.5) return "normal";
  return "low";
}

// ── Labels ─────────────────────────────────────────────────────────────────────

function buildLabels(containerId) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("div");
    lbl.className = "bar-label";
    lbl.textContent = formatHourLabel(h);
    wrap.appendChild(lbl);
  }
}

// ── Time marker ────────────────────────────────────────────────────────────────

function updateMarkers() {
  const now      = new Date();
  const totalMin = now.getHours() * 60 + now.getMinutes();
  const pct      = (totalMin / (24 * 60)) * 100;
  setMarkerPos("scheduleMarker", pct);
  setMarkerPos("historyMarker",  pct);
}

function setMarkerPos(id, pct) {
  const marker = document.getElementById(id);
  if (marker) marker.style.left = `calc(${pct}% - 1px)`;
}

function highlightCurrentHour(cell, hour) {
  if (new Date().getHours() === hour) cell.classList.add("current-hour");
}

// ── Clock ──────────────────────────────────────────────────────────────────────

function startClock() {
  function tick() {
    const now = new Date();
    document.getElementById("entryTime").textContent = formatTime(now);
    updateMarkers();
  }
  tick();
  setInterval(tick, 1000);
}

// ── Event bindings ─────────────────────────────────────────────────────────────

function bindEvents() {
  // Icon source toggle
  document.getElementById("modeSchedule").addEventListener("click", () => setIconMode("schedule"));
  document.getElementById("modeHistory").addEventListener("click",  () => setIconMode("history"));

  // Clock style toggle
  document.getElementById("styleHands").addEventListener("click",  () => setClockStyle("hands"));
  document.getElementById("styleDigits").addEventListener("click", () => setClockStyle("digits"));

  // Hour format toggle
  document.getElementById("format24").addEventListener("click", () => setHourFormat("24"));
  document.getElementById("format12").addEventListener("click", () => setHourFormat("12"));

  // Palette
  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const raw = btn.dataset.color;
      activePaintColor = (raw === "null") ? null : raw;
    });
  });

  // Paint bar
  const schedBar = document.getElementById("scheduleBar");

  schedBar.addEventListener("mousedown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    isPainting = true;
    paintCell(cell);
  });

  schedBar.addEventListener("mouseover", (e) => {
    if (!isPainting) return;
    const cell = e.target.closest(".cell");
    if (cell) paintCell(cell);
  });

  document.addEventListener("mouseup", () => { isPainting = false; });

  // Save entry
  document.getElementById("saveEntry").addEventListener("click", saveEntryHandler);

  // Export / Import
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
}

// ── Paint ──────────────────────────────────────────────────────────────────────

function paintCell(cell) {
  const hour = parseInt(cell.dataset.hour, 10);
  if (activePaintColor === null) {
    delete schedule[hour];
    delete cell.dataset.color;
  } else {
    schedule[hour] = activePaintColor;
    cell.dataset.color = activePaintColor;
  }
  saveSchedule();
}

// ── Toggles ────────────────────────────────────────────────────────────────────

async function setIconMode(mode) {
  iconMode = mode;
  await saveIconMode();
  updateAllToggles();
}

async function setClockStyle(style) {
  clockStyle = style;
  await saveClockStyle();
  updateAllToggles();
}

async function setHourFormat(fmt) {
  hourFormat = fmt;
  await saveHourFormat();
  // Rebuild labels and clock display
  buildLabels("scheduleLabels");
  buildLabels("historyLabels");
  updateAllToggles();
}

function updateAllToggles() {
  document.getElementById("modeSchedule").classList.toggle("active", iconMode === "schedule");
  document.getElementById("modeHistory").classList.toggle("active",  iconMode === "history");
  document.getElementById("styleHands").classList.toggle("active",   clockStyle === "hands");
  document.getElementById("styleDigits").classList.toggle("active",  clockStyle === "digits");
  document.getElementById("format24").classList.toggle("active",     hourFormat === "24");
  document.getElementById("format12").classList.toggle("active",     hourFormat === "12");
}

// ── Save entry ─────────────────────────────────────────────────────────────────

async function saveEntryHandler() {
  const trend = document.getElementById("trendSelect").value;
  const entry = { ts: new Date().toISOString(), trend };
  history.push(entry);
  await saveHistory();
  buildHistoryBar();

  const btn = document.getElementById("saveEntry");
  btn.classList.add("save-flash");
  setTimeout(() => btn.classList.remove("save-flash"), 400);
}

// ── Export ─────────────────────────────────────────────────────────────────────

function exportData() {
  const payload = JSON.stringify({ schedule, history }, null, 2);
  const blob    = new Blob([payload], { type: "application/json" });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `time-tracker-${datestamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import lives in options.js

// ── Helpers ────────────────────────────────────────────────────────────────────

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, "0"); }
