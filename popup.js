"use strict";

// ── Constants ──────────────────────────────────────────────────────────────────

const TREND_VAL   = { "↓": 1, "=": 2, "↑": 3, "↑↑": 4 };
const TREND_CLASS = { "↓": "low", "=": "normal", "↑": "high", "↑↑": "excess" };

// Minimum days with ≥3/4 quadrants covered to enable minute mode for an hour
const MINUTE_MODE_MIN_DAYS = 5;

// ── State ──────────────────────────────────────────────────────────────────────

let schedule  = {};   // { "0": "green", "14": "red", ... }
let history   = [];   // [{ ts: ISO, trend: "↓"|"="|"↑"|"↑↑" }, ...]
let iconMode  = "schedule";
let activePaintColor = null;  // null | "green" | "yellow" | "red"
let isPainting = false;

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  buildScheduleBar();
  buildHistoryBar();
  buildLabels("scheduleLabels");
  buildLabels("historyLabels");
  updateMarkers();
  updateToggleUI();
  startClock();
  bindEvents();
});

// ── Storage ────────────────────────────────────────────────────────────────────

async function loadData() {
  const data = await browser.storage.local.get(["schedule", "history", "iconMode"]);
  schedule = data.schedule || {};
  history  = data.history  || [];
  iconMode = data.iconMode  || "schedule";
}

async function saveSchedule() {
  await browser.storage.local.set({ schedule });
}

async function saveHistory() {
  await browser.storage.local.set({ history });
}

async function saveIconMode() {
  await browser.storage.local.set({ iconMode });
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

function updateScheduleCell(hour) {
  const cell = document.querySelector(`#scheduleBar .cell[data-hour="${hour}"]`);
  if (!cell) return;

  const color = schedule[hour] || null;
  if (color) {
    cell.dataset.color = color;
  } else {
    delete cell.dataset.color;
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

    const minuteMode = isMinuteMode(h);

    if (minuteMode) {
      cell.classList.add("has-subcells");
      for (let q = 0; q < 4; q++) {
        const sub = document.createElement("div");
        sub.className = "subcell";
        const trendClass = getQuadrantTrend(h, q);
        sub.dataset.trend = trendClass;
        cell.appendChild(sub);
      }
    } else {
      const trendClass = getHourTrend(h);
      cell.dataset.trend = trendClass;
    }

    highlightCurrentHour(cell, h);
    bar.appendChild(cell);
  }
}

// Returns trend CSS class for a full hour
function getHourTrend(hour) {
  const entries = history.filter(e => new Date(e.ts).getHours() === hour);
  if (entries.length === 0) return "empty";
  return meanToClass(calcMean(entries));
}

// Returns trend CSS class for a 15-min quadrant (0=0-14, 1=15-29, 2=30-44, 3=45-59)
function getQuadrantTrend(hour, quadrant) {
  const minStart = quadrant * 15;
  const minEnd   = minStart + 14;

  const entries = history.filter(e => {
    const d = new Date(e.ts);
    const m = d.getMinutes();
    return d.getHours() === hour && m >= minStart && m <= minEnd;
  });

  if (entries.length === 0) return "empty";
  return meanToClass(calcMean(entries));
}

// Checks if an hour has enough data to use minute mode
function isMinuteMode(hour) {
  // Group entries by day
  const byDay = {};
  history.forEach(e => {
    const d = new Date(e.ts);
    if (d.getHours() !== hour) return;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay[key]) byDay[key] = new Set();
    byDay[key].add(Math.floor(d.getMinutes() / 15)); // quadrant 0-3
  });

  // Count days where ≥3 quadrants are covered
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
    lbl.textContent = h;
    wrap.appendChild(lbl);
  }
}

// ── Time marker ────────────────────────────────────────────────────────────────

function updateMarkers() {
  const now     = new Date();
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
  const now = new Date();
  if (now.getHours() === hour) {
    cell.classList.add("current-hour");
  }
}

// ── Clock ──────────────────────────────────────────────────────────────────────

function startClock() {
  function tick() {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, "0");
    const mm  = String(now.getMinutes()).padStart(2, "0");
    document.getElementById("entryTime").textContent = `${hh}:${mm}`;
    updateMarkers();
  }
  tick();
  setInterval(tick, 1000);
}

// ── Event bindings ─────────────────────────────────────────────────────────────

function bindEvents() {
  // Icon mode toggle
  document.getElementById("modeSchedule").addEventListener("click", () => setIconMode("schedule"));
  document.getElementById("modeHistory").addEventListener("click",  () => setIconMode("history"));

  // Palette
  document.querySelectorAll(".palette-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".palette-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const raw = btn.dataset.color;
      activePaintColor = (raw === "null") ? null : raw;
    });
  });

  // Paint bar – mouse events
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

  document.addEventListener("mouseup", () => {
    isPainting = false;
  });

  // Save entry
  document.getElementById("saveEntry").addEventListener("click", saveEntryHandler);

  // Export / Import
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", importData);
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

// ── Icon mode ──────────────────────────────────────────────────────────────────

async function setIconMode(mode) {
  iconMode = mode;
  await saveIconMode();
  updateToggleUI();
}

function updateToggleUI() {
  document.getElementById("modeSchedule").classList.toggle("active", iconMode === "schedule");
  document.getElementById("modeHistory").classList.toggle("active",  iconMode === "history");
}

// ── Save entry ─────────────────────────────────────────────────────────────────

async function saveEntryHandler() {
  const trend = document.getElementById("trendSelect").value;
  const entry = { ts: new Date().toISOString(), trend };

  history.push(entry);
  await saveHistory();

  // Rebuild only history bar (schedule bar unchanged)
  buildHistoryBar();

  // Flash the button to confirm
  const btn = document.getElementById("saveEntry");
  btn.classList.add("save-flash");
  setTimeout(() => btn.classList.remove("save-flash"), 400);
}

// ── Export ─────────────────────────────────────────────────────────────────────

function exportData() {
  const payload = JSON.stringify({ schedule, history }, null, 2);
  const blob    = new Blob([payload], { type: "application/json" });
  const url     = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href     = url;
  a.download = `time-tracker-${datestamp()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// ── Import ─────────────────────────────────────────────────────────────────────

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);

      if (parsed.schedule && typeof parsed.schedule === "object") {
        schedule = parsed.schedule;
      }
      if (parsed.history && Array.isArray(parsed.history)) {
        history = parsed.history;
      }

      await browser.storage.local.set({ schedule, history });

      buildScheduleBar();
      buildHistoryBar();
    } catch (err) {
      console.error("Import failed:", err);
      alert("Ошибка импорта: файл повреждён или имеет неверный формат.");
    }
  };
  reader.readAsText(file);

  // Reset input so same file can be re-imported
  e.target.value = "";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}
