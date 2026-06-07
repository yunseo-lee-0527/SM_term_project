import AsyncStorage from "@react-native-async-storage/async-storage";

// Session event log for the A/B case study (design doc §6–8). The app records a
// timestamped stream of pen/navigation/object actions so pauses and the A/B
// metrics can be computed offline. Persisted to AsyncStorage continuously and
// exported per session via the Share sheet.

const LOG_STORAGE_KEY = "studyflow.logs.v1";
const MAX_SESSIONS = 50;
const SAVE_DEBOUNCE_MS = 800;

export type SessionMeta = {
  participant?: string;
  condition?: string; // "A" (baseline) | "B" (shape insertion)
  note?: string;
  label?: string;
};

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

// [x, y, epoch-ms] — rounded pen coordinates with capture time.
export type StrokePointLog = [number, number, number];

type EventBody =
  | ({ type: "session_start" } & SessionMeta)
  | { type: "session_end" }
  | {
      type: "stroke";
      tool: string;
      strokeId: string;
      startedAt: number;
      endedAt: number;
      durationMs: number;
      pointCount: number;
      bbox: BBox;
      points: StrokePointLog[];
      nearShapeIds: string[];
    }
  | { type: "erase"; mode: "stroke" | "precise"; removedStrokeIds: string[]; removedElementIds: string[]; addedStrokeIds: string[] }
  | { type: "shape_insert"; elementId: string; kind: string; x: number; y: number }
  | { type: "element_transform"; action: "move" | "resize" | "edit"; elementId: string; x: number; y: number; scaleX: number; scaleY: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; from: number; to: number }
  | { type: "page_change"; pageId: string }
  | { type: "page_delete"; pageId: string }
  | { type: "history"; action: "undo" | "redo"; kind: string };

export type LogEvent = EventBody & { seq: number; t: number };

export type SessionLog = {
  id: string;
  startedAt: number;
  endedAt?: number;
  meta: SessionMeta;
  events: LogEvent[];
};

let sessions: SessionLog[] = [];
let current: SessionLog | null = null;
let recording = false;
let seq = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function makeSessionId() {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildLabel(meta: SessionMeta): string | undefined {
  if (meta.label) {
    return meta.label;
  }
  const parts = [meta.participant, meta.condition, meta.note].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

async function persistNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify({ sessions }));
  } catch {
    // Logging must never break the app — drop persistence errors.
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    void persistNow();
  }, SAVE_DEBOUNCE_MS);
}

// Load persisted sessions. Always launch **idle** — recording never auto-starts;
// the user must press Start. Any session left open by a previous app exit is
// closed so its record is complete (and still exportable). Does not create one.
export async function hydrateLog(): Promise<{ session: SessionLog | null; recording: boolean }> {
  recording = false;
  try {
    const raw = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sessions?: SessionLog[] };
      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        sessions = parsed.sessions;
        current = sessions[sessions.length - 1];
        if (current.endedAt === undefined) {
          const lastEvent = current.events[current.events.length - 1];
          current.endedAt = lastEvent?.t ?? current.startedAt;
          void persistNow();
        }
        return { session: current, recording: false };
      }
    }
  } catch {
    // ignore and stay idle
  }
  return { session: null, recording: false };
}

export function isRecording(): boolean {
  return recording;
}

export function startSession(meta: SessionMeta): SessionLog {
  current = { id: makeSessionId(), startedAt: Date.now(), meta: { ...meta, label: buildLabel(meta) }, events: [] };
  recording = true;
  seq = 0;
  sessions.push(current);
  if (sessions.length > MAX_SESSIONS) {
    sessions = sessions.slice(-MAX_SESSIONS);
  }
  logEvent({ type: "session_start", ...current.meta });
  void persistNow();
  return current;
}

export function endSession(): SessionLog | null {
  if (!current) {
    return null;
  }
  if (recording) {
    logEvent({ type: "session_end" });
  }
  current.endedAt = Date.now();
  recording = false;
  void persistNow();
  return current;
}

// Events are only recorded between Start and End.
export function logEvent(body: EventBody) {
  if (!current || !recording) {
    return;
  }
  current.events.push({ ...body, seq: seq++, t: Date.now() } as LogEvent);
  scheduleSave();
}

export function getCurrentSession(): SessionLog | null {
  return current;
}

export function getCurrentLabel(): string {
  return current?.meta.label ?? "기록 중";
}

export function exportCurrentSessionJson(): string | null {
  return current ? JSON.stringify(current) : null;
}

export function exportAllSessionsJson(): string {
  return JSON.stringify({ sessions });
}
