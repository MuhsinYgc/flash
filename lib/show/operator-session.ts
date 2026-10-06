const TOKEN_KEY = "flash.operator.token";
const LEAD_KEY = "flash.trackLeadMs";
const AUTH_EVENT = "flash-operator-auth";

export function getOperatorToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function subscribeOperatorToken(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

function notifyAuth() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function setOperatorToken(token: string) {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  notifyAuth();
}

export function clearOperatorToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
  notifyAuth();
}

export function loadTrackLeadMs(fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = Number(window.localStorage.getItem(LEAD_KEY));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(400, Math.max(0, Math.round(raw)));
}

export function saveTrackLeadMs(value: number) {
  window.localStorage.setItem(LEAD_KEY, String(Math.round(value)));
}
