import { createClockSync } from "./clock-sync";
import {
  getShowDirectOrigin,
  getShowHttpUrl,
  type AudienceTorchHit,
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
  onTorchHit?: (hit: AudienceTorchHit) => void;
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
  let lastState: ShowState | null = null;
  let lastCount = 0;
  let knownVersion = 0;
  const securePage = window.location.protocol === "https:";
  const directOrigin = getShowDirectOrigin();
  const POLL_TICK_MS = 250;
  const HTTP_POLL_MS = role === "operator" ? 500 : 1000;
  // With WS up the snapshot only catches missed broadcasts; at 1000 phones this is ~250 req/s.
  const WS_BACKUP_POLL_MS = role === "operator" ? 5000 : 4000;
  const HTTP_SYNC_MS = 4000;
  let lastPollAt = 0;

  function markConnected() {
    handlers.onConnected(wsUp || httpUp);
  }

  function pruneSeen(now = Date.now()) {
    for (const [key, at] of seenFlashes) {
      if (now - at > 5000) seenFlashes.delete(key);
    }
  }

  function applyState(state: ShowState, count: number, version?: number) {
    lastState = state;
    lastCount = count;
    if (typeof version === "number") knownVersion = version;
    handlers.onState(state, count);
  }

  function handleMessage(msg: ServerMessage) {
    if (msg.type === "welcome" || msg.type === "state") {
      // Only seed clock on welcome; snapshot serverNow over HTTP skews offset (esp. on backup poll).
      if (msg.type === "welcome" && typeof msg.serverNow === "number") {
        clock.handleInstant(msg.serverNow);
      }
      applyState(msg.state, msg.audienceCount, msg.version);
    }
    if (msg.type === "anchor") {
      if (!lastState) {
        knownVersion = 0;
        return;
      }
      // A gap means we missed a full state broadcast; the next snapshot must resend it.
      knownVersion = msg.version === knownVersion + 1 ? msg.version : 0;
      lastState = { ...lastState, startedAtServerMs: msg.startedAtServerMs };
      handlers.onState(lastState, lastCount);
    }
    if (msg.type === "flash") {
      const key = `${msg.atServerMs}:${msg.onMs}:${msg.color}`;
      if (seenFlashes.has(key)) return;
      seenFlashes.set(key, Date.now());
      pruneSeen();
      handlers.onFlash(msg);
    }
    if (msg.type === "pong") clock.handlePong(msg);
    if (msg.type === "torchHit") handlers.onTorchHit?.(msg);
    if (msg.type === "error") {
      if (role === "audience" && msg.message === "Operator only.") return;
      handlers.onError?.(msg.message);
    }
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
    const query = new URLSearchParams(params).toString();
    if (directOrigin) return [`${directOrigin}${path}?${query}`, sameOrigin];
    if (securePage) return [sameOrigin];
    return [sameOrigin, `http://${window.location.hostname}:3202${path}?${query}`];
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
    if (closed || pollInFlight) return;
    pollInFlight = true;
    lastPollAt = Date.now();
    try {
      const t0 = Date.now();
      const params: Record<string, string> = {
        room: roomId,
        clientId: httpId,
        t0: String(t0),
        v: String(knownVersion),
      };
      if (role === "operator") params.role = "operator";
      if (wsUp) params.ws = "1";
      const res = await fetchFirst(httpUrls("/snapshot", params));
      if (!res) {
        httpUp = false;
        markConnected();
        return;
      }
      const data = (await res.json()) as {
        state: ShowState | null;
        version?: number;
        audienceCount: number;
        t1?: number;
        t2?: number;
        flashes?: Extract<ServerMessage, { type: "flash" }>[];
      };
      httpUp = true;
      markConnected();
      if (typeof data.t1 === "number") {
        handleMessage({ type: "pong", t0, t1: data.t1, t2: data.t2 ?? data.t1 });
      }
      if (data.state) {
        applyState(data.state, data.audienceCount, data.version);
      } else if (lastState && data.audienceCount !== lastCount) {
        applyState(lastState, data.audienceCount);
      }
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

  async function calibrate() {
    if (wsUp) {
      return clock.calibrate((t0) => socket.send({ type: "sync", t0 }));
    }
    return calibrateHttp();
  }

  async function calibrateInitial() {
    for (let i = 0; i < 25; i += 1) {
      if (wsUp) return calibrate();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    }
    return calibrateHttp();
  }

  const ready = calibrateInitial().catch(() => clock.offsetMs);
  void poll().then(() => {
    // Phones that scan the QR together would otherwise keep polling in lockstep.
    lastPollAt = Date.now() - Math.random() * WS_BACKUP_POLL_MS;
  });
  pollTimer = window.setInterval(() => {
    const interval = wsUp ? WS_BACKUP_POLL_MS : HTTP_POLL_MS;
    if (Date.now() - lastPollAt >= interval) void poll();
  }, POLL_TICK_MS);
  syncTimer = window.setInterval(() => {
    if (closed) return;
    if (wsUp) {
      socket.send({ type: "sync", t0: Date.now() });
      return;
    }
    void httpSync();
  }, HTTP_SYNC_MS);

  async function postCommand(payload: ClientMessage) {
    await fetch(getShowHttpUrl("/command"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, roomId }),
    }).catch(() => undefined);
  }

  async function send(msg: ClientMessage) {
    const payload =
      options.token && msg.type !== "sync" ? { ...msg, token: options.token } : msg;
    if (msg.type === "hello" || msg.type === "sync" || msg.type === "syncFlashReport") {
      if (wsUp) socket.send(payload);
      return;
    }
    // One path per command: the server fans every applied command out to all phones, so
    // sending over both HTTP and WS would double the broadcast.
    if (securePage && role === "operator") {
      await postCommand(payload);
      return;
    }
    if (wsUp) {
      socket.send(payload);
      return;
    }
    await postCommand(payload);
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
