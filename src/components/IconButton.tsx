import type { ComponentType } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

type IconButtonProps = {
  icon: ComponentType<IconProps>;
  accessibilityLabel: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  selected = false,
  disabled = false,
  onPress,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Icon color={selected ? "#ffffff" : "#1f2937"} size={22} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7dde4",
    backgroundColor: "#ffffff",
  },
  selected: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  disabled: {
    opacity: 0.34,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
