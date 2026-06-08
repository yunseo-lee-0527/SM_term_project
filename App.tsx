import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";

import { HandwritingCanvas } from "./src/components/HandwritingCanvas";
import { PageStrip } from "./src/components/PageStrip";
import { SessionSetupModal, type SessionSetup } from "./src/components/SessionSetupModal";
import { Toolbar } from "./src/components/Toolbar";
import { splitStrokeByEraserPath, strokeIntersectsEraserPath } from "./src/lib/geometry";
import {
  appendElement,
  appendStroke,
  createInitialNotebook,
  createPage,
  getActivePage,
  makeId,
  pushHistory,
  redoInkAction,
  removeElements,
  removePage,
  removeStrokes,
  replaceStrokes,
  undoInkAction,
  updateElement,
} from "./src/lib/notebook";
import { elementIntersectsEraserPath, getElementScale, getShapeGeometry, withShapeGeometry } from "./src/lib/shapePresets";
import { endSession, exportCurrentSessionJson, hydrateLog, logEvent, startSession } from "./src/lib/sessionLog";
import { loadNotebook, saveNotebook } from "./src/lib/storage";
import { DEFAULT_VARIANT, featuresForVariant, variantFromCondition, type AppVariant } from "./src/constants/variant";
import type { ElementKind, HistoryState, InkPoint, NoteElement, Notebook, Stroke, ToolMode } from "./src/types/ink";

const INITIAL_HISTORY: HistoryState = { done: [], undone: [] };
const DEFAULT_INK_COLOR = "#111827";

type ShapeInsertKind =
  | "normal_curve"
  | "hyperbola"
  | "exp_decay"
  | "log_curve"
  | "sin_curve"
  | "tan_curve"
  | "semicircle"
  | "quadrant"
  | "matrix"
  | "table"
  | "determinant";

type ShapeGroup = {
  title: string;
  items: ShapeInsertKind[];
};

const SHAPE_GROUPS: ShapeGroup[] = [
  {
    title: "Note 1 set",
    items: ["normal_curve", "exp_decay", "sin_curve", "semicircle", "matrix"],
  },
  {
    title: "Note 2 set",
    items: ["hyperbola", "log_curve", "tan_curve", "quadrant", "table", "determinant"],
  },
];

export default function App() {
  const [notebook, setNotebook] = useState<Notebook>(() => createInitialNotebook());
  const [history, setHistory] = useState<HistoryState>(INITIAL_HISTORY);
  const [isHydrated, setIsHydrated] = useState(false);
  const [tool, setTool] = useState<ToolMode>("pen");
  const [inkColor, setInkColor] = useState(DEFAULT_INK_COLOR);
  const [inkWidth, setInkWidth] = useState(8);
  const [eraserWidth, setEraserWidth] = useState(34);
  const [eraserMode, setEraserMode] = useState<"stroke" | "precise">("stroke");
  const [showShapePanel, setShowShapePanel] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [logLabel, setLogLabel] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [showSessionSetup, setShowSessionSetup] = useState(false);
  // A/B experiment arm. A = baseline (no shapes); B = shape insertion enabled.
  // Both arms share the page-based canvas. Set at session start from the condition.
  const [variant, setVariant] = useState<AppVariant>(DEFAULT_VARIANT);
  const features = useMemo(() => featuresForVariant(variant), [variant]);

  useEffect(() => {
    let active = true;

    loadNotebook().then((storedNotebook) => {
      if (!active) {
        return;
      }

      if (storedNotebook) {
        setNotebook(storedNotebook);
      }

      setIsHydrated(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    hydrateLog().then(({ session, recording }) => {
      if (active) {
        setLogLabel(session?.meta.label ?? "");
        setIsRecording(recording);
        setCanExport(!!session);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      saveNotebook(notebook).catch(() => undefined);
    }, 400);

    return () => clearTimeout(timeout);
  }, [isHydrated, notebook]);

  const activePage = useMemo(() => getActivePage(notebook), [notebook]);
  const selectedElement = useMemo(
    () => (activePage.elements ?? []).find((element) => element.id === selectedElementId) ?? null,
    [activePage.elements, selectedElementId],
  );

  const handleAddStroke = useCallback(
    (stroke: Stroke) => {
      if (tool !== "pen") {
        return;
      }

      const action = { type: "add-stroke", pageId: activePage.id, stroke } as const;
      setNotebook((current) => appendStroke(current, activePage.id, stroke));
      setHistory((current) => pushHistory(current, action));

      const bbox = strokeBoundingBox(stroke.points);
      logEvent({
        type: "stroke",
        tool: stroke.tool,
        strokeId: stroke.id,
        startedAt: stroke.points[0]?.time ?? Date.now(),
        endedAt: stroke.points[stroke.points.length - 1]?.time ?? Date.now(),
        durationMs: (stroke.points[stroke.points.length - 1]?.time ?? 0) - (stroke.points[0]?.time ?? 0),
        pointCount: stroke.points.length,
        bbox,
        points: stroke.points.map((point) => [Math.round(point.x), Math.round(point.y), point.time] as [number, number, number]),
        nearShapeIds: shapesNearBox(activePage.elements ?? [], bbox),
      });
    },
    [activePage.elements, activePage.id, tool],
  );

  const handleErasePath = useCallback(
    (points: InkPoint[], radius: number) => {
      // Precision eraser: keep the parts of each stroke the eraser missed.
      if (eraserMode === "precise") {
        const affected = activePage.strokes.filter((stroke) => strokeIntersectsEraserPath(stroke, points, radius));

        if (affected.length === 0) {
          return;
        }

        const removed: Stroke[] = [];
        const added: Stroke[] = [];
        const replacements: Record<string, Stroke[]> = {};

        for (const stroke of affected) {
          const runs = splitStrokeByEraserPath(stroke, points, radius);
          if (!runs) {
            continue;
          }
          const pieces = runs.map((piecePoints) => ({ ...stroke, id: makeId("stroke"), points: piecePoints }));
          removed.push(stroke);
          added.push(...pieces);
          replacements[stroke.id] = pieces;
        }

        if (removed.length === 0) {
          return;
        }

        const action = { type: "split-strokes", pageId: activePage.id, removed, added } as const;
        setNotebook((current) => replaceStrokes(current, activePage.id, replacements));
        setHistory((current) => pushHistory(current, action));
        logEvent({
          type: "erase",
          mode: "precise",
          removedStrokeIds: removed.map((stroke) => stroke.id),
          removedElementIds: [],
          addedStrokeIds: added.map((stroke) => stroke.id),
        });
        return;
      }

      // Stroke eraser: remove whole strokes and shape objects on contact.
      const removedStrokes = activePage.strokes.filter((stroke) => strokeIntersectsEraserPath(stroke, points, radius));
      const removedElements = (activePage.elements ?? []).filter((element) => elementIntersectsEraserPath(element, points, radius));

      if (removedStrokes.length === 0 && removedElements.length === 0) {
        return;
      }

      const strokeAction = { type: "erase-strokes", pageId: activePage.id, strokes: removedStrokes } as const;
      const elementAction = { type: "erase-elements", pageId: activePage.id, elements: removedElements } as const;

      setNotebook((current) => {
        let next = current;

        if (removedStrokes.length > 0) {
          next = removeStrokes(
            next,
            activePage.id,
            removedStrokes.map((stroke) => stroke.id),
          );
        }

        if (removedElements.length > 0) {
          next = removeElements(
            next,
            activePage.id,
            removedElements.map((element) => element.id),
          );
        }

        return next;
      });

      setHistory((current) => {
        let next = current;

        if (removedStrokes.length > 0) {
          next = pushHistory(next, strokeAction);
        }

        if (removedElements.length > 0) {
          next = pushHistory(next, elementAction);
        }

        return next;
      });

      if (removedElements.some((element) => element.id === selectedElementId)) {
        setSelectedElementId(null);
      }

      logEvent({
        type: "erase",
        mode: "stroke",
        removedStrokeIds: removedStrokes.map((stroke) => stroke.id),
        removedElementIds: removedElements.map((element) => element.id),
        addedStrokeIds: [],
      });
    },
    [activePage.elements, activePage.id, activePage.strokes, eraserMode, selectedElementId],
  );

  const handleUndo = useCallback(() => {
    const action = history.done[history.done.length - 1];

    if (!action) {
      return;
    }

    setNotebook((current) => undoInkAction(current, action));
    setHistory((current) => ({
      done: current.done.slice(0, -1),
      undone: [action, ...current.undone],
    }));
    logEvent({ type: "history", action: "undo", kind: action.type });
  }, [history.done]);

  const handleRedo = useCallback(() => {
    const action = history.undone[0];

    if (!action) {
      return;
    }

    setNotebook((current) => redoInkAction(current, action));
    setHistory((current) => ({
      done: [...current.done, action],
      undone: current.undone.slice(1),
    }));
    logEvent({ type: "history", action: "redo", kind: action.type });
  }, [history.undone]);

  const handleAddPage = useCallback(() => {
    const page = createPage(notebook.pages.length + 1);
    setNotebook((current) => ({
      ...current,
      activePageId: page.id,
      pages: [...current.pages, page],
      updatedAt: Date.now(),
    }));
    setHistory(INITIAL_HISTORY);
    logEvent({ type: "page_change", pageId: page.id });
  }, [notebook.pages.length]);

  const handleToolChange = useCallback((nextTool: ToolMode) => {
    setTool(nextTool);
  }, []);

  const handleAddShape = useCallback(
    (kind: ShapeInsertKind) => {
      // Shape insertion is a variant-B-only feature.
      if (!features.shapes) {
        return;
      }

      const element = createShapeElement(kind, inkColor, activePage.elements.length);

      setNotebook((current) => appendElement(current, activePage.id, element));
      setSelectedElementId(element.id);
      // Enter select mode so the freshly inserted shape can be dragged/resized right away.
      setTool("lasso");
      logEvent({ type: "shape_insert", elementId: element.id, kind: element.kind, x: element.x, y: element.y });
    },
    [activePage.elements.length, activePage.id, features.shapes, inkColor],
  );

  const handleUpdateElement = useCallback(
    (element: NoteElement) => {
      const previous = (activePage.elements ?? []).find((item) => item.id === element.id);
      const before = previous ? getElementScale(previous) : null;
      const after = getElementScale(element);
      let action: "move" | "resize" | "edit" = "edit";
      if (before && (before.sx !== after.sx || before.sy !== after.sy)) {
        action = "resize";
      } else if (previous && (previous.x !== element.x || previous.y !== element.y)) {
        action = "move";
      }

      setNotebook((current) => updateElement(current, activePage.id, element));
      logEvent({ type: "element_transform", action, elementId: element.id, x: element.x, y: element.y, scaleX: after.sx, scaleY: after.sy });
    },
    [activePage.elements, activePage.id],
  );

  const handleSelectPage = useCallback((pageId: string) => {
    setNotebook((current) => ({
      ...current,
      activePageId: pageId,
      updatedAt: Date.now(),
    }));
    logEvent({ type: "page_change", pageId });
  }, []);

  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (notebook.pages.length <= 1) {
        Alert.alert("삭제 불가", "마지막 페이지는 삭제할 수 없습니다.");
        return;
      }

      Alert.alert("페이지 삭제", "이 페이지의 모든 필기와 도형이 삭제됩니다. 계속할까요?", [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            setNotebook((current) => removePage(current, pageId));
            setHistory(INITIAL_HISTORY);
            setSelectedElementId(null);
            logEvent({ type: "page_delete", pageId });
          },
        },
      ]);
    },
    [notebook.pages.length],
  );

  const handleStartSession = useCallback((setup: SessionSetup) => {
    const session = startSession(setup);
    // The session condition drives which experiment arm the app runs as.
    setVariant(variantFromCondition(setup.condition));
    setLogLabel(session.meta.label ?? "");
    setIsRecording(true);
    setCanExport(true);
    setShowSessionSetup(false);
  }, []);

  const handleEndSession = useCallback(() => {
    endSession();
    setIsRecording(false);
  }, []);

  const handleExportLog = useCallback(async () => {
    const json = exportCurrentSessionJson();
    if (!json) {
      Alert.alert("내보낼 로그 없음", "아직 기록된 세션이 없습니다.");
      return;
    }

    try {
      const safeLabel = (logLabel || "session").replace(/[^\w가-힣-]+/g, "_");
      const filename = `studyflow-${safeLabel}-${Date.now()}.json`;
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true, intermediates: true });
      file.write(json);

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("공유 불가", "이 기기에서 파일 공유를 사용할 수 없습니다.");
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        UTI: "public.json",
        dialogTitle: "로그 파일 내보내기",
      });
    } catch (error) {
      Alert.alert("내보내기 실패", String(error));
    }
  }, [logLabel]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <Toolbar
          canRedo={history.undone.length > 0}
          canUndo={history.done.length > 0}
          color={inkColor}
          eraserMode={eraserMode}
          eraserWidth={eraserWidth}
          canExport={canExport}
          isRecording={isRecording}
          onColorChange={setInkColor}
          onEndSession={handleEndSession}
          onEraserModeChange={setEraserMode}
          onEraserWidthChange={setEraserWidth}
          onExportLog={handleExportLog}
          onOpenElements={() => setShowShapePanel((current) => !current)}
          onRedo={handleRedo}
          onStartSession={() => setShowSessionSetup(true)}
          onToolChange={handleToolChange}
          onUndo={handleUndo}
          onWidthChange={setInkWidth}
          sessionLabel={logLabel}
          showShapeTool={features.shapes}
          tool={tool}
          width={inkWidth}
        />
        <View style={styles.workspace}>
          {features.multiPage ? (
            <PageStrip
              activePageId={notebook.activePageId}
              onAddPage={handleAddPage}
              onDeletePage={handleDeletePage}
              onSelectPage={handleSelectPage}
              pages={notebook.pages}
            />
          ) : null}
          <HandwritingCanvas
            key={`${activePage.id}-${variant}`}
            onAddStroke={handleAddStroke}
            onErasePath={handleErasePath}
            onNavigate={(event) => logEvent(event)}
            onSelectElement={setSelectedElementId}
            onUpdateElement={handleUpdateElement}
            page={activePage}
            selectedElementId={selectedElementId}
            toolSettings={{
              tool,
              color: inkColor,
              width: tool === "eraser" ? eraserWidth : inkWidth,
            }}
          />
        </View>
        {features.shapes && showShapePanel ? (
          <ShapePanel
            element={selectedElement}
            onAddShape={handleAddShape}
            onClose={() => setShowShapePanel(false)}
            onUpdateElement={handleUpdateElement}
          />
        ) : null}
        {showSessionSetup ? (
          <SessionSetupModal onCancel={() => setShowSessionSetup(false)} onStart={handleStartSession} visible />
        ) : null}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function createShapeElement(kind: ShapeInsertKind, color: string, index: number): NoteElement {
  const column = index % 3;
  const row = Math.floor(index / 3) % 5;
  const isGridShape = kind === "matrix" || kind === "table" || kind === "determinant";

  return withShapeGeometry({
    id: makeId("shape"),
    kind,
    x: 230 + column * 44,
    y: 165 + row * 74,
    color,
    length: isGridShape ? 190 : 230,
    rows: isGridShape ? 3 : undefined,
    cols: isGridShape ? 3 : undefined,
    objectScale: 1,
    radius: kind === "semicircle" || kind === "quadrant" ? 62 : undefined,
  });
}

function strokeBoundingBox(points: InkPoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX: Math.round(minX), minY: Math.round(minY), maxX: Math.round(maxX), maxY: Math.round(maxY) };
}

// Inserted shapes whose (padded) bounding box overlaps the stroke — feeds the
// pause classifier signal "did ink land near a shape region" (design doc §7).
function shapesNearBox(elements: NoteElement[], bbox: { minX: number; minY: number; maxX: number; maxY: number }, pad = 40) {
  return elements
    .filter((element) => {
      const geometry = getShapeGeometry(element);
      const { sx, sy } = getElementScale(element);
      const ex1 = element.x - pad;
      const ey1 = element.y - pad;
      const ex2 = element.x + geometry.width * sx + pad;
      const ey2 = element.y + geometry.height * sy + pad;
      return bbox.minX <= ex2 && bbox.maxX >= ex1 && bbox.minY <= ey2 && bbox.maxY >= ey1;
    })
    .map((element) => element.id);
}

function ShapePanel({
  element,
  onAddShape,
  onUpdateElement,
  onClose,
}: {
  element: NoteElement | null;
  onAddShape: (kind: ShapeInsertKind) => void;
  onUpdateElement: (element: NoteElement) => void;
  onClose: () => void;
}) {
  const canResizeGrid = element?.kind === "matrix" || element?.kind === "table" || element?.kind === "determinant";

  const updateSelected = (patch: Partial<NoteElement>) => {
    if (element) {
      onUpdateElement(withShapeGeometry({ ...element, ...patch }));
    }
  };

  return (
    <View style={styles.shapePanel}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={styles.panelTitle}>Shape objects</Text>
          <Text style={styles.panelSubtitle}>Insert only the experiment targets.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>x</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.panelScroll} showsVerticalScrollIndicator={false}>
        {SHAPE_GROUPS.map((group) => (
          <View key={group.title} style={styles.shapeGroup}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.shapeButtons}>
              {group.items.map((kind) => (
                <Pressable accessibilityRole="button" key={kind} onPress={() => onAddShape(kind)} style={styles.shapeButton}>
                  <Text style={styles.shapeButtonText}>{shapeLabel(kind)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {element ? (
          <View style={styles.selectedBlock}>
            <Text style={styles.groupTitle}>Selected</Text>
            <Text style={styles.selectedName}>{shapeLabel(element.kind)}</Text>

            {canResizeGrid ? (
              <View style={styles.stepperRow}>
                <NumberStepper label="Rows" max={6} min={1} onChange={(rows) => updateSelected({ rows })} value={element.rows ?? 3} />
                <NumberStepper label="Cols" max={6} min={1} onChange={(cols) => updateSelected({ cols })} value={element.cols ?? 3} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepperButton}>
        <Text style={styles.stepperText}>-</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable accessibilityRole="button" onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepperButton}>
        <Text style={styles.stepperText}>+</Text>
      </Pressable>
    </View>
  );
}

function shapeLabel(kind: ElementKind) {
  const labels: Partial<Record<ElementKind, string>> = {
    normal_curve: "Normal curve",
    hyperbola: "Hyperbola",
    exp_decay: "Exp. decay",
    log_curve: "Log curve",
    sin_curve: "Sin curve",
    tan_curve: "Tan curve",
    semicircle: "Semicircle",
    quadrant: "Quadrant",
    matrix: "Matrix",
    table: "Table",
    determinant: "Determinant",
  };

  return labels[kind] ?? kind;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#f7fafc",
  },
  workspace: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  shapePanel: {
    position: "absolute",
    top: 96,
    right: 16,
    width: 330,
    maxHeight: "82%",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe3ed",
    backgroundColor: "rgba(255,255,255,0.98)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  panelSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  closeText: {
    color: "#475569",
    fontSize: 18,
    fontWeight: "800",
  },
  panelScroll: {
    gap: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  shapeGroup: {
    gap: 8,
  },
  groupTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  shapeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shapeButton: {
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  shapeButtonText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
  },
  selectedBlock: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  selectedName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  stepperRow: {
    gap: 8,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperLabel: {
    width: 42,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  stepperText: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
  stepperValue: {
    width: 48,
    color: "#111827",
    textAlign: "center",
    fontWeight: "800",
  },
});
