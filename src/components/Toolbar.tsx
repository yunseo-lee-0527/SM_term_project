import { Eraser, Highlighter, Image, Minus, PenLine, Plus, Redo2, Square, Type, Undo2 } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { clamp } from "../lib/geometry";
import type { ToolMode } from "../types/ink";
import { IconButton } from "./IconButton";

const INK_COLORS = ["#111827", "#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#a855f7"];

type ToolbarProps = {
  tool: ToolMode;
  color: string;
  width: number;
  eraserWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolMode) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onEraserWidthChange: (width: number) => void;
  onQuickToggle: () => void;
  onOpenElements: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function Toolbar({
  tool,
  color,
  width,
  eraserWidth,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onWidthChange,
  onEraserWidthChange,
  onQuickToggle,
  onOpenElements,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const decreaseWidth = () => onWidthChange(clamp(width - 2, 4, 22));
  const increaseWidth = () => onWidthChange(clamp(width + 2, 4, 22));
  const decreaseEraserWidth = () => onEraserWidthChange(clamp(eraserWidth - 4, 16, 72));
  const increaseEraserWidth = () => onEraserWidthChange(clamp(eraserWidth + 4, 16, 72));

  return (
    <View style={styles.toolbar}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>StudyFlow Notes</Text>
        <Text style={styles.status}>{tool === "eraser" ? `지우개 ${eraserWidth}px` : `${width}px`}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
        <View style={styles.group}>
          <IconButton accessibilityLabel="펜" icon={PenLine} selected={tool === "pen"} onPress={() => onToolChange("pen")} />
          <IconButton accessibilityLabel="형광펜" icon={Highlighter} selected={tool === "highlighter"} onPress={() => onToolChange("highlighter")} />
          <IconButton accessibilityLabel="지우개" icon={Eraser} selected={tool === "eraser"} onPress={() => onToolChange("eraser")} />
          <IconButton accessibilityLabel="올가미" icon={Square} selected={tool === "lasso"} onPress={() => onToolChange("lasso")} />
          <IconButton accessibilityLabel="텍스트" icon={Type} selected={tool === "text"} onPress={() => onToolChange("text")} />
          <IconButton accessibilityLabel="펜/지우개 빠른 전환" icon={Minus} onPress={onQuickToggle} />
        </View>

        <View style={styles.group}>
          <IconButton accessibilityLabel="실행 취소" icon={Undo2} disabled={!canUndo} onPress={onUndo} />
          <IconButton accessibilityLabel="다시 실행" icon={Redo2} disabled={!canRedo} onPress={onRedo} />
          <IconButton accessibilityLabel="요소" icon={Plus} onPress={onOpenElements} />
          <IconButton accessibilityLabel="이미지" icon={Image} disabled onPress={() => undefined} />
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
});
