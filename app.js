const canvas = document.getElementById("noteCanvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("paperStage");
const elementLayer = document.getElementById("elementLayer");
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
  selectedElement: "vector",
  selectedElementNode: null,
  longPressTimer: null,
  longPressFired: false,
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
  elementEditorTitle: document.getElementById("elementEditorTitle"),
  elementLength: document.getElementById("elementLength"),
  elementDirection: document.getElementById("elementDirection"),
  tableRows: document.getElementById("tableRows"),
  tableCols: document.getElementById("tableCols"),
  axisDimension: document.getElementById("axisDimension"),
  elementColor: document.getElementById("elementColor"),
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
  updateElementVisibility();
}

function updateElementVisibility() {
  elementLayer.querySelectorAll(".note-element").forEach((node) => {
    node.hidden = Number(node.dataset.page) !== state.page;
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
  elementLayer.style.transform = `translateX(-50%) scale(${clamped})`;
  canvas.style.marginBottom = `${Math.max(0, (clamped - 1) * 1105)}px`;
  elementLayer.style.marginBottom = `${Math.max(0, (clamped - 1) * 1105)}px`;
  ui.zoomRange.value = Math.round(clamped * 100);
  ui.zoomValue.textContent = `${Math.round(clamped * 100)}%`;
  if (countGesture) state.metrics.zoomGestures += 1;
  updateMetrics();
}

function setSelectedElement(type) {
  state.selectedElement = type;
  ui.elementEditorTitle.textContent = `${elementLabel(type)} 조정`;
}

function elementLabel(type) {
  const labels = {
    axis: "좌표축",
    normal: "정규분포",
    sine: "사인파",
    parabola: "포물선",
    vector: "벡터",
    matrix: "행렬",
    molecule: "분자",
    table: "표",
  };
  return labels[type] || "요소";
}

function selectElementNode(node) {
  if (state.selectedElementNode) {
    state.selectedElementNode.classList.remove("selected");
    state.selectedElementNode.querySelectorAll(".drag-handle").forEach((handle) => handle.remove());
  }
  state.selectedElementNode = node;
  if (!node) return;
  node.classList.add("selected");
  setSelectedElement(node.dataset.type);
  syncEditorFromNode(node);
  if (node.dataset.type === "vector") addVectorHandles(node);
}

function syncEditorFromNode(node) {
  ui.elementLength.value = node.dataset.length || 190;
  ui.elementDirection.value = node.dataset.direction || "right";
  ui.tableRows.value = node.dataset.rows || 3;
  ui.tableCols.value = node.dataset.cols || 3;
  ui.axisDimension.value = node.dataset.dimension || 2;
  ui.elementColor.value = node.dataset.color || "#1f2937";
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
  button.addEventListener("pointerdown", () => {
    state.longPressFired = false;
    state.longPressTimer = setTimeout(() => {
      state.longPressFired = true;
      setSelectedElement(button.dataset.element);
    }, 450);
  });

  button.addEventListener("pointerup", () => {
    clearTimeout(state.longPressTimer);
  });

  button.addEventListener("pointerleave", () => {
    clearTimeout(state.longPressTimer);
  });

  button.addEventListener("click", () => {
    if (state.longPressFired) {
      state.longPressFired = false;
      return;
    }
    saveHistory();
    setSelectedElement(button.dataset.element);
    createEditableElement(button.dataset.element);
    state.metrics.elementCount += 1;
    updateMetrics();
    saveCurrentPage();
  });
});

document.getElementById("insertCustomElementBtn").addEventListener("click", () => {
  const props = {
    length: Number(ui.elementLength.value),
    direction: ui.elementDirection.value,
    rows: Number(ui.tableRows.value),
    cols: Number(ui.tableCols.value),
    dimension: Number(ui.axisDimension.value),
    color: ui.elementColor.value,
  };

  if (state.selectedElementNode) {
    applyElementProps(state.selectedElementNode, props);
  } else {
    createEditableElement(state.selectedElement, props);
    state.metrics.elementCount += 1;
  }
  updateMetrics();
  saveCurrentPage();
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

function createEditableElement(type, options = {}) {
  const props = {
    length: Number(ui.elementLength.value) || 190,
    direction: ui.elementDirection.value || "right",
    rows: Number(ui.tableRows.value) || 3,
    cols: Number(ui.tableCols.value) || 3,
    dimension: Number(ui.axisDimension.value) || 2,
    color: ui.elementColor.value || "#1f2937",
    ...options,
  };
  const node = document.createElement("div");
  node.className = "note-element";
  node.dataset.type = type;
  node.dataset.page = String(state.page);
  node.style.left = `${520 + (state.metrics.elementCount % 3) * 26}px`;
  node.style.top = `${110 + (state.metrics.elementCount % 7) * 86}px`;
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    startElementPress(node, event);
  });
  elementLayer.appendChild(node);
  applyElementProps(node, props);
  selectElementNode(node);
  return node;
}

function startElementPress(node, event) {
  state.longPressFired = false;
  clearTimeout(state.longPressTimer);
  state.longPressTimer = setTimeout(() => {
    state.longPressFired = true;
    selectElementNode(node);
    document.getElementById("drawer-elements").hidden = false;
  }, 420);

  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = parseFloat(node.style.left) || 0;
  const startTop = parseFloat(node.style.top) || 0;
  const move = (moveEvent) => {
    node.style.left = `${startLeft + (moveEvent.clientX - startX) / state.zoom}px`;
    node.style.top = `${startTop + (moveEvent.clientY - startY) / state.zoom}px`;
  };
  const up = () => {
    clearTimeout(state.longPressTimer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (!state.longPressFired) selectElementNode(node);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function applyElementProps(node, props) {
  Object.entries(props).forEach(([key, value]) => {
    node.dataset[key] = String(value);
  });
  renderEditableElement(node);
  selectElementNode(node);
}

function renderEditableElement(node) {
  const type = node.dataset.type;
  const props = {
    length: Number(node.dataset.length) || 190,
    direction: node.dataset.direction || "right",
    rows: Number(node.dataset.rows) || 3,
    cols: Number(node.dataset.cols) || 3,
    dimension: Number(node.dataset.dimension) || 2,
    color: node.dataset.color || "#1f2937",
  };
  node.innerHTML = elementSvg(type, props);
}

function elementSvg(type, props) {
  if (type === "vector") return vectorSvg(props);
  if (type === "table") return tableSvg(props);
  if (type === "matrix") return matrixSvg(props);
  if (type === "axis") return axisSvg(props);
  if (type === "normal") return normalSvg(props);
  if (type === "sine") return sineSvg(props);
  if (type === "parabola") return parabolaSvg(props);
  if (type === "molecule") return moleculeSvg(props);
  return vectorSvg(props);
}

function vectorGeometry(props) {
  const length = props.length || 190;
  const vectors = {
    right: [length, 0],
    left: [-length, 0],
    up: [0, -length],
    down: [0, length],
    diag: [length * 0.82, -length * 0.46],
  };
  const [dx, dy] = vectors[props.direction] || vectors.right;
  const pad = 26;
  const minX = Math.min(0, dx);
  const minY = Math.min(0, dy);
  return {
    sx: pad - minX,
    sy: pad - minY,
    ex: pad - minX + dx,
    ey: pad - minY + dy,
    width: Math.abs(dx) + pad * 2,
    height: Math.abs(dy) + pad * 2,
  };
}

function vectorSvg(props) {
  const g = vectorGeometry(props);
  const markerId = `arrow-${Math.random().toString(36).slice(2)}`;
  return `<svg width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">
    <defs><marker id="${markerId}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${props.color}"/></marker></defs>
    <line x1="${g.sx}" y1="${g.sy}" x2="${g.ex}" y2="${g.ey}" stroke="${props.color}" stroke-width="4" stroke-linecap="round" marker-end="url(#${markerId})"/>
    <text x="${(g.sx + g.ex) / 2 + 8}" y="${(g.sy + g.ey) / 2 - 8}" fill="${props.color}" font-size="18">v</text>
  </svg>`;
}

function tableSvg(props) {
  const rows = Math.max(1, Math.min(8, props.rows || 3));
  const cols = Math.max(1, Math.min(8, props.cols || 3));
  const width = props.length || 220;
  const height = Math.max(64, rows * 32);
  const rowLines = Array.from({ length: rows - 1 }, (_, i) => `<line x1="0" y1="${((i + 1) * height) / rows}" x2="${width}" y2="${((i + 1) * height) / rows}"/>`).join("");
  const colLines = Array.from({ length: cols - 1 }, (_, i) => `<line x1="${((i + 1) * width) / cols}" y1="0" x2="${((i + 1) * width) / cols}" y2="${height}"/>`).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${hexToRgba(props.color, 0.08)}" stroke="${props.color}" stroke-width="3"/>
    <g stroke="${props.color}" stroke-width="2">${rowLines}${colLines}</g>
  </svg>`;
}

function matrixSvg(props) {
  const rows = Math.max(1, Math.min(5, props.rows || 3));
  const cols = Math.max(1, Math.min(5, props.cols || 3));
  const cell = 42;
  const width = cols * cell + 34;
  const height = rows * cell + 20;
  const dots = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      dots.push(`<circle cx="${27 + c * cell}" cy="${18 + r * cell}" r="4" fill="${props.color}" opacity="0.5"/><text x="${20 + c * cell}" y="${35 + r * cell}" fill="${props.color}" opacity="0.35" font-size="11">${r + 1},${c + 1}</text>`);
    }
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <path d="M12 4 H3 V${height - 4} H12" fill="none" stroke="${props.color}" stroke-width="3"/>
    <path d="M${width - 12} 4 H${width - 3} V${height - 4} H${width - 12}" fill="none" stroke="${props.color}" stroke-width="3"/>
    ${dots.join("")}
  </svg>`;
}

function axisSvg(props) {
  const length = props.length || 210;
  const z = props.dimension >= 3 ? `<line x1="34" y1="104" x2="${length * 0.48}" y2="28"/><text x="${length * 0.48 + 6}" y="28" fill="${props.color}" font-size="16">z</text>` : "";
  const y = props.dimension >= 2 ? `<line x1="34" y1="112" x2="34" y2="12"/><text x="12" y="18" fill="${props.color}" font-size="16">y</text>` : "";
  return `<svg width="${length + 32}" height="130" viewBox="0 0 ${length + 32} 130">
    <g stroke="${props.color}" stroke-width="3" stroke-linecap="round">
      <line x1="22" y1="112" x2="${length}" y2="112"/>${y}${z}
    </g>
    <text x="${length + 4}" y="122" fill="${props.color}" font-size="16">x</text>
  </svg>`;
}

function normalSvg(props) {
  const length = props.length || 220;
  const points = [];
  for (let i = 0; i <= length; i += 5) {
    const t = (i - length / 2) / (length / 6.4);
    points.push(`${i},${86 - Math.exp(-0.5 * t * t) * 70}`);
  }
  return `<svg width="${length}" height="100" viewBox="0 0 ${length} 100"><polyline points="${points.join(" ")}" fill="none" stroke="${props.color}" stroke-width="3"/></svg>`;
}

function sineSvg(props) {
  const length = props.length || 220;
  const points = [];
  for (let i = 0; i <= length; i += 5) points.push(`${i},${50 + Math.sin(i / 18) * 30}`);
  return `<svg width="${length}" height="100" viewBox="0 0 ${length} 100"><polyline points="${points.join(" ")}" fill="none" stroke="${props.color}" stroke-width="3"/></svg>`;
}

function parabolaSvg(props) {
  const length = props.length || 190;
  const points = [];
  const half = length / 2;
  for (let i = -half; i <= half; i += 5) points.push(`${half + i},${96 - (i * i) / (length * 0.58)}`);
  return `<svg width="${length}" height="105" viewBox="0 0 ${length} 105"><polyline points="${points.join(" ")}" fill="none" stroke="${props.color}" stroke-width="3"/></svg>`;
}

function moleculeSvg(props) {
  return `<svg width="190" height="120" viewBox="0 0 190 120">
    <g stroke="${props.color}" stroke-width="3" fill="none"><path d="M45 58 L95 26 L145 58 L95 92 Z"/></g>
    <g fill="#fff" stroke="${props.color}" stroke-width="3"><circle cx="45" cy="58" r="11"/><circle cx="95" cy="26" r="11"/><circle cx="145" cy="58" r="11"/><circle cx="95" cy="92" r="11"/></g>
  </svg>`;
}

function addVectorHandles(node) {
  const props = {
    length: Number(node.dataset.length) || 190,
    direction: node.dataset.direction || "right",
    color: node.dataset.color || "#1f2937",
  };
  const g = vectorGeometry(props);
  [
    ["start", g.sx, g.sy],
    ["end", g.ex, g.ey],
  ].forEach(([kind, x, y]) => {
    const handle = document.createElement("button");
    handle.className = "drag-handle";
    handle.dataset.kind = kind;
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
    handle.addEventListener("pointerdown", (event) => startVectorHandleDrag(event, node, kind));
    node.appendChild(handle);
  });
}

function startVectorHandleDrag(event, node, kind) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const startLength = Number(node.dataset.length) || 190;
  const startLeft = parseFloat(node.style.left) || 0;
  const startTop = parseFloat(node.style.top) || 0;
  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / state.zoom;
    const dy = (moveEvent.clientY - startY) / state.zoom;
    const delta = Math.max(Math.abs(dx), Math.abs(dy));
    node.dataset.length = String(Math.max(60, Math.min(320, startLength + delta)));
    if (kind === "start") {
      node.style.left = `${startLeft + dx}px`;
      node.style.top = `${startTop + dy}px`;
    }
    renderEditableElement(node);
    addVectorHandles(node);
    syncEditorFromNode(node);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function drawElement(type, options = {}) {
  const x = 585;
  const y = 86 + (state.metrics.elementCount % 8) * 118;
  const opts = {
    length: 190,
    direction: "right",
    rows: 3,
    cols: 3,
    ...options,
  };
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#1f2937";
  ctx.fillStyle = "#1f2937";
  ctx.lineWidth = 2.6;
  ctx.font = "18px Arial";
  ctx.setLineDash([]);

  if (type === "axis") drawAxis(x, y, opts);
  if (type === "normal") drawNormal(x, y, opts);
  if (type === "sine") drawSine(x, y, opts);
  if (type === "parabola") drawParabola(x, y, opts);
  if (type === "vector") drawVector(x, y, opts);
  if (type === "matrix") drawMatrix(x, y);
  if (type === "molecule") drawMolecule(x, y);
  if (type === "table") drawTable(x, y, opts);

  ctx.restore();
}

function drawAxis(x, y, opts = {}) {
  const length = opts.length || 232;
  ctx.beginPath();
  ctx.moveTo(x, y + 96);
  ctx.lineTo(x + length, y + 96);
  ctx.moveTo(x + 24, y + 112);
  ctx.lineTo(x + 24, y);
  ctx.stroke();
  ctx.fillText("x", x + length - 14, y + 116);
  ctx.fillText("y", x + 4, y + 18);
}

function drawNormal(x, y, opts = {}) {
  const length = opts.length || 230;
  ctx.beginPath();
  ctx.moveTo(x, y + 88);
  for (let i = 0; i <= length; i += 4) {
    const t = (i - length / 2) / (length / 6.4);
    ctx.lineTo(x + i, y + 88 - Math.exp(-0.5 * t * t) * 78);
  }
  ctx.stroke();
}

function drawSine(x, y, opts = {}) {
  const length = opts.length || 230;
  ctx.beginPath();
  for (let i = 0; i <= length; i += 4) {
    const waveY = y + 54 + Math.sin(i / 19) * 32;
    if (i === 0) ctx.moveTo(x + i, waveY);
    else ctx.lineTo(x + i, waveY);
  }
  ctx.stroke();
}

function drawParabola(x, y, opts = {}) {
  const length = opts.length || 188;
  const half = length / 2;
  ctx.beginPath();
  for (let i = -half; i <= half; i += 4) {
    const curveY = y + 100 - (i * i) / (length * 0.58);
    if (i === -half) ctx.moveTo(x + 116 + i, curveY);
    else ctx.lineTo(x + 116 + i, curveY);
  }
  ctx.stroke();
}

function drawVector(x, y, opts = {}) {
  const length = opts.length || 190;
  const direction = opts.direction || "right";
  const vectors = {
    right: [length, 0],
    left: [-length, 0],
    up: [0, -length],
    down: [0, length],
    diag: [length * 0.82, -length * 0.46],
  };
  const [dx, dy] = vectors[direction] || vectors.right;
  const startX = direction === "left" ? x + 212 : x + 22;
  const startY = direction === "up" ? y + 106 : y + 58;
  const endX = startX + dx;
  const endY = startY + dy;
  const angle = Math.atan2(dy, dx);
  const head = 15;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(angle - 0.55), endY - head * Math.sin(angle - 0.55));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(angle + 0.55), endY - head * Math.sin(angle + 0.55));
  ctx.stroke();
  ctx.fillText("v", (startX + endX) / 2 + 6, (startY + endY) / 2 - 8);
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

function drawTable(x, y, opts = {}) {
  const rows = Math.max(1, Math.min(8, opts.rows || 3));
  const cols = Math.max(1, Math.min(8, opts.cols || 3));
  const width = opts.length || 230;
  const height = Math.max(58, rows * 28);
  ctx.strokeRect(x, y, width, height);
  for (let i = 1; i < rows; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x, y + (height / rows) * i);
    ctx.lineTo(x + width, y + (height / rows) * i);
    ctx.stroke();
  }
  for (let i = 1; i < cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + (width / cols) * i, y);
    ctx.lineTo(x + (width / cols) * i, y + height);
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
setSelectedElement("vector");
updateMetrics();
updateBreakStatus();
setInterval(updateElapsed, 1000);
