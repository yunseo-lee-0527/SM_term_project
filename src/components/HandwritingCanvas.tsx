import { Canvas, Circle, Group, Line, Rect } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle as SvgCircle, Line as SvgLine, Path, Polygon as SvgPolygon, Polyline, Rect as SvgRect, Text as SvgText } from "react-native-svg";

import { PAPER_HEIGHT, PAPER_WIDTH } from "../constants/paper";
import {
  clamp,
  clampPointToPaper,
  createGridLines,
  distance,
  fitPaperToStage,
  getStrokeWidthAt,
  isInsidePaper,
  prepareStrokePoints,
  screenToPage,
  type PaperFrame,
  type StageSize,
} from "../lib/geometry";
import { makeId } from "../lib/notebook";
import type { InkPoint, NoteElement, Page, Stroke, ToolMode } from "../types/ink";

type ToolSettings = {
  tool: ToolMode;
  color: string;
  width: number;
};

type HandwritingCanvasProps = {
  page: Page;
  toolSettings: ToolSettings;
  selectedElementId?: string | null;
  onAddStroke: (stroke: Stroke) => void;
  onErasePath: (points: InkPoint[], radius: number) => void;
  onSelectElement?: (elementId: string | null) => void;
  onUpdateElement?: (element: NoteElement) => void;
};

type PanState = {
  x: number;
  y: number;
};

const GRID_LINES = createGridLines();

export function HandwritingCanvas({
  page,
  toolSettings,
  selectedElementId,
  onAddStroke,
  onErasePath,
  onSelectElement,
  onUpdateElement,
}: HandwritingCanvasProps) {
  const [stage, setStage] = useState<StageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);

  const draftRef = useRef<Stroke | null>(null);
  const panStartRef = useRef<PanState>({ x: 0, y: 0 });
  const zoomStartRef = useRef(1);

  const frame = useMemo(() => {
    if (!stage) {
      return null;
    }

    return fitPaperToStage(stage, stage.width > 860 ? 54 : 24);
  }, [stage]);

  useEffect(() => {
    draftRef.current = null;
    setDraftStroke(null);
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

      if (!isInsidePaper(rawPoint, 42)) {
        return null;
      }

      const pressure = clamp(event.stylusData?.pressure ?? 0.55, 0.12, 1);

      return clampPointToPaper({
        ...rawPoint,
        time: Date.now(),
        pressure,
        tiltX: event.stylusData?.tiltX,
        tiltY: event.stylusData?.tiltY,
        pointerType: event.pointerType === undefined ? "touch" : String(event.pointerType),
      });
    },
    [frame, pan.x, pan.y, zoom],
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
    const minGap = draft.tool === "eraser" ? 5 : 2.5;

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
      points: prepareStrokePoints(draft.points),
    });
  }, [onAddStroke, onErasePath]);

  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .runOnJS(true)
        .onBegin((event) => {
          if (toolSettings.tool === "lasso" || toolSettings.tool === "text") {
            onSelectElement?.(null);
            return;
          }

          const firstPoint = buildPoint(event);

          if (!firstPoint) {
            return;
          }

          const draft = buildDraftStroke(firstPoint);
          draftRef.current = draft;
          setDraftStroke(draft);
        })
        .onUpdate((event) => {
          const point = buildPoint(event);

          if (point) {
            appendPoint(point);
          }
        })
        .onEnd(finishDraft),
    [appendPoint, buildDraftStroke, buildPoint, finishDraft, onSelectElement, toolSettings.tool],
  );

  const twoFingerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .runOnJS(true)
        .onBegin(() => {
          panStartRef.current = pan;
        })
        .onUpdate((event) => {
          setPan({
            x: panStartRef.current.x + event.translationX,
            y: panStartRef.current.y + event.translationY,
          });
        }),
    [pan],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          zoomStartRef.current = zoom;
        })
        .onUpdate((event) => {
          setZoom(clamp(zoomStartRef.current * event.scale, 0.72, 3.4));
        }),
    [zoom],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(drawGesture, twoFingerPanGesture, pinchGesture),
    [drawGesture, pinchGesture, twoFingerPanGesture],
  );

  const transform = useMemo(() => buildSkiaTransform(frame, zoom, pan), [frame, pan, zoom]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setStage({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  }, []);

  return (
    <View style={styles.shell}>
      <GestureDetector gesture={composedGesture}>
        <View onLayout={handleLayout} style={styles.gestureLayer}>
          <Canvas style={StyleSheet.absoluteFill}>
            {stage ? <Rect x={0} y={0} width={stage.width} height={stage.height} color="#e9eef3" /> : null}

            {frame ? (
              <Group transform={transform}>
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

                {page.strokes.map((stroke) => (
                  <StrokeLayer key={stroke.id} stroke={stroke} />
                ))}

                {draftStroke ? <StrokeLayer stroke={draftStroke} /> : null}
              </Group>
            ) : null}
          </Canvas>
          {frame ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {(page.elements ?? []).map((element) => (
                <EditableElement
                  element={element}
                  frame={frame}
                  isSelected={selectedElementId === element.id}
                  key={element.id}
                  onSelect={() => onSelectElement?.(element.id)}
                  onUpdate={(nextElement) => onUpdateElement?.(nextElement)}
                  pan={pan}
                  zoom={zoom}
                />
              ))}
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

function EditableElement({
  element,
  frame,
  zoom,
  pan,
  isSelected,
  onSelect,
  onUpdate,
}: {
  element: NoteElement;
  frame: PaperFrame;
  zoom: number;
  pan: PanState;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (element: NoteElement) => void;
}) {
  const scale = frame.scale * zoom;
  const left = frame.x + pan.x + element.x * scale;
  const top = frame.y + pan.y + element.y * scale;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: onSelect,
        onPanResponderMove: (_, gesture) => {
          onUpdate({
            ...element,
            x: clamp(element.x + gesture.dx / scale, 0, PAPER_WIDTH - 80),
            y: clamp(element.y + gesture.dy / scale, 0, PAPER_HEIGHT - 80),
          });
        },
      }),
    [element, onSelect, onUpdate, scale],
  );

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.elementShell,
        {
          left,
          top,
          transform: [{ scale }],
        },
        isSelected && styles.selectedElement,
      ]}
    >
      <ElementSvg element={element} />
      {isSelected && element.kind === "vector" ? (
        <>
          <VectorHandle element={element} handle="start" onUpdate={onUpdate} scale={scale} />
          <VectorHandle element={element} handle="end" onUpdate={onUpdate} scale={scale} />
        </>
      ) : null}
    </View>
  );
}

function VectorHandle({
  element,
  handle,
  scale,
  onUpdate,
}: {
  element: NoteElement;
  handle: "start" | "end";
  scale: number;
  onUpdate: (element: NoteElement) => void;
}) {
  const keyX = handle === "start" ? "x1" : "x2";
  const keyY = handle === "start" ? "y1" : "y2";
  const x = element[keyX] ?? (handle === "start" ? 30 : 190);
  const y = element[keyY] ?? (handle === "start" ? 120 : 42);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          onUpdate({
            ...element,
            [keyX]: clamp(x + gesture.dx / scale, 8, 260),
            [keyY]: clamp(y + gesture.dy / scale, 8, 170),
          });
        },
      }),
    [element, keyX, keyY, onUpdate, scale, x, y],
  );

  return <View {...panResponder.panHandlers} style={[styles.vectorHandle, { left: x - 10, top: y - 10 }]} />;
}

function ElementSvg({ element }: { element: NoteElement }) {
  const color = element.color || "#111827";
  if (element.kind === "axis") {
    const length = element.length ?? 210;
    return (
      <Svg height={140} width={length + 40}>
        <SvgLine stroke={color} strokeWidth={3} x1={18} x2={length} y1={118} y2={118} />
        {(element.dimension ?? 2) >= 2 ? <SvgLine stroke={color} strokeWidth={3} x1={34} x2={34} y1={118} y2={18} /> : null}
        {(element.dimension ?? 2) >= 3 ? <SvgLine stroke={color} strokeWidth={3} x1={34} x2={length * 0.52} y1={110} y2={34} /> : null}
        <SvgText fill={color} fontSize={16} x={length + 4} y={126}>x</SvgText>
        {(element.dimension ?? 2) >= 2 ? <SvgText fill={color} fontSize={16} x={12} y={22}>y</SvgText> : null}
        {(element.dimension ?? 2) >= 3 ? <SvgText fill={color} fontSize={16} x={length * 0.52 + 6} y={34}>z</SvgText> : null}
      </Svg>
    );
  }

  if (element.kind === "distribution") {
    const length = element.length ?? 220;
    const points = Array.from({ length: Math.floor(length / 5) + 1 }, (_, i) => {
      const px = i * 5;
      const x = px / length;
      return `${px},${92 - distributionY(x, element.distribution ?? "normal") * 74}`;
    }).join(" ");
    return (
      <Svg height={110} width={length}>
        <SvgLine opacity={0.35} stroke={color} strokeWidth={2} x1={0} x2={length} y1={94} y2={94} />
        <Polyline fill="none" points={points} stroke={color} strokeWidth={3} />
        <SvgText fill={color} fontSize={14} x={6} y={18}>{distributionLabel(element.distribution ?? "normal")}</SvgText>
      </Svg>
    );
  }

  if (element.kind === "function") {
    const length = element.length ?? 220;
    const fn = compileFunction(element.expression ?? "sin(x)");
    const points = Array.from({ length: Math.floor(length / 4) + 1 }, (_, i) => {
      const px = i * 4;
      const x = (px / length) * 8 - 4;
      let rawY = Math.sin(x);
      try {
        rawY = fn(x);
      } catch {
        rawY = Math.sin(x);
      }
      const y = 80 - clamp(rawY, -3.2, 3.2) * 18;
      return `${px},${y}`;
    }).join(" ");
    return (
      <Svg height={150} width={length}>
        <SvgLine opacity={0.35} stroke={color} strokeWidth={1.5} x1={0} x2={length} y1={80} y2={80} />
        <SvgLine opacity={0.35} stroke={color} strokeWidth={1.5} x1={length / 2} x2={length / 2} y1={8} y2={142} />
        <Polyline fill="none" points={points} stroke={color} strokeWidth={3} />
        <SvgText fill={color} fontSize={14} x={6} y={18}>y={element.expression ?? "sin(x)"}</SvgText>
      </Svg>
    );
  }

  if (element.kind === "vector") {
    const x1 = element.x1 ?? 30;
    const y1 = element.y1 ?? 120;
    const x2 = element.x2 ?? 220;
    const y2 = element.y2 ?? 42;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 14;
    const path = `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${x2 - head * Math.cos(angle - 0.55)} ${y2 - head * Math.sin(angle - 0.55)} M ${x2} ${y2} L ${x2 - head * Math.cos(angle + 0.55)} ${y2 - head * Math.sin(angle + 0.55)}`;
    return (
      <Svg height={190} width={290}>
        <Path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth={4} />
        <SvgText fill={color} fontSize={18} x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2 - 8}>v</SvgText>
      </Svg>
    );
  }

  if (element.kind === "matrix") {
    const rows = Math.round(clamp(element.rows ?? 3, 1, 5));
    const cols = Math.round(clamp(element.cols ?? 3, 1, 5));
    const cell = 42;
    const width = cols * cell + 38;
    const height = rows * cell + 22;
    return (
      <Svg height={height} width={width}>
        <Path d={`M12 4 H3 V${height - 4} H12`} fill="none" stroke={color} strokeWidth={3} />
        <Path d={`M${width - 12} 4 H${width - 3} V${height - 4} H${width - 12}`} fill="none" stroke={color} strokeWidth={3} />
        {Array.from({ length: rows * cols }, (_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          return <SvgCircle cx={27 + col * cell} cy={20 + row * cell} fill={color} key={index} opacity={0.5} r={4} />;
        })}
      </Svg>
    );
  }

  if (element.kind === "circle") {
    const r = element.radius ?? 60;
    const size = r * 2 + 20;
    return (
      <Svg height={size} width={size}>
        <SvgCircle cx={r + 10} cy={r + 10} fill="none" r={r} stroke={color} strokeLinecap="round" strokeWidth={4} />
      </Svg>
    );
  }

  if (element.kind === "rect") {
    const w = element.shapeW ?? 120;
    const h = element.shapeH ?? 80;
    return (
      <Svg height={h + 20} width={w + 20}>
        <SvgRect fill="none" height={h} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} width={w} x={10} y={10} />
      </Svg>
    );
  }

  if (element.kind === "triangle") {
    const raw = element.pts ?? [[0, 80], [80, 80], [40, 0]];
    const xs = raw.map(([x]) => x);
    const ys = raw.map(([, y]) => y);
    const w = Math.max(...xs) + 20;
    const h = Math.max(...ys) + 20;
    const pointsStr = raw.map(([x, y]) => `${x + 10},${y + 10}`).join(" ");
    return (
      <Svg height={h} width={w}>
        <SvgPolygon fill="none" points={pointsStr} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} />
      </Svg>
    );
  }

  if (element.kind === "line_drawn") {
    const x1 = element.x1 ?? 0;
    const y1 = element.y1 ?? 0;
    const x2 = element.x2 ?? 100;
    const y2 = element.y2 ?? 0;
    return (
      <Svg height={Math.abs(y2 - y1) + 20} width={Math.abs(x2 - x1) + 20}>
        <SvgLine stroke={color} strokeLinecap="round" strokeWidth={4} x1={x1 + 10} x2={x2 + 10} y1={y1 + 10} y2={y2 + 10} />
      </Svg>
    );
  }

  const rows = Math.round(clamp(element.rows ?? 3, 1, 8));
  const cols = Math.round(clamp(element.cols ?? 3, 1, 8));
  const width = element.length ?? 220;
  const height = Math.max(64, rows * 32);
  return (
    <Svg height={height} width={width}>
      <SvgRect fill={`${color}18`} height={height} stroke={color} strokeWidth={3} width={width} x={0} y={0} />
      {Array.from({ length: rows - 1 }, (_, i) => (
        <SvgLine key={`r-${i}`} stroke={color} strokeWidth={2} x1={0} x2={width} y1={((i + 1) * height) / rows} y2={((i + 1) * height) / rows} />
      ))}
      {Array.from({ length: cols - 1 }, (_, i) => (
        <SvgLine key={`c-${i}`} stroke={color} strokeWidth={2} x1={((i + 1) * width) / cols} x2={((i + 1) * width) / cols} y1={0} y2={height} />
      ))}
    </Svg>
  );
}

function distributionY(x: number, type: string) {
  if (type === "uniform") return 0.62;
  if (type === "exponential") return Math.exp(-4 * x);
  if (type === "bimodal") return 0.9 * Math.exp(-90 * (x - 0.32) ** 2) + 0.75 * Math.exp(-90 * (x - 0.72) ** 2);
  if (type === "skewed") return 1.25 * x ** 2.2 * Math.exp(-2.8 * x) * 5;
  return Math.exp(-0.5 * ((x - 0.5) / 0.17) ** 2);
}

function distributionLabel(type: string) {
  return (
    {
      normal: "Normal",
      uniform: "Uniform",
      exponential: "Exponential",
      bimodal: "Bimodal",
      skewed: "Skewed",
    }[type] ?? "Distribution"
  );
}

function compileFunction(expression: string) {
  const normalized = expression
    .replace(/Math\./g, "")
    .replace(/\^/g, "**")
    .replace(/\b(sin|cos|tan|sqrt|abs|log|exp|pow|min|max)\b/g, "Math.$1")
    .replace(/\bpi\b/gi, "Math.PI")
    .replace(/\be\b/g, "Math.E");

  try {
    return Function("x", `"use strict"; return (${normalized});`) as (x: number) => number;
  } catch {
    return (x: number) => Math.sin(x);
  }
}

function buildSkiaTransform(frame: PaperFrame | null, zoom: number, pan: PanState) {
  if (!frame) {
    return [];
  }

  return [{ translateX: frame.x + pan.x }, { translateY: frame.y + pan.y }, { scale: frame.scale * zoom }];
}

function StrokeLayer({ stroke }: { stroke: Stroke }) {
  const points = useMemo(() => prepareStrokePoints(stroke.points), [stroke.points]);
  const renderStroke = { ...stroke, points };
  const isHighlighter = stroke.tool === "highlighter";
  const isEraser = stroke.tool === "eraser";

  if (points.length === 1) {
    const radius = getStrokeWidthAt(renderStroke, 0) / 2;

    return (
      <Circle
        blendMode={isHighlighter ? "multiply" : undefined}
        color={stroke.color}
        cx={points[0].x}
        cy={points[0].y}
        opacity={stroke.opacity}
        r={radius}
      />
    );
  }

  return (
    <Group blendMode={isHighlighter ? "multiply" : undefined} opacity={stroke.opacity}>
      {points.slice(1).map((point, index) => (
        <Line
          color={stroke.color}
          key={`${stroke.id}-${index}`}
          opacity={isEraser ? 0.82 : 1}
          p1={{ x: points[index].x, y: points[index].y }}
          p2={{ x: point.x, y: point.y }}
          strokeCap="round"
          strokeJoin="round"
          strokeWidth={getStrokeWidthAt(renderStroke, index + 1)}
        />
      ))}
    </Group>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#e9eef3",
  },
  gestureLayer: {
    flex: 1,
  },
  elementShell: {
    position: "absolute",
  },
  selectedElement: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#2563eb",
    borderRadius: 10,
  },
  vectorHandle: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#2563eb",
  },
});
