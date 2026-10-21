import type { AudienceTorchHit, ShowState } from "./protocol";
import { activeTimelineCueIndex, showTimeMs } from "./timeline-player";

export function syncPlatformLabel(): "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

export function buildTorchHitReport(
  state: ShowState,
  serverNow: number,
  seq: number,
): { type: "syncFlashReport"; platform: string; showMs: number; cueIndex: number | null; seq: number } | null {
  const showMs = showTimeMs(state, serverNow);
  if (showMs == null || showMs < 0) return null;
  const rounded = Math.round(showMs);
  return {
    type: "syncFlashReport",
    platform: syncPlatformLabel(),
    showMs: rounded,
    cueIndex: activeTimelineCueIndex(state, rounded),
    seq,
  };
}

type Slot = Partial<Record<"android" | "ios", AudienceTorchHit>>;
const byCue = new Map<number, Slot>();
const comparedCues = new Set<number>();

export function resetTorchCompare() {
  byCue.clear();
  comparedCues.clear();
}

export function logOperatorTorchCompare(hit: AudienceTorchHit) {
  const platform = hit.platform === "android" || hit.platform === "ios" ? hit.platform : null;
  const cueLabel = hit.cueIndex != null ? `cue#${hit.cueIndex}` : `seq#${hit.seq}`;

  console.log(`[flash-compare] ${hit.platform} LED yandı @ showMs=${hit.showMs} (${cueLabel})`);

  if (platform == null || hit.cueIndex == null) return;

  const cue = hit.cueIndex;
  const row = byCue.get(cue) ?? {};
  row[platform] = hit;
  byCue.set(cue, row);

  if (!row.android || !row.ios || comparedCues.has(cue)) return;
  comparedCues.add(cue);

  const delta = row.android.showMs - row.ios.showMs;
  console.log(`[flash-compare] ANDROID vs IPHONE ${cueLabel}`, {
    iphoneShowMs: row.ios.showMs,
    androidShowMs: row.android.showMs,
    deltaMs: delta,
    meaning:
      delta < 0
        ? `Android ~${-delta}ms önde (daha erken)`
        : delta > 0
          ? `Android ~${delta}ms geride`
          : "aynı showMs",
  });
}
