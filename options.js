"use strict";

// ── Export ─────────────────────────────────────────────────────────────────────

async function exportData() {
  const data    = await browser.storage.local.get(["schedule", "history"]);
  const payload = JSON.stringify({
    schedule: data.schedule || {},
    history:  data.history  || []
  }, null, 2);

  const blob = new Blob([payload], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `time-tracker-${datestamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  setStatus("✓ Экспортировано");
}

// ── Import from File object ────────────────────────────────────────────────────

function importFromFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);

      let schedule = {};
      if (parsed.schedule && typeof parsed.schedule === "object") {
        for (const [k, v] of Object.entries(parsed.schedule)) {
          schedule[parseInt(k, 10)] = v;
        }
      }

      let history = [];
      if (parsed.history && Array.isArray(parsed.history)) {
        history = parsed.history;
      }

      await browser.storage.local.set({ schedule, history });

      setDropState("success", "✓ импортировано");
      setStatus(`✓ Загружено: ${history.length} записей истории`);
      setTimeout(() => setDropState("", "или перетащи JSON-файл сюда"), 2500);

    } catch (err) {
      console.error("Import failed:", err);
      setDropState("error", "✗ ошибка: неверный формат файла");
      setStatus("Ошибка импорта. Убедись что файл экспортирован из этого расширения.");
      setTimeout(() => setDropState("", "или перетащи JSON-файл сюда"), 2500);
    }
  };
  reader.readAsText(file);
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setDropState(cls, text) {
  const zone = document.getElementById("dropZone");
  zone.classList.remove("success", "error");
  if (cls) zone.classList.add(cls);
  // Update only the first div inside drop zone (the main text)
  const first = zone.querySelector("div:first-child");
  if (first) first.textContent = text;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function datestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── Event bindings ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("exportBtn").addEventListener("click", exportData);

  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFromFile(file);
    e.target.value = "";
  });

  // Drag & drop — whole page is droppable
  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    document.body.classList.add("drag-over");
  });

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.body.classList.add("drag-over");
  });

  document.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) {
      document.body.classList.remove("drag-over");
    }
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) importFromFile(file);
  });
});
