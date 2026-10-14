import {
  AUDIENCE_TORCH_LEAD_ANDROID_MS,
  AUDIENCE_TORCH_LEAD_DEFAULT_MS,
  AUDIENCE_TORCH_LEAD_MAX_MS,
} from "./protocol";

export function isAndroidUa() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

export function platformTorchLeadMs() {
  if (typeof navigator === "undefined") return AUDIENCE_TORCH_LEAD_DEFAULT_MS;
  if (/android/i.test(navigator.userAgent)) return AUDIENCE_TORCH_LEAD_ANDROID_MS;
  return AUDIENCE_TORCH_LEAD_DEFAULT_MS;
}

export function combineTorchLeadMs(measuredMs: number, platformMs = platformTorchLeadMs()) {
  const measured = Number.isFinite(measuredMs) ? Math.max(0, Math.round(measuredMs)) : 0;
  const android = isAndroidUa();
  const padding = android ? 40 : 0;
  const blended = Math.max(measured + padding, platformMs);
  return Math.min(AUDIENCE_TORCH_LEAD_MAX_MS, blended);
}
