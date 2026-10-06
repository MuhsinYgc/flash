import { getShowHttpUrl } from "./protocol";

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isPrivateLan(hostname: string) {
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isDevHost(hostname: string) {
  return isLoopbackHost(hostname) || isPrivateLan(hostname);
}

export function normalizeJoinOrigin(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.port === "32000" || url.port === "320") url.port = "3200";
    if (!url.port && isDevHost(url.hostname)) url.port = "3200";
    return url.origin;
  } catch {
    return trimmed.replace(":32000", ":3200");
  }
}

function pagePort() {
  if (typeof window === "undefined") return "3200";
  const port = window.location.port;
  if (port === "32000" || port === "320") return "3200";
  return port || "";
}

function pageProto() {
  if (typeof window === "undefined") return "https";
  return window.location.protocol === "https:" ? "https" : "http";
}

async function fetchNetworkHint(port: string, proto: string) {
  const params = { port: port || "3200", proto };
  const urls = [getShowHttpUrl("/network-hint", params)];
  if (typeof window !== "undefined") {
    urls.push(`http://${window.location.hostname}:3202/network-hint?port=${params.port}&proto=${proto}`);
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { recommended?: string };
      if (data.recommended) return normalizeJoinOrigin(data.recommended);
    } catch {
      // try next
    }
  }
  return "";
}

/** URL phones should use to open /join — LAN IP in local dev, public origin when deployed. */
export async function detectJoinOrigin() {
  if (typeof window === "undefined") return "";

  const hostname = window.location.hostname;

  if (!isLoopbackHost(hostname)) {
    return normalizeJoinOrigin(window.location.origin);
  }

  const port = pagePort();
  const proto = pageProto();
  const hinted = await fetchNetworkHint(port, proto);
  if (hinted) return hinted;

  return normalizeJoinOrigin(window.location.origin);
}
