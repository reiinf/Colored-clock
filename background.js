"use strict";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = {
  green:  "#4CAF50",
  yellow: "#FFC107",
  red:    "#F44336",
  purple: "#9C27B0",
  gray:   "#9E9E9E",
  empty:  "#3a3a3a",
  bg:     "#1a1a1a",
};

const TREND_VAL = { "↓": 1, "=": 2, "↑": 3, "↑↑": 4 };

// ── Alarm setup ────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create("tick", { periodInMinutes: 1 });
  updateIcon();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") updateIcon();
});

browser.storage.onChanged.addListener(() => {
  updateIcon();
});

// On browser start
browser.runtime.onStartup.addListener(() => {
  browser.alarms.create("tick", { periodInMinutes: 1 });
  updateIcon();
});

// ── Icon rendering ─────────────────────────────────────────────────────────────

async function updateIcon() {
  const data = await browser.storage.local.get(["schedule", "history", "iconMode"]);
  const schedule = data.schedule || {};
  const history  = data.history  || [];
  const iconMode = data.iconMode  || "schedule";

  const now  = new Date();
  const hour = now.getHours();

  let color = COLORS.empty;

  if (iconMode === "schedule") {
    color = scheduleColor(schedule[hour] || null);
  } else {
    color = historyColorForHour(history, hour);
  }

  const imageData = drawIcon(color, now);
  browser.browserAction.setIcon({ imageData });
}

function scheduleColor(val) {
  if (val === "green")  return COLORS.green;
  if (val === "yellow") return COLORS.yellow;
  if (val === "red")    return COLORS.red;
  return COLORS.empty;
}

function historyColorForHour(history, hour) {
  const entries = history.filter(e => new Date(e.ts).getHours() === hour);
  if (entries.length === 0) return COLORS.empty;

  const mean = entries.reduce((s, e) => s + (TREND_VAL[e.trend] || 2), 0) / entries.length;
  return trendColor(mean);
}

function trendColor(mean) {
  if (mean > 3.5) return COLORS.purple;
  if (mean > 2.5) return COLORS.red;
  if (mean > 1.5) return COLORS.gray;
  return COLORS.green;
}

function drawIcon(color, now) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 1;

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Clock face inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();

  // Hour hand
  const hours   = now.getHours() % 12 + now.getMinutes() / 60;
  const hAngle  = (hours / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hAngle) * (r - 8), cy + Math.sin(hAngle) * (r - 8));
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Minute hand
  const mins   = now.getMinutes() + now.getSeconds() / 60;
  const mAngle = (mins / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(mAngle) * (r - 5), cy + Math.sin(mAngle) * (r - 5));
  ctx.strokeStyle = "#cccccc";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}
