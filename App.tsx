import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

import { HandwritingCanvas } from "./src/components/HandwritingCanvas";
import { PageStrip } from "./src/components/PageStrip";
import { Toolbar } from "./src/components/Toolbar";
import { strokeIntersectsEraserPath } from "./src/lib/geometry";
import {
  appendStroke,
  createInitialNotebook,
  createPage,
  getActivePage,
  pushHistory,
  redoInkAction,
  removeStrokes,
  undoInkAction,
} from "./src/lib/notebook";
import { loadNotebook, saveNotebook } from "./src/lib/storage";
import type { HistoryState, InkPoint, Notebook, Stroke, ToolMode } from "./src/types/ink";

const INITIAL_HISTORY: HistoryState = { done: [], undone: [] };
const DEFAULT_INK_COLOR = "#111827";

export default function App() {
  const [notebook, setNotebook] = useState<Notebook>(() => createInitialNotebook());
  const [history, setHistory] = useState<HistoryState>(INITIAL_HISTORY);
  const [isHydrated, setIsHydrated] = useState(false);
  const [tool, setTool] = useState<ToolMode>("pen");
  const [inkColor, setInkColor] = useState(DEFAULT_INK_COLOR);
  const [inkWidth, setInkWidth] = useState(8);

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

  const handleAddStroke = useCallback(
    (stroke: Stroke) => {
      const action = { type: "add-stroke", pageId: activePage.id, stroke } as const;

      setNotebook((current) => appendStroke(current, activePage.id, stroke));
      setHistory((current) => pushHistory(current, action));
    },
    [activePage.id],
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
          onColorChange={setInkColor}
          onRedo={handleRedo}
          onToolChange={setTool}
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
            page={activePage}
            toolSettings={{
              tool,
              color: inkColor,
              width: inkWidth,
            }}
          />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
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
});
