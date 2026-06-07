import { CircleDot, Eraser, Minus, MousePointer2, PenLine, Plus, Redo2, Shapes, Undo2 } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { clamp } from "../lib/geometry";
import type { ToolMode } from "../types/ink";
import { IconButton } from "./IconButton";

const INK_COLORS = ["#111827", "#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#a855f7"];

type EraserMode = "stroke" | "precise";

type ToolbarProps = {
  tool: ToolMode;
  color: string;
  width: number;
  eraserWidth: number;
  eraserMode: EraserMode;
  sessionLabel: string;
  isRecording: boolean;
  canExport: boolean;
  canUndo: boolean;
  canRedo: boolean;
  // Variant B only: show the shape-insertion tool.
  showShapeTool: boolean;
  onToolChange: (tool: ToolMode) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onEraserWidthChange: (width: number) => void;
  onEraserModeChange: (mode: EraserMode) => void;
  onOpenElements: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStartSession: () => void;
  onEndSession: () => void;
  onExportLog: () => void;
};

export function Toolbar({
  tool,
  color,
  width,
  eraserWidth,
  eraserMode,
  sessionLabel,
  isRecording,
  canExport,
  canUndo,
  canRedo,
  showShapeTool,
  onToolChange,
  onColorChange,
  onWidthChange,
  onEraserWidthChange,
  onEraserModeChange,
  onOpenElements,
  onUndo,
  onRedo,
  onStartSession,
  onEndSession,
  onExportLog,
}: ToolbarProps) {
  const selectEraser = (mode: EraserMode) => {
    onToolChange("eraser");
    onEraserModeChange(mode);
  };
  // 1px steps down to 2px so thin 2~3px strokes are reachable.
  const decreaseWidth = () => onWidthChange(clamp(width - 1, 2, 22));
  const increaseWidth = () => onWidthChange(clamp(width + 1, 2, 22));
  const decreaseEraserWidth = () => onEraserWidthChange(clamp(eraserWidth - 4, 16, 72));
  const increaseEraserWidth = () => onEraserWidthChange(clamp(eraserWidth + 4, 16, 72));

  return (
    <View style={styles.toolbar}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>StudyFlow Notes</Text>
        <Text style={styles.status}>
          {tool === "lasso"
            ? "선택/이동"
            : tool === "eraser"
              ? `${eraserMode === "precise" ? "정밀" : "획"} 지우개 ${eraserWidth}px`
              : `${width}px`}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
        <View style={styles.group}>
          <IconButton accessibilityLabel="펜" icon={PenLine} selected={tool === "pen"} onPress={() => onToolChange("pen")} />
          <IconButton
            accessibilityLabel="획 지우개"
            icon={Eraser}
            selected={tool === "eraser" && eraserMode === "stroke"}
            onPress={() => selectEraser("stroke")}
          />
          <IconButton
            accessibilityLabel="정밀 지우개"
            icon={CircleDot}
            selected={tool === "eraser" && eraserMode === "precise"}
            onPress={() => selectEraser("precise")}
          />
          <IconButton accessibilityLabel="선택/이동" icon={MousePointer2} selected={tool === "lasso"} onPress={() => onToolChange("lasso")} />
          {showShapeTool ? <IconButton accessibilityLabel="도형 삽입" icon={Shapes} onPress={onOpenElements} /> : null}
        </View>

        <View style={styles.group}>
          <IconButton accessibilityLabel="실행 취소" icon={Undo2} disabled={!canUndo} onPress={onUndo} />
          <IconButton accessibilityLabel="다시 실행" icon={Redo2} disabled={!canRedo} onPress={onRedo} />
        </View>

        <View style={styles.logGroup}>
          {isRecording ? (
            <>
              <View style={styles.recDot} />
              <Text numberOfLines={1} style={styles.sessionText}>
                {sessionLabel || "기록 중"}
              </Text>
              <Pressable accessibilityRole="button" onPress={onEndSession} style={[styles.logButton, styles.endButton]}>
                <Text style={styles.endText}>끝냄</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={onStartSession} style={[styles.logButton, styles.startButton]}>
              <Text style={styles.startText}>기록 시작</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!canExport}
            onPress={onExportLog}
            style={[styles.logButton, styles.exportButton, !canExport && styles.exportDisabled]}
          >
            <Text style={[styles.exportText, !canExport && styles.exportTextDisabled]}>내보내기</Text>
          </Pressable>
        </View>

        <View style={styles.swatches}>
          {INK_COLORS.map((inkColor) => (
            <Pressable
              accessibilityLabel={`색상 ${inkColor}`}
              accessibilityRole="button"
              key={inkColor}
              onPress={() => onColorChange(inkColor)}
              style={[styles.swatch, { backgroundColor: inkColor }, color === inkColor && styles.activeSwatch]}
            />
          ))}
        </View>

        <View style={styles.widthControl}>
          <Text style={styles.controlLabel}>펜</Text>
          <IconButton accessibilityLabel="펜 굵기 줄이기" icon={Minus} onPress={decreaseWidth} />
          <View style={styles.widthPreview}>
            <View
              style={[
                styles.widthDot,
                {
                  width: clamp(width * 1.35, 7, 30),
                  height: clamp(width * 1.35, 7, 30),
                  borderRadius: clamp(width, 4, 15),
                },
              ]}
            />
          </View>
          <IconButton accessibilityLabel="펜 굵기 키우기" icon={Plus} onPress={increaseWidth} />
        </View>

        <View style={styles.widthControl}>
          <Text style={styles.controlLabel}>지우개</Text>
          <IconButton accessibilityLabel="지우개 줄이기" icon={Minus} onPress={decreaseEraserWidth} />
          <View style={styles.widthPreview}>
            <View
              style={[
                styles.eraserPreview,
                {
                  width: clamp(eraserWidth * 0.55, 10, 36),
                  height: clamp(eraserWidth * 0.55, 10, 36),
                  borderRadius: clamp(eraserWidth * 0.28, 5, 18),
                },
              ]}
            />
          </View>
          <IconButton accessibilityLabel="지우개 키우기" icon={Plus} onPress={increaseEraserWidth} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#dfe5ec",
    backgroundColor: "#f7fafc",
  },
  brandBlock: {
    minWidth: 152,
  },
  brand: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  status: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  toolRow: {
    alignItems: "center",
    gap: 12,
    paddingRight: 20,
  },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  swatches: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  activeSwatch: {
    borderColor: "#0f172a",
    transform: [{ scale: 1.08 }],
  },
  widthControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  widthPreview: {
    width: 48,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  widthDot: {
    backgroundColor: "#111827",
  },
  eraserPreview: {
    backgroundColor: "#93c5fd",
    opacity: 0.72,
  },
  controlLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  logGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },
  sessionText: {
    maxWidth: 130,
    color: "#16a34a",
    fontSize: 12,
    fontWeight: "800",
  },
  logButton: {
    height: 38,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  startButton: {
    backgroundColor: "#16a34a",
  },
  startText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  endButton: {
    backgroundColor: "#ef4444",
  },
  endText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  exportButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  exportText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  exportDisabled: {
    opacity: 0.4,
  },
  exportTextDisabled: {
    color: "#94a3b8",
  },
});
