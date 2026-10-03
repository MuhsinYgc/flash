import type { ServerMessage } from "./protocol";

const ROUNDS = 6;

export function createClockSync() {
  let offsetMs = 0;
  const samples: number[] = [];
  let pending: { t0: number; resolve: (offset: number) => void } | null = null;

  function serverNow(at = Date.now()) {
    return at + offsetMs;
  }

  function handlePong(msg: Extract<ServerMessage, { type: "pong" }>) {
    if (pending && pending.t0 !== msg.t0) return;
    const t3 = Date.now();
    const offset = (msg.t1 - msg.t0 + (msg.t2 - t3)) / 2;
    samples.push(offset);
    const mid = [...samples].sort((a, b) => a - b);
    offsetMs = mid[Math.floor(mid.length / 2)] ?? offset;
    pending?.resolve(offsetMs);
    pending = null;
  }

  async function syncOnce(send: (t0: number) => void) {
    if (pending) return offsetMs;
    const t0 = Date.now();
    const offset = await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending = null;
        reject(new Error("Clock sync timed out"));
      }, 2000);
      pending = {
        t0,
        resolve: (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
      };
      send(t0);
    });
    return offset;
  }

  async function calibrate(send: (t0: number) => void) {
    samples.length = 0;
    for (let i = 0; i < ROUNDS; i += 1) {
      try {
        await syncOnce(send);
      } catch {
        break;
      }
    }
    return offsetMs;
  }

  return {
    serverNow,
    handlePong,
    calibrate,
    get offsetMs() {
      return offsetMs;
    },
  };
}
