import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export type SessionSetup = { participant?: string; condition?: string; note?: string };

export function SessionSetupModal({
  visible,
  onCancel,
  onStart,
}: {
  visible: boolean;
  onCancel: () => void;
  onStart: (setup: SessionSetup) => void;
}) {
  const [participant, setParticipant] = useState("");
  const [condition, setCondition] = useState<"A" | "B">("A");
  const [note, setNote] = useState("");

  const start = () => {
    onStart({
      participant: participant.trim() || undefined,
      condition,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>기록 시작</Text>
          <Text style={styles.subtitle}>실험 런을 시작하기 전에 정보를 입력하세요.</Text>

          <Text style={styles.label}>참가자</Text>
          <TextInput
            autoCapitalize="characters"
            onChangeText={setParticipant}
            placeholder="예: P1"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={participant}
          />

          <Text style={styles.label}>조건</Text>
          <View style={styles.segmentRow}>
            <Pressable onPress={() => setCondition("A")} style={[styles.segment, condition === "A" && styles.segmentActive]}>
              <Text style={[styles.segmentText, condition === "A" && styles.segmentTextActive]}>A · 베이스라인</Text>
            </Pressable>
            <Pressable onPress={() => setCondition("B")} style={[styles.segment, condition === "B" && styles.segmentActive]}>
              <Text style={[styles.segmentText, condition === "B" && styles.segmentTextActive]}>B · 연속캔버스+도형</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>노트</Text>
          <TextInput
            onChangeText={setNote}
            placeholder="예: note1"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={note}
          />

          <View style={styles.buttonRow}>
            <Pressable onPress={onCancel} style={[styles.button, styles.ghostButton]}>
              <Text style={styles.ghostText}>취소</Text>
            </Pressable>
            <Pressable onPress={start} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryText}>기록 시작</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 22,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    gap: 6,
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  title: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },
  segment: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  segmentActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  segmentText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },
  button: {
    flex: 1,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  ghostButton: {
    backgroundColor: "#f1f5f9",
  },
  ghostText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "800",
  },
  primaryButton: {
    backgroundColor: "#16a34a",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
