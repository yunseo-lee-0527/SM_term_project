import { Canvas, Circle, Group, Line, Rect } from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

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
import type { InkPoint, Page, Stroke, ToolMode } from "../types/ink";

type ToolSettings = {
  tool: ToolMode;
  color: string;
  width: number;
};

type HandwritingCanvasProps = {
  page: Page;
  toolSettings: ToolSettings;
  onAddStroke: (stroke: Stroke) => void;
  onErasePath: (points: InkPoint[], radius: number) => void;
};

type PanState = {
  x: number;
  y: number;
};

const GRID_LINES = createGridLines();

export function HandwritingCanvas({
  page,
  toolSettings,
  onAddStroke,
  onErasePath,
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
        baseWidth: isEraser ? Math.max(toolSettings.width * 4.2, 32) : isHighlighter ? Math.max(toolSettings.width * 2.6, 24) : toolSettings.width,
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
    [appendPoint, buildDraftStroke, buildPoint, finishDraft],
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
        </View>
      </GestureDetector>
    </View>
  );
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
});
