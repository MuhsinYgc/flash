export type ShowRole = "audience" | "operator";
export type ShowPattern = "beat" | "pulse" | "hold" | "timeline";

export type TimelineCue = {
  atMs: number;
  onMs: number;
  color?: string;
};

export type ShowState = {
  playing: boolean;
  startedAtServerMs: number | null;
  bpm: number;
  color: string;
  pattern: ShowPattern;
  timeline: TimelineCue[];
};

export type LiveFlash = {
  atServerMs: number;
  onMs: number;
  color: string;
};

type ClientMessageBase =
  | { type: "hello"; role: ShowRole; roomId: string }
  | { type: "sync"; t0: number }
  | { type: "play" }
  | { type: "stop" }
  | { type: "setBpm"; bpm: number }
  | { type: "setColor"; color: string }
  | { type: "setPattern"; pattern: ShowPattern }
  | { type: "setTimeline"; cues: TimelineCue[] }
  | {
      type: "playTrack";
      startedAtServerMs: number;
      bpm?: number;
      cues?: TimelineCue[];
    }
  | { type: "reanchor"; startedAtServerMs: number }
  | { type: "flash"; onMs?: number };

export type ClientMessage = ClientMessageBase & { token?: string };

export const PLAY_LEAD_MS = 420;
/** Playback flash lead used by the operator YouTube loop. Do not change without a two-phone test. */
export const TRACK_FLASH_LEAD_MS = 170;
export const TRACK_FLASH_LEAD_MIN_MS = 0;
export const TRACK_FLASH_LEAD_MAX_MS = 400;

export type ServerMessage =
  | {
      type: "welcome";
      clientId: string;
      roomId: string;
      serverNow: number;
      state: ShowState;
      audienceCount: number;
    }
  | { type: "pong"; t0: number; t1: number; t2: number }
  | {
      type: "state";
      state: ShowState;
      audienceCount: number;
      serverNow: number;
    }
  | { type: "flash"; atServerMs: number; onMs: number; color: string }
  | { type: "error"; message: string };

export const SHOW_COLORS = [
  { id: "white", value: "#ffffff", label: "White" },
  { id: "gold", value: "#ffe566", label: "Gold" },
  { id: "cyan", value: "#7ee0ff", label: "Cyan" },
  { id: "green", value: "#8cffb0", label: "Green" },
] as const;

export const MAX_FLASH_HZ = 3;
export const MIN_FLASH_GAP_MS = Math.ceil(1000 / MAX_FLASH_HZ);

export const defaultShowState = (): ShowState => ({
  playing: false,
  startedAtServerMs: null,
  bpm: 120,
  color: "#ffffff",
  pattern: "timeline",
  timeline: [],
});

export function getShowWsUrl() {
  return getShowWsUrls()[0] ?? "";
}

export function getShowWsUrls() {
  if (typeof window === "undefined") return [];
  if (process.env.NEXT_PUBLIC_SHOW_WS_URL) {
    return [process.env.NEXT_PUBLIC_SHOW_WS_URL];
  }
  const host = window.location.hostname;
  const pageHost = window.location.host;
  const port = process.env.NEXT_PUBLIC_SHOW_WS_PORT ?? "3202";
  if (window.location.protocol === "https:") {
    return [`wss://${pageHost}/show-ws`, `wss://${host}:${port}`];
  }
  return [`ws://${host}:${port}`];
}

export function getShowHttpUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`/show-http${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function sanitizeRoomId(value: string | null | undefined) {
  const id = (value ?? "main").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
  return id || "main";
}
