import { MIN_FLASH_GAP_MS, type LiveFlash, type ShowState, type TimelineCue } from "./protocol";

function cueAt(timeline: TimelineCue[], showMs: number) {
  let lo = 0;
  let hi = timeline.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].atMs <= showMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const cue = timeline[best];
  return showMs < cue.atMs + cue.onMs ? cue : null;
}

export function showTimeMs(state: ShowState, serverNow: number) {
  if (state.startedAtServerMs == null) return null;
  return serverNow - state.startedAtServerMs;
}

export function isLit(
  state: ShowState,
  serverNow: number,
  liveFlashes: LiveFlash[],
): { on: boolean; color: string } {
  for (const flash of liveFlashes) {
    if (serverNow >= flash.atServerMs && serverNow < flash.atServerMs + flash.onMs) {
      return { on: true, color: flash.color };
    }
  }

  const showMs = showTimeMs(state, serverNow);
  if (!state.playing || showMs == null || showMs < 0) {
    return { on: false, color: state.color };
  }

  if (state.pattern === "hold") {
    return { on: true, color: state.color };
  }

  if (state.pattern === "beat") {
    const interval = Math.max(MIN_FLASH_GAP_MS, 60_000 / Math.max(1, state.bpm));
    const onMs = Math.min(90, interval * 0.2);
    return { on: showMs % interval < onMs, color: state.color };
  }

  if (state.pattern === "pulse") {
    return { on: showMs % 400 < 100, color: state.color };
  }

  const cue = cueAt(state.timeline, showMs);
  if (cue) {
    return { on: true, color: cue.color ?? state.color };
  }

  return { on: false, color: state.color };
}
