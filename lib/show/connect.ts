import { createClockSync } from "./clock-sync";
import {
  getShowHttpUrl,
  type ClientMessage,
  type ServerMessage,
  type ShowRole,
  type ShowState,
} from "./protocol";
import { connectShowSocket } from "./socket";

type Handlers = {
  onState: (state: ShowState, audienceCount: number) => void;
  onFlash: (flash: Extract<ServerMessage, { type: "flash" }>) => void;
  onConnected: (connected: boolean) => void;
  onError?: (message: string) => void;
};

type ConnectOptions = {
  token?: string;
};

function newHttpId() {
  return `h${Math.random().toString(36).slice(2, 10)}`;
}

export function connectShow(
  role: ShowRole,
  roomId: string,
  handlers: Handlers,
  options: ConnectOptions = {},
) {
  const clock = createClockSync();
  const httpId = newHttpId();
  const seenFlashes = new Map<string, number>();
  let closed = false;
  let wsUp = false;
  let httpUp = false;
  let pollTimer = 0;
  let syncTimer = 0;
  let pollInFlight = false;
  const securePage = window.location.protocol === "https:";
  const HTTP_POLL_MS = 450;
  const HTTP_SYNC_MS = 4000;

  function markConnected() {
    handlers.onConnected(wsUp || httpUp);
  }

  function pruneSeen(now = Date.now()) {
    for (const [key, at] of seenFlashes) {
      if (now - at > 5000) seenFlashes.delete(key);
    }
  }

  function handleMessage(msg: ServerMessage) {
    if (msg.type === "welcome" || msg.type === "state") {
      if (typeof msg.serverNow === "number") {
        clock.handleInstant(msg.serverNow);
      }
      handlers.onState(msg.state, msg.audienceCount);
    }
    if (msg.type === "flash") {
      const key = `${msg.atServerMs}:${msg.onMs}:${msg.color}`;
      if (seenFlashes.has(key)) return;
      seenFlashes.set(key, Date.now());
      pruneSeen();
      handlers.onFlash(msg);
    }
    if (msg.type === "pong") clock.handlePong(msg);
    if (msg.type === "error") handlers.onError?.(msg.message);
  }

  const socket = connectShowSocket(
    role,
    roomId,
    {
      onOpen: () => {
        wsUp = true;
        markConnected();
      },
      onClose: () => {
        wsUp = false;
        markConnected();
      },
      onMessage: handleMessage,
    },
    {
      token: options.token,
      maxRetries: securePage ? 6 : 8,
    },
  );

  const connectProbeTimer = window.setTimeout(() => {
    if (closed || wsUp || httpUp) return;
    handlers.onError?.(
      "Sunucuya bağlanılamıyor. flash-api (port 3202) çalışıyor mu? Telefon aynı Wi‑Fi’de ve QR’daki IP adresiyle (localhost değil) açılmış olmalı.",
    );
  }, 12_000);

  function httpUrls(path: string, params: Record<string, string>) {
    const sameOrigin = getShowHttpUrl(path, params);
    if (securePage) return [sameOrigin];
    const query = new URLSearchParams(params).toString();
    const direct = `http://${window.location.hostname}:3202${path}?${query}`;
    return [sameOrigin, direct];
  }

  async function fetchFirst(urls: string[]) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) return res;
      } catch {
        // try next
      }
    }
    return null;
  }

  async function poll() {
    if (closed || wsUp || pollInFlight) return;
    pollInFlight = true;
    try {
      const t0 = Date.now();
      const params: Record<string, string> = {
        room: roomId,
        clientId: httpId,
        t0: String(t0),
      };
      if (role === "operator") params.role = "operator";
      const res = await fetchFirst(httpUrls("/snapshot", params));
      if (!res) {
        httpUp = false;
        markConnected();
        return;
      }
      const data = (await res.json()) as {
        state: ShowState;
        audienceCount: number;
        serverNow?: number;
        t1?: number;
        t2?: number;
        flashes?: Extract<ServerMessage, { type: "flash" }>[];
      };
      httpUp = true;
      markConnected();
      if (typeof data.t1 === "number") {
        handleMessage({ type: "pong", t0, t1: data.t1, t2: data.t2 ?? data.t1 });
      }
      handleMessage({
        type: "state",
        state: data.state,
        audienceCount: data.audienceCount,
        serverNow: typeof data.serverNow === "number" ? data.serverNow : Date.now(),
      });
      for (const flash of data.flashes ?? []) {
        handleMessage({ ...flash, type: "flash" });
      }
    } finally {
      pollInFlight = false;
    }
  }

  async function httpSync() {
    if (closed || wsUp) return;
    const t0 = Date.now();
    const res = await fetchFirst(httpUrls("/sync", { t0: String(t0) }));
    if (!res) return;
    handleMessage((await res.json()) as ServerMessage);
  }

  async function calibrateHttp() {
    for (let i = 0; i < 6; i += 1) {
      await httpSync();
    }
    return clock.offsetMs;
  }

  async function calibrateInitial() {
    for (let i = 0; i < 25; i += 1) {
      if (wsUp) {
        return clock.calibrate((t0) => socket.send({ type: "sync", t0 }));
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    }
    return calibrateHttp();
  }

  const ready = calibrateInitial().catch(() => clock.offsetMs);
  void poll();
  pollTimer = window.setInterval(() => {
    void poll();
  }, HTTP_POLL_MS);
  syncTimer = window.setInterval(() => {
    if (closed) return;
    if (wsUp) {
      socket.send({ type: "sync", t0: Date.now() });
      return;
    }
    void httpSync();
  }, HTTP_SYNC_MS);

  async function send(msg: ClientMessage) {
    const payload =
      options.token && msg.type !== "sync" ? { ...msg, token: options.token } : msg;
    if (wsUp) {
      socket.send(payload);
      return;
    }
    if (msg.type === "hello" || msg.type === "sync") return;
    await fetch(getShowHttpUrl("/command"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, roomId }),
    }).catch(() => undefined);
  }

  return {
    clock,
    send,
    calibrate,
    ready,
    close() {
      closed = true;
      window.clearTimeout(connectProbeTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(syncTimer);
      socket.close();
    },
  };
}
