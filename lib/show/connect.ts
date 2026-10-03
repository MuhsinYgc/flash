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

function newHttpId() {
  return `h${Math.random().toString(36).slice(2, 10)}`;
}

export function connectShow(role: ShowRole, roomId: string, handlers: Handlers) {
  const clock = createClockSync();
  const httpId = newHttpId();
  const seenFlashes = new Set<string>();
  let closed = false;
  let wsUp = false;
  let httpUp = false;
  let pollTimer = 0;
  let syncTimer = 0;

  function markConnected() {
    handlers.onConnected(wsUp || httpUp);
  }

  function handleMessage(msg: ServerMessage) {
    if (msg.type === "welcome" || msg.type === "state") {
      handlers.onState(msg.state, msg.audienceCount);
    }
    if (msg.type === "flash") {
      const key = `${msg.atServerMs}:${msg.onMs}:${msg.color}`;
      if (seenFlashes.has(key)) return;
      seenFlashes.add(key);
      handlers.onFlash(msg);
    }
    if (msg.type === "pong") clock.handlePong(msg);
    if (msg.type === "error") handlers.onError?.(msg.message);
  }

  const securePage = window.location.protocol === "https:";
  const socket = securePage
    ? null
    : connectShowSocket(role, roomId, {
        onOpen: () => {
          wsUp = true;
          markConnected();
          void clock.calibrate((t0) => socket?.send({ type: "sync", t0 }));
        },
        onClose: () => {
          wsUp = false;
          markConnected();
        },
        onMessage: handleMessage,
      });

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
    if (closed || wsUp) return;
    const res = await fetchFirst(httpUrls("/snapshot", { room: roomId, clientId: httpId }));
    if (!res) {
      httpUp = false;
      markConnected();
      return;
    }
    const data = (await res.json()) as {
      state: ShowState;
      audienceCount: number;
      flashes?: Extract<ServerMessage, { type: "flash" }>[];
    };
    httpUp = true;
    markConnected();
    handlers.onState(data.state, data.audienceCount);
    for (const flash of data.flashes ?? []) {
      handleMessage({ ...flash, type: "flash" });
    }
  }

  async function httpSync() {
    if (closed) return;
    const t0 = Date.now();
    const res = await fetchFirst(httpUrls("/sync", { t0: String(t0) }));
    if (!res) return;
    handleMessage((await res.json()) as ServerMessage);
  }

  async function calibrate() {
    for (let i = 0; i < 8; i += 1) {
      await httpSync();
    }
    return clock.offsetMs;
  }

  void poll();
  void httpSync();
  pollTimer = window.setInterval(() => {
    void poll();
  }, 160);
  syncTimer = window.setInterval(() => {
    void httpSync();
  }, 4000);

  async function send(msg: ClientMessage) {
    if (socket) {
      socket.send(msg);
      return;
    }
    await fetch(getShowHttpUrl("/command"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...msg, roomId }),
    }).catch(() => undefined);
  }

  return {
    clock,
    send,
    calibrate,
    close() {
      closed = true;
      window.clearInterval(pollTimer);
      window.clearInterval(syncTimer);
      socket?.close();
    },
  };
}
