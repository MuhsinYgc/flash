import type { TimelineCue } from "./protocol";

export type StoredTrack = {
  videoId: string;
  title: string;
  bpm: number;
  durationMs: number;
  cues: TimelineCue[];
};

export type PlaylistRow = StoredTrack & {
  status: "analyzing" | "ready" | "error";
  error?: string;
};

const STORAGE_KEY = "flash.youtube.playlist";

export function parseYouTubeVideoId(value: string) {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v") ?? "";
      if (/^[a-zA-Z0-9_-]{11}$/.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts[0];
      const id = parts[1] ?? "";
      if (
        (marker === "shorts" || marker === "embed" || marker === "live") &&
        /^[a-zA-Z0-9_-]{11}$/.test(id)
      ) {
        return id;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isTrack(value: unknown): value is StoredTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as StoredTrack;
  return (
    typeof track.videoId === "string" &&
    /^[a-zA-Z0-9_-]{11}$/.test(track.videoId) &&
    typeof track.title === "string" &&
    Number.isFinite(track.bpm) &&
    Number.isFinite(track.durationMs) &&
    Array.isArray(track.cues) &&
    track.cues.length >= 8 &&
    track.cues.every((cue) => Number.isFinite(cue?.atMs) && Number.isFinite(cue?.onMs))
  );
}

export function loadPlaylist() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrack);
  } catch {
    return [];
  }
}

const serverRows: PlaylistRow[] = [];
let rows: PlaylistRow[] = serverRows;
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  rows = loadPlaylist().map((track) => ({ ...track, status: "ready" as const }));
}

export function subscribePlaylist(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlaylistSnapshot() {
  ensureLoaded();
  return rows;
}

export function getPlaylistServerSnapshot() {
  return serverRows;
}

export function commitPlaylist(recipe: (list: PlaylistRow[]) => PlaylistRow[]) {
  ensureLoaded();
  rows = recipe(rows);
  savePlaylist(rows.filter((track) => track.status === "ready"));
  listeners.forEach((listener) => listener());
}

export function savePlaylist(tracks: StoredTrack[]) {
  const stored = tracks.map((track) => ({
    videoId: track.videoId,
    title: track.title,
    bpm: track.bpm,
    durationMs: track.durationMs,
    cues: track.cues.slice(0, 4096).map((cue) => ({
      atMs: Math.round(cue.atMs),
      onMs: Math.round(cue.onMs),
    })),
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}
