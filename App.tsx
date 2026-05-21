import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

import { HandwritingCanvas } from "./src/components/HandwritingCanvas";
import { PageStrip } from "./src/components/PageStrip";
import { Toolbar } from "./src/components/Toolbar";
import { strokeIntersectsEraserPath } from "./src/lib/geometry";
import {
  appendStroke,
  appendElement,
  createInitialNotebook,
  createPage,
  getActivePage,
  pushHistory,
  redoInkAction,
  removeStrokes,
  undoInkAction,
  updateElement,
} from "./src/lib/notebook";
import { loadNotebook, saveNotebook } from "./src/lib/storage";
import type { DistributionKind, ElementKind, HistoryState, InkPoint, Notebook, NoteElement, Stroke, ToolMode } from "./src/types/ink";

const INITIAL_HISTORY: HistoryState = { done: [], undone: [] };
const DEFAULT_INK_COLOR = "#111827";

export default function App() {
  const [notebook, setNotebook] = useState<Notebook>(() => createInitialNotebook());
  const [history, setHistory] = useState<HistoryState>(INITIAL_HISTORY);
  const [isHydrated, setIsHydrated] = useState(false);
  const [tool, setTool] = useState<ToolMode>("pen");
  const [inkColor, setInkColor] = useState(DEFAULT_INK_COLOR);
  const [inkWidth, setInkWidth] = useState(8);
  const [eraserWidth, setEraserWidth] = useState(34);
  const [previousDrawTool, setPreviousDrawTool] = useState<ToolMode>("pen");
  const [showElements, setShowElements] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [breakSeconds, setBreakSeconds] = useState(25 * 60);
  const [breakRunning, setBreakRunning] = useState(false);

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
    if (!isHydrated) {
      return;
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

  useEffect(() => {
    if (!breakRunning) {
      return undefined;
    }

    const interval = setInterval(() => {
      setBreakSeconds((current) => (current <= 1 ? 5 * 60 : current - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [breakRunning]);

  const handleAddStroke = useCallback(
    (stroke: Stroke) => {
      if (tool === "lasso" || tool === "text") {
        return;
      }

      const action = { type: "add-stroke", pageId: activePage.id, stroke } as const;

      setNotebook((current) => appendStroke(current, activePage.id, stroke));
      setHistory((current) => pushHistory(current, action));
    },
    [activePage.id, tool],
  );

  const handleErasePath = useCallback(
    (points: InkPoint[], radius: number) => {
      const removedStrokes = activePage.strokes.filter((stroke) => strokeIntersectsEraserPath(stroke, points, radius));

      if (removedStrokes.length === 0) {
        return;
      }

      const action = { type: "erase-strokes", pageId: activePage.id, strokes: removedStrokes } as const;

      setNotebook((current) =>
        removeStrokes(
          current,
          activePage.id,
          removedStrokes.map((stroke) => stroke.id),
        ),
      );
      setHistory((current) => pushHistory(current, action));
    },
    [activePage.id, activePage.strokes],
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
  }, [history.undone]);

  const handleAddPage = useCallback(() => {
    setNotebook((current) => {
      const page = createPage(current.pages.length + 1);

      return {
        ...current,
        activePageId: page.id,
        pages: [...current.pages, page],
        updatedAt: Date.now(),
      };
    });
    setHistory(INITIAL_HISTORY);
  }, []);

  const handleToolChange = useCallback((nextTool: ToolMode) => {
    setTool((current) => {
      if (current === "pen" || current === "highlighter") {
        setPreviousDrawTool(current);
      }
      if (nextTool === "pen" || nextTool === "highlighter") {
        setPreviousDrawTool(nextTool);
      }
      return nextTool;
    });
  }, []);

  const handleQuickToggle = useCallback(() => {
    setTool((current) => (current === "eraser" ? previousDrawTool : "eraser"));
  }, [previousDrawTool]);

  const handleAddElement = useCallback(
    (kind: ElementKind) => {
      const element = createElement(kind, inkColor, activePage.elements.length);
      setNotebook((current) => appendElement(current, activePage.id, element));
      setSelectedElementId(element.id);
    },
    [activePage.elements.length, activePage.id, inkColor],
  );

  const handleUpdateElement = useCallback(
    (element: NoteElement) => {
      setNotebook((current) => updateElement(current, activePage.id, element));
    },
    [activePage.id],
  );

  const handleSelectPage = useCallback((pageId: string) => {
    setNotebook((current) => ({
      ...current,
      activePageId: pageId,
      updatedAt: Date.now(),
    }));
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <Toolbar
          canRedo={history.undone.length > 0}
          canUndo={history.done.length > 0}
          color={inkColor}
          eraserWidth={eraserWidth}
          onColorChange={setInkColor}
          onEraserWidthChange={setEraserWidth}
          onOpenElements={() => setShowElements((current) => !current)}
          onQuickToggle={handleQuickToggle}
          onRedo={handleRedo}
          onToolChange={handleToolChange}
          onUndo={handleUndo}
          onWidthChange={setInkWidth}
          tool={tool}
          width={inkWidth}
        />
        <View style={styles.workspace}>
          <PageStrip
            activePageId={notebook.activePageId}
            onAddPage={handleAddPage}
            onSelectPage={handleSelectPage}
            pages={notebook.pages}
          />
          <HandwritingCanvas
            key={activePage.id}
            onAddStroke={handleAddStroke}
            onErasePath={handleErasePath}
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
        {showElements ? (
          <ElementPanel
            breakRunning={breakRunning}
            breakSeconds={breakSeconds}
            element={selectedElement}
            onAddElement={handleAddElement}
            onBreakSecondsChange={setBreakSeconds}
            onBreakToggle={() => setBreakRunning((current) => !current)}
            onClose={() => setShowElements(false)}
            onResetBreak={() => {
              setBreakRunning(false);
              setBreakSeconds(25 * 60);
            }}
            onUpdateElement={handleUpdateElement}
          />
        ) : null}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function createElement(kind: ElementKind, color: string, index: number): NoteElement {
  return {
    id: `element-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    x: 260 + (index % 3) * 36,
    y: 190 + (index % 5) * 70,
    color,
    length: 220,
    rows: 3,
    cols: 3,
    dimension: 2,
    distribution: "normal",
    expression: "sin(x)",
    x1: 30,
    y1: 120,
    x2: 220,
    y2: 42,
  };
}

function ElementPanel({
  element,
  breakSeconds,
  breakRunning,
  onAddElement,
  onUpdateElement,
  onClose,
  onBreakToggle,
  onResetBreak,
  onBreakSecondsChange,
}: {
  element: NoteElement | null;
  breakSeconds: number;
  breakRunning: boolean;
  onAddElement: (kind: ElementKind) => void;
  onUpdateElement: (element: NoteElement) => void;
  onClose: () => void;
  onBreakToggle: () => void;
  onResetBreak: () => void;
  onBreakSecondsChange: (seconds: number) => void;
}) {
  const controls = element ? controlsForElement(element.kind) : [];
  const minutes = Math.floor(breakSeconds / 60);
  const seconds = String(breakSeconds % 60).padStart(2, "0");

  const update = (patch: Partial<NoteElement>) => {
    if (element) {
      onUpdateElement({ ...element, ...patch });
    }
  };

  return (
    <View style={styles.elementPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Elements</Text>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.elementButtons}>
        {(["axis", "distribution", "function", "vector", "matrix", "table"] as ElementKind[]).map((kind) => (
          <Pressable key={kind} onPress={() => onAddElement(kind)} style={styles.elementButton}>
            <Text style={styles.elementButtonText}>{elementLabel(kind)}</Text>
          </Pressable>
        ))}
      </View>

      {element ? (
        <View style={styles.editorBlock}>
          <Text style={styles.editorTitle}>{elementLabel(element.kind)} 조정</Text>
          {controls.includes("length") ? (
            <NumberStepper label="길이" max={320} min={80} onChange={(value) => update({ length: value })} value={element.length ?? 220} />
          ) : null}
          {controls.includes("axis") ? (
            <ChoiceRow
              label="축"
              onChange={(value) => update({ dimension: Number(value) as 1 | 2 | 3 })}
              options={["1", "2", "3"]}
              value={String(element.dimension ?? 2)}
            />
          ) : null}
          {controls.includes("distribution") ? (
            <ChoiceRow
              label="분포"
              onChange={(value) => update({ distribution: value as DistributionKind })}
              options={["normal", "uniform", "exponential", "bimodal", "skewed"]}
              value={element.distribution ?? "normal"}
            />
          ) : null}
          {controls.includes("function") ? (
            <TextInput
              onChangeText={(value) => update({ expression: value })}
              placeholder="sin(x), x^2, cos(x)"
              style={styles.textInput}
              value={element.expression ?? "sin(x)"}
            />
          ) : null}
          {controls.includes("grid") ? (
            <View style={styles.rowControls}>
              <NumberStepper label="행" max={8} min={1} onChange={(value) => update({ rows: value })} value={element.rows ?? 3} />
              <NumberStepper label="열" max={8} min={1} onChange={(value) => update({ cols: value })} value={element.cols ?? 3} />
            </View>
          ) : null}
          <ChoiceRow
            label="색"
            onChange={(value) => update({ color: value })}
            options={["#111827", "#2563eb", "#ef4444", "#16a34a", "#f59e0b"]}
            value={element.color}
          />
        </View>
      ) : (
        <Text style={styles.helpText}>요소를 추가하거나 노트 위 요소를 누르면 필요한 설정만 표시됩니다.</Text>
      )}

      <View style={styles.timerBlock}>
        <Text style={styles.editorTitle}>휴식 타이머</Text>
        <Pressable
          onLongPress={() => onBreakSecondsChange(Math.max(60, breakSeconds + 5 * 60))}
          onPress={onBreakToggle}
          style={styles.timerFace}
        >
          <Text style={styles.timerText}>{minutes}:{seconds}</Text>
          <Text style={styles.timerHint}>{breakRunning ? "진행 중" : "탭 시작/정지 · 길게 5분 추가"}</Text>
        </Pressable>
        <Pressable onPress={onResetBreak} style={styles.resetTimer}>
          <Text style={styles.resetTimerText}>25:00 초기화</Text>
        </Pressable>
      </View>
    </View>
  );
}

function controlsForElement(kind: ElementKind) {
  return {
    axis: ["length", "axis"],
    distribution: ["length", "distribution"],
    function: ["length", "function"],
    vector: [],
    matrix: ["grid"],
    table: ["length", "grid"],
  }[kind];
}

function elementLabel(kind: ElementKind) {
  return {
    axis: "좌표축",
    distribution: "분포",
    function: "함수",
    vector: "벡터",
    matrix: "행렬",
    table: "표",
  }[kind];
}

function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepperButton}>
        <Text style={styles.stepperText}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepperButton}>
        <Text style={styles.stepperText}>＋</Text>
      </Pressable>
    </View>
  );
}

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.choiceRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.choiceOptions}>
        {options.map((option) => (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceButton, value === option && styles.choiceButtonActive]}>
            <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
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
  elementPanel: {
    position: "absolute",
    top: 96,
    right: 16,
    width: 330,
    maxHeight: "82%",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dbe3ed",
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    gap: 12,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  closeText: {
    color: "#475569",
    fontSize: 20,
    fontWeight: "800",
  },
  elementButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  elementButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
  },
  elementButtonText: {
    color: "#1d4ed8",
    fontWeight: "800",
  },
  editorBlock: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  editorTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  helpText: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  rowControls: {
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
    borderRadius: 9,
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
  choiceRow: {
    gap: 7,
  },
  choiceOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  choiceButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#f1f5f9",
  },
  choiceButtonActive: {
    backgroundColor: "#2563eb",
  },
  choiceText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  choiceTextActive: {
    color: "#ffffff",
  },
  textInput: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    color: "#111827",
    fontWeight: "700",
  },
  timerBlock: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  timerFace: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  timerText: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "900",
  },
  timerHint: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  resetTimer: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
  },
  resetTimerText: {
    color: "#3730a3",
    fontWeight: "800",
  },
});
