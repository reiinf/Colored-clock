"use strict";

const COLORS = {
  green:  "#3a7d44",
  yellow: "#a07820",
  red:    "#a03030",
  purple: "#6a3580",
  gray:   "#6a6a6a",
  empty:  "#3a3a3a",
  bg:     "#1a1a1a",
};

const TREND_VAL = { "↓": 1, "=": 2, "↑": 3, "↑↑": 4 };

// ── Setup ──────────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create("tick", { periodInMinutes: 1 });
  updateIcon();
});

browser.runtime.onStartup.addListener(() => {
  browser.alarms.create("tick", { periodInMinutes: 1 });
  updateIcon();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") updateIcon();
});

browser.storage.onChanged.addListener(() => {
  updateIcon();
});

// ── Icon update ────────────────────────────────────────────────────────────────

async function updateIcon() {
  const data = await browser.storage.local.get(
    ["schedule", "history", "iconMode", "clockStyle", "hourFormat"]
  );

  const schedule   = data.schedule   || {};
  const history    = data.history    || [];
  const iconMode   = data.iconMode   || "schedule";
  const clockStyle = data.clockStyle || "hands";
  const hourFormat = data.hourFormat || "24";

  const now  = new Date();
  const hour = now.getHours();

  // Determine ring color
  let color = COLORS.empty;
  if (iconMode === "schedule") {
    color = scheduleColor(schedule[hour] || schedule[String(hour)] || null);
  } else {
    color = historyColorForHour(history, hour);
  }

  const imageData = clockStyle === "digits"
    ? drawDigits(color, now, hourFormat)
    : drawHands(color, now);

  browser.action.setIcon({ imageData });
}

// ── Color helpers ──────────────────────────────────────────────────────────────

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

// ── Draw: clock hands ──────────────────────────────────────────────────────────

function drawHands(color, now) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;

  // Colored ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Dark face
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.bg;
  ctx.fill();

  // Hour hand
  const hours  = now.getHours() % 12 + now.getMinutes() / 60;
  const hAngle = (hours / 12) * Math.PI * 2 - Math.PI / 2;
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

// ── Draw: digits ───────────────────────────────────────────────────────────────

function drawDigits(color, now, hourFormat) {
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2;

  // Fill entire icon square
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  const hh = now.getHours();
  const hourText = (hourFormat === "12")
    ? String(hh % 12 || 12)
    : String(hh).padStart(2, "0");

  // Adaptive text color: dark on light bg, light on dark bg
  ctx.fillStyle = luminance(color) > 0.35 ? "#1a1a1a" : "#ffffff";
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(hourText, cx, cy);

  return ctx.getImageData(0, 0, size, size);
}

// Relative luminance from hex color
function luminance(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
