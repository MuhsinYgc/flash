"use client";

import { connectShow } from "@/lib/show/connect";
import { createGovernor } from "@/lib/show/flash-governor";
import { defaultShowState, type LiveFlash, type ShowState } from "@/lib/show/protocol";
import { isLit } from "@/lib/show/timeline-player";
import { acquireTorch, torchMessage, type TorchControl } from "@/lib/show/torch";
import { useEffect, useRef, useState } from "react";

function requestFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const result = req.call(el) as Promise<void> | void;
    if (result && typeof result.catch === "function") {
      void result.catch(() => undefined);
    }
  } catch {
    // iOS often rejects fullscreen; screen flash still works.
  }
}

export function JoinClient({ roomId, start = false }: { roomId: string; start?: boolean }) {
  const [joined, setJoined] = useState(start);
  const [error, setError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const [torchBusy, setTorchBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [playing, setPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const torchRef = useRef<TorchControl | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const litRef = useRef(false);

  useEffect(() => {
    if (!joined) return;

    const governor = createGovernor();
    let state: ShowState = defaultShowState();
    const liveFlashes: LiveFlash[] = [];
    let frame = 0;
    let cancelled = false;
    let blocked = false;

    function applyLight(on: boolean) {
      if (on && !litRef.current) {
        if (blocked) return;
        if (!governor.allow(performance.now())) {
          blocked = true;
          return;
        }
        litRef.current = true;
        setTorchOn(true);
        void torchRef.current?.setTorch(true);
        return;
      }
      if (!on && (litRef.current || blocked)) {
        blocked = false;
        litRef.current = false;
        setTorchOn(false);
        void torchRef.current?.setTorch(false);
      }
    }

    requestFullscreen();
    if (navigator.wakeLock?.request) {
      void navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (cancelled) {
            void lock.release();
            return;
          }
          wakeLockRef.current = lock;
        })
        .catch(() => undefined);
    }

    const session = connectShow("audience", roomId, {
      onConnected: (ok) => {
        if (!cancelled) setConnected(ok);
      },
      onState: (next, _count) => {
        state = next;
        setPlaying(next.playing);
      },
      onFlash: (flash) => {
        liveFlashes.push(flash);
      },
      onError: (message) => setError(message),
    });

    function tick() {
      const now = session.clock.serverNow();
      const next = isLit(state, now, liveFlashes);
      applyLight(next.on);
      const cutoff = now - 2000;
      for (let i = liveFlashes.length - 1; i >= 0; i -= 1) {
        if (liveFlashes[i].atServerMs + liveFlashes[i].onMs < cutoff) {
          liveFlashes.splice(i, 1);
        }
      }
      frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      session.close();
      torchRef.current?.stop();
      torchRef.current = null;
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [joined, roomId]);

  async function enableTorch() {
    setTorchBusy(true);
    setError("");
    try {
      const torch = await acquireTorch(videoRef.current);
      torchRef.current = torch;
      torch.attach(videoRef.current);
      setTorchSupported(torch.supported);
      if (!torch.supported) {
        setError(torchMessage(torch.reason));
      }
    } catch (err) {
      setTorchSupported(false);
      setError(err instanceof Error ? err.message : "Flaş açılamadı.");
    } finally {
      setTorchBusy(false);
    }
  }

  if (!joined) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
          Oda {roomId}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Işık gösterisine katıl</h1>
        <p className="mt-3 text-sm leading-6 text-foreground/70">
          Butona bas, sonra LED flaşı aç. Şimdilik yalnız telefon flaşı
          yanacak; ekranda gösteri yok. Işığa duyarlıysan devam etme.
          Sekmeyi açık bırak.
        </p>
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <a
          href={`/join?room=${encodeURIComponent(roomId)}&go=1`}
          className="mt-8 flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl bg-accent px-4 py-3 text-base font-semibold text-white"
        >
          Anladim — katil
        </a>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#111318]">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      <div className="absolute inset-x-4 top-6 text-center text-white">
        <p className="text-lg font-semibold drop-shadow">
          {connected ? (playing ? "Gösteri oynuyor" : "Bağlandı — operatörü bekle") : "Bağlanıyor…"}
        </p>
        <p className="mt-2 text-sm text-white/80 drop-shadow">
          {torchSupported ? (torchOn ? "LED açık" : "LED hazır") : "LED kapalı — aşağıdan aç"}
        </p>
        {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
        {torchSupported == null ? (
          <button
            type="button"
            onClick={() => void enableTorch()}
            disabled={torchBusy}
            className="mt-6 min-h-12 rounded-xl bg-white/20 px-4 py-3 text-sm font-semibold backdrop-blur-sm disabled:opacity-60"
          >
            {torchBusy ? "Kamera izni bekleniyor…" : "LED flaşı da aç"}
          </button>
        ) : null}
      </div>
    </main>
  );
}
