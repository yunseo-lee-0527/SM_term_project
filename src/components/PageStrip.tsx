import { FilePlus2 } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Page } from "../types/ink";
import { IconButton } from "./IconButton";

type PageStripProps = {
  pages: Page[];
  activePageId: string;
  onAddPage: () => void;
  onSelectPage: (pageId: string) => void;
};

export function PageStrip({ pages, activePageId, onAddPage, onSelectPage }: PageStripProps) {
  return (
    <View style={styles.strip}>
      <IconButton accessibilityLabel="페이지 추가" icon={FilePlus2} onPress={onAddPage} style={styles.addButton} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {pages.map((page, index) => {
          const active = page.id === activePageId;

          return (
            <Pressable
              accessibilityLabel={`${index + 1} 페이지`}
              accessibilityRole="button"
              key={page.id}
              onPress={() => onSelectPage(page.id)}
              style={({ pressed }) => [
                styles.thumbnail,
                active && styles.activeThumbnail,
                pressed && styles.pressedThumbnail,
              ]}
            >
              <View style={styles.paperMini}>
                <View style={[styles.miniLine, { width: "66%" }]} />
                <View style={[styles.miniLine, { width: "52%" }]} />
                <View style={[styles.strokeCounter, page.strokes.length > 0 && styles.hasInk]} />
              </View>
              <Text style={[styles.pageNumber, active && styles.activePageNumber]}>{index + 1}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    width: 116,
    borderRightWidth: 1,
    borderRightColor: "#dfe5ec",
    backgroundColor: "#f1f5f9",
    paddingTop: 14,
    paddingHorizontal: 12,
  },
  addButton: {
    alignSelf: "center",
    marginBottom: 14,
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  thumbnail: {
    alignItems: "center",
    gap: 7,
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  activeThumbnail: {
    borderColor: "#2563eb",
    backgroundColor: "#e7efff",
  },
  pressedThumbnail: {
    opacity: 0.72,
  },
  paperMini: {
    width: 68,
    height: 90,
    borderRadius: 5,
    padding: 8,
    gap: 7,
    borderWidth: 1,
    borderColor: "#d8dee7",
    backgroundColor: "#fffdf8",
  },
  miniLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "#d7e4ea",
  },
  strokeCounter: {
    marginTop: 22,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#e5e7eb",
  },
  hasInk: {
    width: 42,
    backgroundColor: "#2563eb",
  },
  pageNumber: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  activePageNumber: {
    color: "#1d4ed8",
  },
});
