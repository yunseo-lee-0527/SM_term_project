import { Eraser, Highlighter, Minus, PenLine, Plus, Redo2, Undo2 } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { clamp } from "../lib/geometry";
import type { ToolMode } from "../types/ink";
import { IconButton } from "./IconButton";

const INK_COLORS = ["#111827", "#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#a855f7"];

type ToolbarProps = {
  tool: ToolMode;
  color: string;
  width: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolMode) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function Toolbar({
  tool,
  color,
  width,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const decreaseWidth = () => onWidthChange(clamp(width - 2, 4, 22));
  const increaseWidth = () => onWidthChange(clamp(width + 2, 4, 22));

  return (
    <View style={styles.toolbar}>
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>InkPad Lab</Text>
        <Text style={styles.status}>{tool === "eraser" ? "Eraser" : `${width}px`}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
        <View style={styles.group}>
          <IconButton
            accessibilityLabel="펜"
            icon={PenLine}
            selected={tool === "pen"}
            onPress={() => onToolChange("pen")}
          />
          <IconButton
            accessibilityLabel="형광펜"
            icon={Highlighter}
            selected={tool === "highlighter"}
            onPress={() => onToolChange("highlighter")}
          />
          <IconButton
            accessibilityLabel="지우개"
            icon={Eraser}
            selected={tool === "eraser"}
            onPress={() => onToolChange("eraser")}
          />
        </View>

        <View style={styles.group}>
          <IconButton accessibilityLabel="실행취소" icon={Undo2} disabled={!canUndo} onPress={onUndo} />
          <IconButton accessibilityLabel="다시실행" icon={Redo2} disabled={!canRedo} onPress={onRedo} />
        </View>

        <View style={styles.swatches}>
          {INK_COLORS.map((inkColor) => (
            <Pressable
              accessibilityLabel={`색상 ${inkColor}`}
              accessibilityRole="button"
              key={inkColor}
              onPress={() => onColorChange(inkColor)}
              style={[
                styles.swatch,
                { backgroundColor: inkColor },
                color === inkColor && styles.activeSwatch,
              ]}
            />
          ))}
        </View>

        <View style={styles.widthControl}>
          <IconButton accessibilityLabel="굵기 줄이기" icon={Minus} onPress={decreaseWidth} />
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
          <IconButton accessibilityLabel="굵기 키우기" icon={Plus} onPress={increaseWidth} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    minHeight: 78,
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
    minWidth: 116,
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
});
