import { Canvas, Circle, Group, Line, Path, Rect, Skia, type SkPath } from "@shopify/react-native-skia";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { GRID_SPACING, PAPER_HEIGHT, PAPER_WIDTH } from "../constants/paper";
import {
  clamp,
  clampBandPanY,
  clampPointToBand,
  clampPointToPaper,
  createGridLines,
  distance,
  fitBandToStage,
  fitPaperToStage,
  isInsidePaper,
  screenToPage,
  type PaperFrame,
  type StageSize,
} from "../lib/geometry";
import { makeId } from "../lib/notebook";
import { getElementScale, getShapeGeometry } from "../lib/shapePresets";
import type { InkPoint, NoteElement, Page, ShapeGeometry, Stroke, ToolMode } from "../types/ink";

type ToolSettings = {
  tool: ToolMode;
  color: string;
  width: number;
};

export type NavEvent = { type: "pan"; dx: number; dy: number } | { type: "zoom"; from: number; to: number };

type HandwritingCanvasProps = {
  page: Page;
  toolSettings: ToolSettings;
  selectedElementId?: string | null;
  // Variant B: infinite horizontal band instead of the fixed rectangular paper.
  continuous?: boolean;
  onAddStroke: (stroke: Stroke) => void;
  onErasePath: (points: InkPoint[], radius: number) => void;
  onSelectElement?: (elementId: string | null) => void;
  onUpdateElement?: (element: NoteElement) => void;
  onNavigate?: (event: NavEvent) => void;
};

type PanState = {
  x: number;
  y: number;
};

// Corner handles scale uniformly (aspect-locked); edge handles scale one axis
// only (horizontal/vertical compression).
type ResizeHandle = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "left" | "right" | "top" | "bottom";

const CORNER_HANDLES: ResizeHandle[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
const EDGE_HANDLES: ResizeHandle[] = ["left", "right", "top", "bottom"];
const RESIZE_HANDLES: ResizeHandle[] = [...CORNER_HANDLES, ...EDGE_HANDLES];

const isCornerHandle = (handle: ResizeHandle) => CORNER_HANDLES.includes(handle);
const movesLeftEdge = (handle: ResizeHandle) => handle === "topLeft" || handle === "bottomLeft" || handle === "left";
const movesRightEdge = (handle: ResizeHandle) => handle === "topRight" || handle === "bottomRight" || handle === "right";
const movesTopEdge = (handle: ResizeHandle) => handle === "topLeft" || handle === "topRight" || handle === "top";
const movesBottomEdge = (handle: ResizeHandle) => handle === "bottomLeft" || handle === "bottomRight" || handle === "bottom";

// Single-finger interaction the main pan gesture is currently performing.
type Interaction =
  | { mode: "none" }
  | { mode: "draw" }
  | { mode: "move"; base: NoteElement; shape: ShapeGeometry; changed: boolean }
  | { mode: "resize"; handle: ResizeHandle; base: NoteElement; shape: ShapeGeometry; changed: boolean };

const GRID_LINES = createGridLines();
const DEFAULT_LINE = 3;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3.2;
const HANDLE_HIT_PX = 26; // screen px radius for grabbing a resize handle
const BODY_PAD = 8; // page-unit padding so small shapes are easy to grab
const HOLD_MS = 520; // dwell time before a drawn line snaps straight
const HOLD_MOVE_TOL = 6; // page-unit jitter allowed while "holding still"
const MIN_SNAP_LINE = 24; // page-unit minimum length before snapping to a line
const MAX_SNAP_CURVINESS = 1.6; // arcLength / straightDistance ceiling to allow snap

const isDrawingTool = (tool: ToolMode) => tool === "pen" || tool === "highlighter" || tool === "eraser";

function elementBounds(element: NoteElement, shape: ShapeGeometry) {
  const { sx, sy } = getElementScale(element);
  return { x: element.x, y: element.y, w: shape.width * sx, h: shape.height * sy };
}

function pointInElement(element: NoteElement, shape: ShapeGeometry, px: number, py: number, pad: number) {
  const b = elementBounds(element, shape);
  return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
}

function handlePosition(element: NoteElement, shape: ShapeGeometry, handle: ResizeHandle): [number, number] {
  const b = elementBounds(element, shape);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  switch (handle) {
    case "topLeft":
      return [b.x, b.y];
    case "topRight":
      return [b.x + b.w, b.y];
    case "bottomLeft":
      return [b.x, b.y + b.h];
    case "bottomRight":
      return [b.x + b.w, b.y + b.h];
    case "left":
      return [b.x, cy];
    case "right":
      return [b.x + b.w, cy];
    case "top":
      return [cx, b.y];
    case "bottom":
      return [cx, b.y + b.h];
  }
}

function hitHandle(element: NoteElement, shape: ShapeGeometry, px: number, py: number, hitRadius: number): ResizeHandle | null {
  let best: ResizeHandle | null = null;
  let bestDistance = hitRadius;

  for (const handle of RESIZE_HANDLES) {
    const [hx, hy] = handlePosition(element, shape, handle);
    const d = Math.hypot(px - hx, py - hy);

    if (d <= bestDistance) {
      bestDistance = d;
      best = handle;
    }
  }

  return best;
}

// True when the drawn path is roughly straight, so "draw + hold" only snaps
// genuine line attempts, not intentional curves/loops.
function isRoughlyStraight(points: InkPoint[]) {
  if (points.length < 3) {
    return true;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const straight = distance(start, end);

  if (straight < 1) {
    return false;
  }

  let arc = 0;
  for (let index = 1; index < points.length; index += 1) {
    arc += distance(points[index - 1], points[index]);
  }

  return arc / straight < MAX_SNAP_CURVINESS;
}

type CanvasApi = {
  tool: ToolMode;
  frame: PaperFrame | null;
  stage: StageSize | null;
  zoom: number;
  pan: PanState;
  continuous: boolean;
  elements: NoteElement[];
  selectedElementId: string | null;
  onSelect?: (elementId: string | null) => void;
  onUpdate?: (element: NoteElement) => void;
  onNavigate?: (event: NavEvent) => void;
  buildPoint: (event: { x: number; y: number; stylusData?: { pressure?: number; tiltX?: number; tiltY?: number }; pointerType?: unknown }) => InkPoint | null;
  buildDraftStroke: (firstPoint: InkPoint) => Stroke;
  appendPoint: (point: InkPoint) => void;
  finishDraft: () => void;
};

export function HandwritingCanvas({
  page,
  toolSettings,
  selectedElementId,
  continuous = false,
  onAddStroke,
  onErasePath,
  onSelectElement,
  onUpdateElement,
  onNavigate,
}: HandwritingCanvasProps) {
  const [stage, setStage] = useState<StageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);
  const [liveElement, setLiveElement] = useState<NoteElement | null>(null);

  const draftRef = useRef<Stroke | null>(null);
  const liveRef = useRef<NoteElement | null>(null);
  const interactionRef = useRef<Interaction>({ mode: "none" });
  const panStartRef = useRef<PanState>({ x: 0, y: 0 });
  const zoomStartRef = useRef(1);
  const apiRef = useRef<CanvasApi | null>(null);
  // Draw-and-hold straighten state.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdAnchorRef = useRef<InkPoint | null>(null);
  const lineLockRef = useRef(false);

  const frame = useMemo(() => {
    if (!stage) {
      return null;
    }

    const margin = stage.width > 860 ? 54 : 24;
    return continuous ? fitBandToStage(stage, margin) : fitPaperToStage(stage, margin);
  }, [continuous, stage]);

  // Switching variants changes the coordinate model, so start the view fresh.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [continuous]);

  useEffect(() => {
    draftRef.current = null;
    liveRef.current = null;
    interactionRef.current = { mode: "none" };
    lineLockRef.current = false;
    holdAnchorRef.current = null;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setDraftStroke(null);
    setLiveElement(null);
  }, [page.id]);

  const buildPoint = useCallback(
    (event: { x: number; y: number; stylusData?: { pressure?: number; tiltX?: number; tiltY?: number }; pointerType?: unknown }) => {
      if (!frame) {
        return null;
      }

      const rawPoint = screenToPage(event.x, event.y, {
        frame,
        zoom,
        panX: pan.x,
        panY: pan.y,
      });

      // Continuous canvas only bounds the vertical axis (the fixed band height);
      // x extends infinitely so any horizontal position is valid.
      if (continuous) {
        if (rawPoint.y < -42 || rawPoint.y > PAPER_HEIGHT + 42) {
          return null;
        }
      } else if (!isInsidePaper(rawPoint, 42)) {
        return null;
      }

      const pressure = clamp(event.stylusData?.pressure ?? 0.55, 0.12, 1);

      const enriched = {
        ...rawPoint,
        time: Date.now(),
        pressure,
        tiltX: event.stylusData?.tiltX,
        tiltY: event.stylusData?.tiltY,
        pointerType: event.pointerType === undefined ? "touch" : String(event.pointerType),
      };

      return continuous ? clampPointToBand(enriched) : clampPointToPaper(enriched);
    },
    [continuous, frame, pan.x, pan.y, zoom],
  );

  const buildDraftStroke = useCallback(
    (firstPoint: InkPoint): Stroke => {
      const isHighlighter = toolSettings.tool === "highlighter";
      const isEraser = toolSettings.tool === "eraser";

      return {
        id: makeId("stroke"),
        tool: toolSettings.tool,
        color: isEraser ? "#2563eb" : toolSettings.color,
        baseWidth: isEraser ? toolSettings.width : isHighlighter ? Math.max(toolSettings.width * 2.6, 24) : toolSettings.width,
        opacity: isEraser ? 0.24 : isHighlighter ? 0.34 : 1,
        points: [firstPoint],
      };
    },
    [toolSettings.color, toolSettings.tool, toolSettings.width],
  );

  const appendPoint = useCallback((point: InkPoint) => {
    const draft = draftRef.current;

    if (!draft) {
      return;
    }

    const lastPoint = draft.points[draft.points.length - 1];
    const minGap = draft.tool === "eraser" ? 5 : 1;

    if (lastPoint && distance(lastPoint, point) < minGap) {
      return;
    }

    const nextDraft = {
      ...draft,
      points: [...draft.points, point],
    };

    draftRef.current = nextDraft;
    setDraftStroke(nextDraft);
  }, []);

  const finishDraft = useCallback(() => {
    const draft = draftRef.current;
    draftRef.current = null;
    setDraftStroke(null);

    if (!draft || draft.points.length < 2) {
      return;
    }

    if (draft.tool === "eraser") {
      onErasePath(draft.points, draft.baseWidth * 0.5);
      return;
    }

    onAddStroke({
      ...draft,
      points: draft.points,
    });
  }, [onAddStroke, onErasePath]);

  // Live data + callbacks the (stable) gesture handlers read at fire time. This
  // keeps the gesture objects from being rebuilt mid-interaction, which is the
  // class of bug that made dragging unreliable before.
  apiRef.current = {
    tool: toolSettings.tool,
    frame,
    stage,
    zoom,
    pan,
    continuous,
    elements: page.elements ?? [],
    selectedElementId: selectedElementId ?? null,
    onSelect: onSelectElement,
    onUpdate: onUpdateElement,
    onNavigate,
    buildPoint,
    buildDraftStroke,
    appendPoint,
    finishDraft,
  };

  const applyLive = useCallback((element: NoteElement | null) => {
    liveRef.current = element;
    setLiveElement(element);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Fired when the pen has dwelled in place: snap a roughly-straight draft to a
  // clean line from its start to the rest point, then lock it as a line.
  const straightenFromHold = useCallback(() => {
    holdTimerRef.current = null;
    const draft = draftRef.current;
    const anchor = holdAnchorRef.current;
    if (!draft || draft.tool !== "pen" || !anchor || draft.points.length < 2) {
      return;
    }

    const start = draft.points[0];
    if (distance(start, anchor) < MIN_SNAP_LINE || !isRoughlyStraight(draft.points)) {
      return;
    }

    lineLockRef.current = true;
    const snapped = { ...draft, points: [start, anchor] };
    draftRef.current = snapped;
    setDraftStroke(snapped);
  }, []);

  const armHoldTimer = useCallback(() => {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(straightenFromHold, HOLD_MS);
  }, [clearHoldTimer, straightenFromHold]);

  const beginDraw = useCallback(
    (event: { x: number; y: number }) => {
      const api = apiRef.current;
      if (!api) {
        return false;
      }

      const firstPoint = api.buildPoint(event);
      if (!firstPoint) {
        return false;
      }

      lineLockRef.current = false;
      holdAnchorRef.current = firstPoint;
      clearHoldTimer();

      const draft = api.buildDraftStroke(firstPoint);
      draftRef.current = draft;
      setDraftStroke(draft);
      return true;
    },
    [clearHoldTimer],
  );

  const onPanBegin = useCallback(
    (event: { x: number; y: number }) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }

      if (isDrawingTool(api.tool)) {
        interactionRef.current = beginDraw(event) ? { mode: "draw" } : { mode: "none" };
        return;
      }

      // Select / move / resize mode (anything that is not a drawing tool).
      const { frame: viewFrame } = api;
      if (!viewFrame) {
        interactionRef.current = { mode: "none" };
        return;
      }

      const pageScale = viewFrame.scale * api.zoom;
      const point = screenToPage(event.x, event.y, { frame: viewFrame, zoom: api.zoom, panX: api.pan.x, panY: api.pan.y });

      // 1) A resize handle of the currently selected element wins.
      const selected = api.elements.find((element) => element.id === api.selectedElementId);
      if (selected) {
        const shape = getShapeGeometry(selected);
        const handle = hitHandle(selected, shape, point.x, point.y, HANDLE_HIT_PX / pageScale);
        if (handle) {
          interactionRef.current = { mode: "resize", handle, base: selected, shape, changed: false };
          return;
        }
      }

      // 2) Otherwise grab the topmost element under the touch and move it.
      for (let index = api.elements.length - 1; index >= 0; index -= 1) {
        const element = api.elements[index];
        const shape = getShapeGeometry(element);
        if (pointInElement(element, shape, point.x, point.y, BODY_PAD)) {
          if (element.id !== api.selectedElementId) {
            api.onSelect?.(element.id);
          }
          interactionRef.current = { mode: "move", base: element, shape, changed: false };
          return;
        }
      }

      // 3) Empty space → clear selection.
      api.onSelect?.(null);
      interactionRef.current = { mode: "none" };
    },
    [beginDraw],
  );

  const onPanUpdate = useCallback(
    (event: { x: number; y: number; translationX: number; translationY: number }) => {
      const api = apiRef.current;
      const it = interactionRef.current;
      if (!api) {
        return;
      }

      if (it.mode === "draw") {
        const point = api.buildPoint(event);
        if (!point) {
          return;
        }

        if (lineLockRef.current) {
          // Locked to a straight line: keep [start, current] so it stays clean
          // and its end follows the finger until release.
          const draft = draftRef.current;
          if (draft) {
            const snapped = { ...draft, points: [draft.points[0], point] };
            draftRef.current = snapped;
            setDraftStroke(snapped);
          }
          return;
        }

        api.appendPoint(point);

        // Re-arm the dwell timer only on meaningful movement, so small jitter
        // while resting still counts as a hold.
        const anchor = holdAnchorRef.current;
        if (!anchor || distance(anchor, point) > HOLD_MOVE_TOL) {
          holdAnchorRef.current = point;
          armHoldTimer();
        }
        return;
      }

      if (!api.frame || (it.mode !== "move" && it.mode !== "resize")) {
        return;
      }

      const pageScale = api.frame.scale * api.zoom;
      const dx = event.translationX / pageScale;
      const dy = event.translationY / pageScale;

      if (it.mode === "move") {
        const { sx, sy } = getElementScale(it.base);
        const maxX = Math.max(0, PAPER_WIDTH - it.shape.width * sx);
        const maxY = Math.max(0, PAPER_HEIGHT - it.shape.height * sy);
        it.changed = true;
        applyLive({
          ...it.base,
          // Continuous canvas: x is unbounded; only the fixed band height clamps y.
          x: api.continuous ? it.base.x + dx : clamp(it.base.x + dx, 0, maxX),
          y: clamp(it.base.y + dy, 0, maxY),
        });
        return;
      }

      // resize — work in absolute box terms, then derive per-axis scale.
      const { sx: baseSx, sy: baseSy } = getElementScale(it.base);
      const w0 = it.shape.width * baseSx;
      const h0 = it.shape.height * baseSy;
      const handle = it.handle;

      let nextSx = baseSx;
      let nextSy = baseSy;
      let newX = it.base.x;
      let newY = it.base.y;

      if (isCornerHandle(handle)) {
        // Uniform (aspect-locked) scale about the opposite corner.
        const signX = movesRightEdge(handle) ? 1 : -1;
        const signY = movesBottomEdge(handle) ? 1 : -1;
        const ratioW = (w0 + signX * dx) / w0;
        const ratioH = (h0 + signY * dy) / h0;
        const ratioLow = Math.max(MIN_SCALE / baseSx, MIN_SCALE / baseSy);
        const ratioHigh = Math.min(MAX_SCALE / baseSx, MAX_SCALE / baseSy);
        const ratio = clamp(Math.abs(ratioW - 1) >= Math.abs(ratioH - 1) ? ratioW : ratioH, ratioLow, ratioHigh);
        nextSx = baseSx * ratio;
        nextSy = baseSy * ratio;
        if (movesLeftEdge(handle)) {
          newX = it.base.x + (w0 - it.shape.width * nextSx);
        }
        if (movesTopEdge(handle)) {
          newY = it.base.y + (h0 - it.shape.height * nextSy);
        }
      } else if (movesLeftEdge(handle) || movesRightEdge(handle)) {
        // Horizontal compression only.
        const signX = movesRightEdge(handle) ? 1 : -1;
        nextSx = clamp((w0 + signX * dx) / it.shape.width, MIN_SCALE, MAX_SCALE);
        if (movesLeftEdge(handle)) {
          newX = it.base.x + (w0 - it.shape.width * nextSx);
        }
      } else {
        // Vertical compression only.
        const signY = movesBottomEdge(handle) ? 1 : -1;
        nextSy = clamp((h0 + signY * dy) / it.shape.height, MIN_SCALE, MAX_SCALE);
        if (movesTopEdge(handle)) {
          newY = it.base.y + (h0 - it.shape.height * nextSy);
        }
      }

      const newW = it.shape.width * nextSx;
      const newH = it.shape.height * nextSy;

      it.changed = true;
      applyLive({
        ...it.base,
        x: api.continuous ? newX : clamp(newX, 0, Math.max(0, PAPER_WIDTH - newW)),
        y: clamp(newY, 0, Math.max(0, PAPER_HEIGHT - newH)),
        scaleX: nextSx,
        scaleY: nextSy,
      });
    },
    [applyLive, armHoldTimer],
  );

  const onPanEnd = useCallback(() => {
    const api = apiRef.current;
    const it = interactionRef.current;
    if (!api) {
      return;
    }

    if (it.mode === "draw") {
      clearHoldTimer();
      api.finishDraft();
    } else if ((it.mode === "move" || it.mode === "resize") && it.changed && liveRef.current) {
      api.onUpdate?.(liveRef.current);
    }
  }, [clearHoldTimer]);

  const onPanFinalize = useCallback(() => {
    const api = apiRef.current;
    const it = interactionRef.current;

    clearHoldTimer();

    // If the gesture was cancelled before onEnd ran (e.g. a second finger landed),
    // make sure we never leave a dangling draft stroke behind.
    if (it.mode === "draw" && draftRef.current && api) {
      api.finishDraft();
    }

    lineLockRef.current = false;
    holdAnchorRef.current = null;
    interactionRef.current = { mode: "none" };
    if (liveRef.current) {
      applyLive(null);
    }
  }, [applyLive, clearHoldTimer]);

  const mainPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .runOnJS(true)
        .onBegin(onPanBegin)
        .onUpdate(onPanUpdate)
        .onEnd(onPanEnd)
        .onFinalize(onPanFinalize),
    [onPanBegin, onPanUpdate, onPanEnd, onPanFinalize],
  );

  const twoFingerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .runOnJS(true)
        .onBegin(() => {
          panStartRef.current = apiRef.current?.pan ?? { x: 0, y: 0 };
        })
        .onUpdate((event) => {
          const api = apiRef.current;
          const nextX = panStartRef.current.x + event.translationX;
          const nextY = panStartRef.current.y + event.translationY;

          // Continuous canvas pans freely along x but the fixed-height band must
          // stay on screen, so y is clamped to its edges.
          if (api?.continuous && api.frame && api.stage) {
            setPan({ x: nextX, y: clampBandPanY(nextY, api.frame, api.zoom, api.stage) });
            return;
          }

          setPan({ x: nextX, y: nextY });
        })
        .onEnd(() => {
          const end = apiRef.current?.pan;
          if (!end) {
            return;
          }
          const dx = end.x - panStartRef.current.x;
          const dy = end.y - panStartRef.current.y;
          if (Math.hypot(dx, dy) > 2) {
            apiRef.current?.onNavigate?.({ type: "pan", dx, dy });
          }
        }),
    [],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          zoomStartRef.current = apiRef.current?.zoom ?? 1;
        })
        .onUpdate((event) => {
          const nextZoom = clamp(zoomStartRef.current * event.scale, 0.72, 3.4);
          setZoom(nextZoom);

          // Keep the fixed-height band anchored on screen as it scales.
          const api = apiRef.current;
          if (api?.continuous && api.frame && api.stage) {
            const frameRef = api.frame;
            const stageRef = api.stage;
            setPan((current) => ({ x: current.x, y: clampBandPanY(current.y, frameRef, nextZoom, stageRef) }));
          }
        })
        .onEnd(() => {
          const to = apiRef.current?.zoom;
          const from = zoomStartRef.current;
          if (to && Math.abs(to - from) > 0.01) {
            apiRef.current?.onNavigate?.({ type: "zoom", from, to });
          }
        }),
    [],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(mainPanGesture, twoFingerPanGesture, pinchGesture),
    [mainPanGesture, pinchGesture, twoFingerPanGesture],
  );

  const transform = useMemo(() => buildSkiaTransform(frame, zoom, pan), [frame, pan, zoom]);
  const pageScale = frame ? frame.scale * zoom : 1;

  // Continuous canvas grid: regenerated to span the currently visible x range as
  // the band is panned, since there is no fixed paper to pre-tile.
  const continuousGrid = useMemo(() => {
    if (!continuous || !frame || !stage || page.background !== "grid") {
      return null;
    }

    const scale = frame.scale * zoom;
    const leftPage = (0 - frame.x - pan.x) / scale;
    const rightPage = (stage.width - frame.x - pan.x) / scale;
    const startX = Math.floor(leftPage / GRID_SPACING - 1) * GRID_SPACING;
    const endX = Math.ceil(rightPage / GRID_SPACING + 1) * GRID_SPACING;

    const verticals: number[] = [];
    for (let x = startX; x <= endX; x += GRID_SPACING) {
      verticals.push(x);
    }
    const horizontals: number[] = [];
    for (let y = 0; y <= PAPER_HEIGHT; y += GRID_SPACING) {
      horizontals.push(y);
    }

    return { verticals, horizontals, startX, endX };
  }, [continuous, frame, pan.x, page.background, stage, zoom]);

  // Screen-space band fill (full width = the infinite horizontal feel).
  const bandRect = useMemo(() => {
    if (!continuous || !frame || !stage) {
      return null;
    }
    return { y: frame.y + pan.y, height: PAPER_HEIGHT * frame.scale * zoom };
  }, [continuous, frame, pan.y, stage, zoom]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setStage({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  }, []);

  const elements = page.elements ?? [];

  return (
    <View style={styles.shell}>
      <View onLayout={handleLayout} style={styles.gestureLayer}>
        <GestureDetector gesture={composedGesture}>
          <View collapsable={false} style={StyleSheet.absoluteFill}>
            <Canvas style={StyleSheet.absoluteFill}>
              {stage ? <Rect x={0} y={0} width={stage.width} height={stage.height} color="#e9eef3" /> : null}

              {/* Continuous canvas: full-width band fill drawn in screen space. */}
              {continuous && stage && bandRect ? (
                <Rect x={0} y={bandRect.y} width={stage.width} height={bandRect.height} color="#fffdf7" />
              ) : null}

              {frame ? (
                <Group transform={transform}>
                  {continuous ? (
                    continuousGrid
                      ? [
                          ...continuousGrid.verticals.map((x, index) => (
                            <Line
                              color="#d9e9ef"
                              key={`vgrid-${index}`}
                              opacity={0.75}
                              p1={{ x, y: 0 }}
                              p2={{ x, y: PAPER_HEIGHT }}
                              strokeWidth={1.2}
                            />
                          )),
                          ...continuousGrid.horizontals.map((y, index) => (
                            <Line
                              color="#d9e9ef"
                              key={`hgrid-${index}`}
                              opacity={0.75}
                              p1={{ x: continuousGrid.startX, y }}
                              p2={{ x: continuousGrid.endX, y }}
                              strokeWidth={1.2}
                            />
                          )),
                        ]
                      : null
                  ) : (
                    <>
                      <Rect x={10} y={12} width={PAPER_WIDTH} height={PAPER_HEIGHT} color="rgba(15, 23, 42, 0.12)" />
                      <Rect x={0} y={0} width={PAPER_WIDTH} height={PAPER_HEIGHT} color="#fffdf7" />

                      {page.background === "grid"
                        ? GRID_LINES.map((line, index) => (
                            <Line
                              color="#d9e9ef"
                              key={`grid-${index}`}
                              opacity={0.75}
                              p1={{ x: line.x1, y: line.y1 }}
                              p2={{ x: line.x2, y: line.y2 }}
                              strokeWidth={1.2}
                            />
                          ))
                        : null}
                    </>
                  )}

                  {page.strokes.map((stroke) => (
                    <StrokeLayer key={stroke.id} stroke={stroke} />
                  ))}

                  {draftStroke ? <StrokeLayer stroke={draftStroke} /> : null}

                  {elements.map((element) => {
                    const renderElement = liveElement && liveElement.id === element.id ? liveElement : element;
                    return (
                      <ShapeElement
                        element={renderElement}
                        key={element.id}
                        pageScale={pageScale}
                        selected={selectedElementId === element.id}
                      />
                    );
                  })}
                </Group>
              ) : null}
            </Canvas>
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

function ShapeElementBase({ element, selected, pageScale }: { element: NoteElement; selected: boolean; pageScale: number }) {
  const shape = useMemo(() => getShapeGeometry(element), [element]);
  const { sx, sy } = getElementScale(element);

  const paths = useMemo(
    () =>
      shape.strokes.map((stroke) => {
        const path = Skia.Path.Make();
        stroke.points.forEach((point, index) => {
          if (index === 0) {
            path.moveTo(point[0], point[1]);
          } else {
            path.lineTo(point[0], point[1]);
          }
        });
        if (stroke.closed) {
          path.close();
        }
        return { path, width: stroke.width ?? DEFAULT_LINE, color: stroke.color, opacity: stroke.opacity };
      }),
    [shape],
  );

  const transform = useMemo(
    () => [{ translateX: element.x }, { translateY: element.y }, { scaleX: sx }, { scaleY: sy }],
    [element.x, element.y, sx, sy],
  );

  return (
    <>
      <Group transform={transform}>
        {paths.map((entry, index) => (
          <Path
            color={entry.color ?? element.color}
            key={`path-${index}`}
            opacity={entry.opacity ?? 1}
            path={entry.path}
            strokeCap="round"
            strokeJoin="round"
            strokeWidth={entry.width}
            style="stroke"
          />
        ))}
        {(shape.dots ?? []).map((dot, index) => (
          <Circle
            color={dot.color ?? element.color}
            cx={dot.x}
            cy={dot.y}
            key={`dot-${index}`}
            opacity={dot.opacity ?? 1}
            r={dot.r}
          />
        ))}
      </Group>
      {selected ? <SelectionOverlay element={element} pageScale={pageScale} shape={shape} /> : null}
    </>
  );
}

const ShapeElement = memo(ShapeElementBase);

function SelectionOverlay({ element, shape, pageScale }: { element: NoteElement; shape: ShapeGeometry; pageScale: number }) {
  const { x, y, w, h } = elementBounds(element, shape);
  const pad = 6 / pageScale;
  const border = 1.8 / pageScale;
  const outerR = 9 / pageScale;
  const innerR = 6 / pageScale;
  const edgeOuter = 16 / pageScale;
  const edgeInner = 9 / pageScale;

  return (
    <Group>
      <Rect color="#2563eb" height={h + pad * 2} style="stroke" strokeWidth={border} width={w + pad * 2} x={x - pad} y={y - pad} />
      {RESIZE_HANDLES.map((handle) => {
        const [hx, hy] = handlePosition(element, shape, handle);

        // Corners scale uniformly → round handles. Edges scale one axis → square handles.
        if (isCornerHandle(handle)) {
          return (
            <Group key={handle}>
              <Circle color="#ffffff" cx={hx} cy={hy} r={outerR} />
              <Circle color="#2563eb" cx={hx} cy={hy} r={innerR} />
            </Group>
          );
        }

        return (
          <Group key={handle}>
            <Rect color="#ffffff" height={edgeOuter} width={edgeOuter} x={hx - edgeOuter / 2} y={hy - edgeOuter / 2} />
            <Rect color="#2563eb" height={edgeInner} width={edgeInner} x={hx - edgeInner / 2} y={hy - edgeInner / 2} />
          </Group>
        );
      })}
    </Group>
  );
}

function buildSkiaTransform(frame: PaperFrame | null, zoom: number, pan: PanState) {
  if (!frame) {
    return [];
  }

  return [{ translateX: frame.x + pan.x }, { translateY: frame.y + pan.y }, { scale: frame.scale * zoom }];
}

// Smooth curve through the raw points using quadratic segments (each point is a
// control point, segment midpoints are anchors). Single pass, O(n), and — unlike
// an exponential moving average — it introduces no lag, so the ink tracks the pen.
function buildSmoothPath(points: { x: number; y: number }[]): SkPath {
  const path = Skia.Path.Make();

  if (points.length === 0) {
    return path;
  }

  path.moveTo(points[0].x, points[0].y);

  if (points.length < 3) {
    for (let index = 1; index < points.length; index += 1) {
      path.lineTo(points[index].x, points[index].y);
    }
    return path;
  }

  let control = points[0];
  let next = points[1];

  for (let index = 1; index < points.length; index += 1) {
    const midX = (control.x + next.x) / 2;
    const midY = (control.y + next.y) / 2;
    path.quadTo(control.x, control.y, midX, midY);
    control = points[index];
    next = points[index + 1] ?? points[index];
  }

  path.lineTo(control.x, control.y);
  return path;
}

// Memoised so committed strokes never re-render while a new stroke is being drawn.
// The live draft passes a fresh object each frame, so it (and only it) updates.
const StrokeLayer = memo(function StrokeLayer({ stroke }: { stroke: Stroke }) {
  const path = useMemo(() => buildSmoothPath(stroke.points), [stroke.points]);
  const isHighlighter = stroke.tool === "highlighter";
  const isEraser = stroke.tool === "eraser";

  if (stroke.points.length === 1) {
    return (
      <Circle
        blendMode={isHighlighter ? "multiply" : undefined}
        color={stroke.color}
        cx={stroke.points[0].x}
        cy={stroke.points[0].y}
        opacity={stroke.opacity}
        r={stroke.baseWidth / 2}
      />
    );
  }

  return (
    <Path
      blendMode={isHighlighter ? "multiply" : undefined}
      color={stroke.color}
      opacity={isEraser ? stroke.opacity * 0.82 : stroke.opacity}
      path={path}
      strokeCap="round"
      strokeJoin="round"
      strokeWidth={stroke.baseWidth}
      style="stroke"
    />
  );
});

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#e9eef3",
  },
  gestureLayer: {
    flex: 1,
  },
});
