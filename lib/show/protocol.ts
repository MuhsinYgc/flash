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

export type ClientMessage =
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
  | { type: "flash"; onMs?: number };

export const PLAY_LEAD_MS = 420;

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
  pattern: "beat",
  timeline: [],
});

export function getShowWsUrl() {
  if (process.env.NEXT_PUBLIC_SHOW_WS_URL) {
    return process.env.NEXT_PUBLIC_SHOW_WS_URL;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = process.env.NEXT_PUBLIC_SHOW_WS_PORT ?? "3202";
  return `${proto}//${window.location.hostname}:${port}`;
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
