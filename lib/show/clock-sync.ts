import type { ServerMessage } from "./protocol";

const ROUNDS = 6;

type ClockSample = { offset: number; rtt: number };

export function createClockSync() {
  let offsetMs = 0;
  const samples: ClockSample[] = [];
  let pending: { t0: number; resolve: (offset: number) => void } | null = null;

  function serverNow(at = Date.now()) {
    return at + offsetMs;
  }

  function handlePong(msg: Extract<ServerMessage, { type: "pong" }>) {
    const t3 = Date.now();
    const t0 = Number(msg.t0) || 0;
    const t1 = Number(msg.t1) || 0;
    const t2 = Number(msg.t2) || t1;
    if (t0 > 0 && t1 > 0) {
      const rtt = t3 - t0 - (t2 - t1);
      const offset = (t1 - t0 + (t2 - t3)) / 2;
      if (rtt >= 0 && rtt <= 700 && Number.isFinite(offset)) {
        samples.push({ offset, rtt });
        if (samples.length > 24) samples.shift();
        const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, 5);
        const mid = best.map((sample) => sample.offset).sort((a, b) => a - b);
        offsetMs = mid[Math.floor(mid.length / 2)] ?? offset;
      }
    }
    if (pending?.t0 === msg.t0) {
      pending.resolve(offsetMs);
      pending = null;
    }
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
