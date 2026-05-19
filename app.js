const canvas = document.getElementById("noteCanvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("paperStage");
const selectionBox = document.getElementById("selectionBox");
const textComposer = document.getElementById("textComposer");

const pageTemplates = ["blank", "blank", "blank"];
const pageImages = new Map();

const state = {
  tool: "pen",
  previousDrawTool: "pen",
  color: "#1f2937",
  penSize: 4,
  eraserSize: 34,
  zoom: 1,
  page: 0,
  drawing: false,
  lastPoint: null,
  lassoStart: null,
  activePointers: new Map(),
  pinchStartDistance: 0,
  pinchStartZoom: 1,
  history: [],
  startedAt: Date.now(),
  breakSeconds: 25 * 60,
  breakTimer: null,
  metrics: {
    toolSwitches: 0,
    colorSwitches: 0,
    sizeSwitches: 0,
    elementCount: 0,
    lassoCount: 0,
    zoomGestures: 0,
    breakCount: 0,
  },
};

const toolLabels = {
  pen: "펜",
  highlighter: "형광펜",
  eraser: "지우개",
  lasso: "올가미",
  text: "텍스트",
};

const metricEls = Object.fromEntries(
  ["toolSwitches", "colorSwitches", "sizeSwitches", "elementCount", "lassoCount", "zoomGestures", "breakCount", "elapsed"].map((id) => [
    id,
    document.getElementById(id),
  ]),
);

const ui = {
  penSize: document.getElementById("penSize"),
  penSizeValue: document.getElementById("penSizeValue"),
  eraserSize: document.getElementById("eraserSize"),
  eraserSizeValue: document.getElementById("eraserSizeValue"),
  zoomRange: document.getElementById("zoomRange"),
  zoomValue: document.getElementById("zoomValue"),
  breakStatus: document.getElementById("breakStatus"),
  breakHint: document.getElementById("breakHint"),
  templateDialog: document.getElementById("templateDialog"),
};

function setupCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = 920;
  const height = 1240;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  loadPage(0);
}

function saveHistory() {
  if (state.history.length > 35) state.history.shift();
  state.history.push(canvas.toDataURL());
}

function restoreFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, 920, 1240);
    ctx.drawImage(img, 0, 0, 920, 1240);
  };
  img.src = dataUrl;
}

function saveCurrentPage() {
  pageImages.set(state.page, canvas.toDataURL());
}

function loadPage(pageIndex) {
  state.page = pageIndex;
  ctx.clearRect(0, 0, 920, 1240);
  const existing = pageImages.get(pageIndex);
  if (existing) {
    restoreFromDataUrl(existing);
  } else {
    drawTemplate(pageTemplates[pageIndex] || "lecture");
  }
  document.querySelectorAll(".page-thumb").forEach((thumb) => {
    thumb.classList.toggle("active", Number(thumb.dataset.page) === pageIndex);
  });
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 920,
    y: ((event.clientY - rect.top) / rect.height) * 1240,
    screenX: event.clientX,
    screenY: event.clientY,
  };
}

function drawLine(from, to) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = state.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = state.tool === "highlighter" ? hexToRgba(state.color, 0.32) : state.color;
  ctx.lineWidth = state.tool === "eraser" ? state.eraserSize : state.tool === "highlighter" ? state.penSize * 3.2 : state.penSize;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function setTool(nextTool) {
  if (state.tool === nextTool) return;
  if (state.tool !== "eraser") state.previousDrawTool = state.tool;
  state.tool = nextTool;
  if (nextTool !== "eraser") state.previousDrawTool = nextTool;
  state.metrics.toolSwitches += 1;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === nextTool));
  canvas.style.cursor = nextTool === "text" ? "text" : nextTool === "lasso" ? "cell" : "crosshair";
  updateMetrics();
}

function setZoom(nextZoom, countGesture = true) {
  const clamped = Math.min(2.2, Math.max(0.75, nextZoom));
  state.zoom = clamped;
  canvas.style.transform = `scale(${clamped})`;
  ui.zoomRange.value = Math.round(clamped * 100);
  ui.zoomValue.textContent = `${Math.round(clamped * 100)}%`;
  if (countGesture) state.metrics.zoomGestures += 1;
  updateMetrics();
}

function pointerDistance() {
  const points = Array.from(state.activePointers.values());
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (state.activePointers.size === 2) {
    state.drawing = false;
    state.lassoStart = null;
    state.pinchStartDistance = pointerDistance();
    state.pinchStartZoom = state.zoom;
    return;
  }

  const point = pointFromEvent(event);
  if (state.tool === "text") {
    showTextComposer(point, event);
    return;
  }

  saveHistory();
  state.drawing = true;
  state.lastPoint = point;

  if (state.tool === "lasso") {
    state.lassoStart = point;
    positionSelectionBox(point, point);
    selectionBox.hidden = false;
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (state.activePointers.has(event.pointerId)) {
    state.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (state.activePointers.size >= 2) {
    const distance = pointerDistance();
    if (state.pinchStartDistance > 0) setZoom(state.pinchStartZoom * (distance / state.pinchStartDistance));
    return;
  }

  if (!state.drawing || !state.lastPoint) return;
  const next = pointFromEvent(event);

  if (state.tool === "lasso") {
    positionSelectionBox(state.lassoStart, next);
    return;
  }

  drawLine(state.lastPoint, next);
  state.lastPoint = next;
});

function endPointer(event) {
  state.activePointers.delete(event.pointerId);
  if (!state.drawing) return;

  if (state.tool === "lasso") {
    state.metrics.lassoCount += 1;
  }

  state.drawing = false;
  state.lastPoint = null;
  state.lassoStart = null;
  ctx.globalCompositeOperation = "source-over";
  updateMetrics();
  saveCurrentPage();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

stage.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  setZoom(state.zoom + (event.deltaY > 0 ? -0.08 : 0.08));
});

function showTextComposer(point, event) {
  const stageRect = stage.getBoundingClientRect();
  textComposer.style.left = `${event.clientX - stageRect.left}px`;
  textComposer.style.top = `${event.clientY - stageRect.top}px`;
  textComposer.style.display = "block";
  textComposer.value = "";
  textComposer.focus();
  textComposer.dataset.x = String(point.x);
  textComposer.dataset.y = String(point.y);
}

textComposer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const text = textComposer.value.trim();
  if (!text) return;
  saveHistory();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = state.color;
  ctx.font = `${Math.max(18, state.penSize * 5)}px Arial`;
  ctx.fillText(text, Number(textComposer.dataset.x), Number(textComposer.dataset.y));
  ctx.restore();
  textComposer.style.display = "none";
  saveCurrentPage();
});

textComposer.addEventListener("blur", () => {
  if (!textComposer.value.trim()) textComposer.style.display = "none";
});

function positionSelectionBox(a, b) {
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const left = canvasRect.left - stageRect.left + (Math.min(a.x, b.x) / 920) * canvasRect.width;
  const top = canvasRect.top - stageRect.top + (Math.min(a.y, b.y) / 1240) * canvasRect.height;
  const width = (Math.abs(a.x - b.x) / 920) * canvasRect.width;
  const height = (Math.abs(a.y - b.y) / 1240) * canvasRect.height;
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));

document.getElementById("quickToggleBtn").addEventListener("click", () => {
  setTool(state.tool === "eraser" ? state.previousDrawTool : "eraser");
});

document.getElementById("undoBtn").addEventListener("click", () => {
  const previous = state.history.pop();
  if (previous) {
    restoreFromDataUrl(previous);
    saveCurrentPage();
  }
});

document.querySelectorAll("[data-color]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.color === button.dataset.color) return;
    state.color = button.dataset.color;
    state.metrics.colorSwitches += 1;
    document.querySelectorAll("[data-color]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updateMetrics();
  });
});

ui.penSize.addEventListener("input", () => {
  state.penSize = Number(ui.penSize.value);
  ui.penSizeValue.textContent = state.penSize;
});

ui.penSize.addEventListener("change", () => {
  state.metrics.sizeSwitches += 1;
  updateMetrics();
});

ui.eraserSize.addEventListener("input", () => {
  state.eraserSize = Number(ui.eraserSize.value);
  ui.eraserSizeValue.textContent = state.eraserSize;
});

ui.eraserSize.addEventListener("change", () => {
  state.metrics.sizeSwitches += 1;
  updateMetrics();
});

ui.zoomRange.addEventListener("input", () => {
  setZoom(Number(ui.zoomRange.value) / 100, false);
});

document.querySelectorAll("[data-template]").forEach((button) => {
  button.addEventListener("click", () => {
    saveHistory();
    drawTemplate(button.dataset.template);
    pageTemplates[state.page] = button.dataset.template;
    saveCurrentPage();
    document.querySelectorAll("[data-template]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    if (ui.templateDialog.open) ui.templateDialog.close();
  });
});

document.querySelectorAll("[data-element]").forEach((button) => {
  button.addEventListener("click", () => {
    saveHistory();
    drawElement(button.dataset.element);
    state.metrics.elementCount += 1;
    updateMetrics();
    saveCurrentPage();
  });
});

document.querySelectorAll(".page-thumb").forEach((button) => {
  button.addEventListener("click", () => {
    saveCurrentPage();
    loadPage(Number(button.dataset.page));
  });
});

document.getElementById("addPageBtn").addEventListener("click", () => {
  saveCurrentPage();
  const pageIndex = pageTemplates.length;
  pageTemplates.push("blank");
  const button = document.createElement("button");
  button.className = "page-thumb";
  button.dataset.page = String(pageIndex);
  button.innerHTML = `<span>${pageIndex + 1}</span>`;
  button.addEventListener("click", () => {
    saveCurrentPage();
    loadPage(pageIndex);
  });
  document.getElementById("addPageBtn").before(button);
  loadPage(pageIndex);
});

document.getElementById("newNotebookBtn").addEventListener("click", () => {
  ui.templateDialog.showModal();
});

document.getElementById("libraryBtn").addEventListener("click", () => {
  ui.templateDialog.showModal();
});

document.getElementById("addDocTabBtn").addEventListener("click", () => {
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.textContent = "새 문서";
  document.getElementById("addDocTabBtn").before(tab);
});

document.getElementById("fullscreenBtn").addEventListener("click", () => {
  document.body.classList.toggle("focus-mode");
});

document.querySelectorAll(".drawer-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const drawer = document.getElementById(`drawer-${button.dataset.drawer}`);
    const willOpen = drawer.hidden;
    document.querySelectorAll(".floating-drawer").forEach((item) => {
      item.hidden = true;
    });
    drawer.hidden = !willOpen;
  });
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest(".floating-drawer").hidden = true;
  });
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "studyflow-note.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

document.getElementById("imageUpload").addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    addAssetCard(dataUrl, file.name);
  }
  event.target.value = "";
});

document.getElementById("startBreakBtn").addEventListener("click", () => {
  if (state.breakTimer) return;
  state.breakTimer = setInterval(() => {
    state.breakSeconds -= 1;
    if (state.breakSeconds <= 0) {
      state.metrics.breakCount += 1;
      state.breakSeconds = 5 * 60;
      ui.breakHint.textContent = "눈/손 휴식 구간";
      updateMetrics();
    }
    updateBreakStatus();
  }, 1000);
});

document.getElementById("pauseBreakBtn").addEventListener("click", () => {
  clearInterval(state.breakTimer);
  state.breakTimer = null;
});

document.getElementById("resetBreakBtn").addEventListener("click", () => {
  clearInterval(state.breakTimer);
  state.breakTimer = null;
  state.breakSeconds = 25 * 60;
  ui.breakHint.textContent = "집중 필기 구간";
  updateBreakStatus();
});

function drawTemplate(type) {
  ctx.save();
  ctx.clearRect(0, 0, 920, 1240);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(31, 41, 55, 0.26)";
  ctx.fillStyle = "rgba(31, 41, 55, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([8, 7]);
  ctx.font = "700 18px Arial";

  if (type === "blank") {
    ctx.restore();
    return;
  }

  if (type === "lecture") {
    section(44, 44, 510, 1152, "핵심 개념");
    section(586, 44, 290, 360, "도식/그래프");
    section(586, 430, 290, 330, "예시/주의");
    section(586, 786, 290, 410, "질문/복습");
  }

  if (type === "problem") {
    section(44, 44, 832, 210, "문제 조건");
    section(44, 286, 390, 640, "풀이 과정");
    section(468, 286, 408, 640, "계산/그래프");
    section(44, 958, 832, 238, "오답 원인/정리");
  }

  if (type === "lab") {
    section(44, 44, 300, 260, "가설/변수");
    section(376, 44, 500, 260, "실험 조건");
    section(44, 342, 390, 520, "표/측정값");
    section(468, 342, 408, 520, "그래프");
    section(44, 902, 832, 294, "해석/오차");
  }

  ctx.restore();
}

function section(x, y, w, h, label) {
  ctx.strokeRect(x, y, w, h);
  ctx.fillText(label, x + 16, y + 32);
}

function drawElement(type) {
  const x = 585;
  const y = 86 + (state.metrics.elementCount % 8) * 118;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#1f2937";
  ctx.fillStyle = "#1f2937";
  ctx.lineWidth = 2.6;
  ctx.font = "18px Arial";
  ctx.setLineDash([]);

  if (type === "axis") drawAxis(x, y);
  if (type === "normal") drawNormal(x, y);
  if (type === "sine") drawSine(x, y);
  if (type === "parabola") drawParabola(x, y);
  if (type === "circuit") drawCircuit(x, y);
  if (type === "vector") drawVector(x, y);
  if (type === "matrix") drawMatrix(x, y);
  if (type === "molecule") drawMolecule(x, y);
  if (type === "table") drawTable(x, y);

  ctx.restore();
}

function drawAxis(x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y + 96);
  ctx.lineTo(x + 232, y + 96);
  ctx.moveTo(x + 24, y + 112);
  ctx.lineTo(x + 24, y);
  ctx.stroke();
  ctx.fillText("x", x + 218, y + 116);
  ctx.fillText("y", x + 4, y + 18);
}

function drawNormal(x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y + 88);
  for (let i = 0; i <= 230; i += 4) {
    const t = (i - 115) / 36;
    ctx.lineTo(x + i, y + 88 - Math.exp(-0.5 * t * t) * 78);
  }
  ctx.stroke();
}

function drawSine(x, y) {
  ctx.beginPath();
  for (let i = 0; i <= 230; i += 4) {
    const waveY = y + 54 + Math.sin(i / 19) * 32;
    if (i === 0) ctx.moveTo(x + i, waveY);
    else ctx.lineTo(x + i, waveY);
  }
  ctx.stroke();
}

function drawParabola(x, y) {
  ctx.beginPath();
  for (let i = -94; i <= 94; i += 4) {
    const curveY = y + 100 - (i * i) / 110;
    if (i === -94) ctx.moveTo(x + 116 + i, curveY);
    else ctx.lineTo(x + 116 + i, curveY);
  }
  ctx.stroke();
}

function drawCircuit(x, y) {
  ctx.strokeRect(x + 20, y + 18, 198, 80);
  ctx.beginPath();
  ctx.moveTo(x + 62, y + 18);
  ctx.lineTo(x + 76, y + 2);
  ctx.lineTo(x + 90, y + 34);
  ctx.lineTo(x + 104, y + 2);
  ctx.lineTo(x + 118, y + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 172, y + 98, 12, 0, Math.PI * 2);
  ctx.stroke();
}

function drawVector(x, y) {
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 96);
  ctx.lineTo(x + 202, y + 24);
  ctx.lineTo(x + 184, y + 22);
  ctx.moveTo(x + 202, y + 24);
  ctx.lineTo(x + 192, y + 40);
  ctx.stroke();
  ctx.fillText("v", x + 112, y + 52);
}

function drawMatrix(x, y) {
  ctx.fillText("[  a    b  ]", x + 26, y + 44);
  ctx.fillText("[  c    d  ]", x + 26, y + 76);
}

function drawMolecule(x, y) {
  const atoms = [[54, 56], [108, 28], [162, 56], [108, 88]];
  ctx.beginPath();
  ctx.moveTo(x + 54, y + 56);
  ctx.lineTo(x + 108, y + 28);
  ctx.lineTo(x + 162, y + 56);
  ctx.lineTo(x + 108, y + 88);
  ctx.closePath();
  ctx.stroke();
  atoms.forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 11, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawTable(x, y) {
  ctx.strokeRect(x, y, 230, 104);
  for (let i = 1; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x, y + i * 26);
    ctx.lineTo(x + 230, y + i * 26);
    ctx.stroke();
  }
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + i * 76, y);
    ctx.lineTo(x + i * 76, y + 104);
    ctx.stroke();
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addAssetCard(dataUrl, name) {
  const tray = document.getElementById("assetTray");
  const emptyText = tray.querySelector("p");
  if (emptyText) emptyText.remove();
  const button = document.createElement("button");
  button.className = "asset-card";
  button.innerHTML = `<img alt="" src="${dataUrl}" /><span>${name}</span>`;
  button.addEventListener("click", () => insertImageAsset(dataUrl));
  tray.appendChild(button);
}

function insertImageAsset(dataUrl) {
  saveHistory();
  const img = new Image();
  img.onload = () => {
    const maxWidth = 270;
    const maxHeight = 220;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const width = img.width * scale;
    const height = img.height * scale;
    ctx.drawImage(img, 590, 120 + (state.metrics.elementCount % 5) * 48, width, height);
    state.metrics.elementCount += 1;
    updateMetrics();
    saveCurrentPage();
  };
  img.src = dataUrl;
}

function updateMetrics() {
  Object.entries(state.metrics).forEach(([key, value]) => {
    metricEls[key].textContent = value;
  });
}

function updateElapsed() {
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  metricEls.elapsed.textContent = `${minutes}:${seconds}`;
}

function updateBreakStatus() {
  const minutes = String(Math.floor(state.breakSeconds / 60)).padStart(2, "0");
  const seconds = String(state.breakSeconds % 60).padStart(2, "0");
  ui.breakStatus.textContent = `${minutes}:${seconds}`;
}

setupCanvas();
setZoom(1, false);
updateMetrics();
updateBreakStatus();
setInterval(updateElapsed, 1000);
