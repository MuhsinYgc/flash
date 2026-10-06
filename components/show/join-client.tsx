"use client";

import {
  IconFlash,
  IconPhone,
  IconSpark,
  IconWifi,
} from "@/components/brand/icons";
import { TeamButton } from "@/components/brand/team-button";
import { TeamHeader } from "@/components/brand/team-header";
import { TeamLogo } from "@/components/brand/team-logo";
import { TEAM } from "@/lib/brand/team";
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
  const [joined] = useState(start);
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
      onState: (next) => {
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
      <main className="relative min-h-dvh w-full">
        <div className="h-1.5 bg-gradient-to-r from-team-cyan via-team-red to-team-cyan" />
        <div className="mx-auto flex min-h-[calc(100dvh-0.375rem)] w-full max-w-md flex-col justify-center px-5 py-10">
          <TeamHeader align="center" subtitle={`Oda ${roomId}`} logoSize={72} />
          <div className="card-premium mt-8 overflow-hidden rounded-2xl">
            <div className="panel-head px-5 py-3 text-center">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
                {TEAM.tagline}
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 text-team-red">
                <IconSpark className="h-5 w-5" />
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-team-ink">
                  Tribüne Katıl
                </h2>
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-team-muted">
                <li className="flex gap-3">
                  <IconPhone className="mt-0.5 h-4 w-4 shrink-0 text-team-cyan" />
                  Katıl, sonra flaşı aç. Yalnızca telefon flaşı yanacak.
                </li>
                <li className="flex gap-3">
                  <IconFlash className="mt-0.5 h-4 w-4 shrink-0 text-team-cyan" />
                  Işığa duyarlıysan devam etme. Sekmeyi açık bırak.
                </li>
              </ul>
              {error ? <p className="mt-4 text-sm text-team-red">{error}</p> : null}
              <a href={`/join?room=${encodeURIComponent(roomId)}&go=1`} className="mt-6 block">
                <TeamButton icon={<IconFlash className="h-5 w-5" />} className="w-full text-base">
                  Katıl
                </TeamButton>
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const statusText = connected
    ? playing
      ? "Gösteri oynuyor"
      : "Bağlandı — DJ'i bekle"
    : "Bağlanıyor…";

  return (
    <main className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-gradient-to-b from-team-ink via-[#2a0f18] to-team-red-dark">
      <div className="h-1.5 bg-gradient-to-r from-team-cyan via-team-red to-team-cyan" />
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(237,28,36,0.18),transparent_55%)]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10 text-center text-white">
        <TeamLogo size={64} className="mb-6 opacity-90 drop-shadow-lg" />
        <p className="font-display text-3xl font-bold uppercase tracking-wide drop-shadow">
          {statusText}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              connected ? "bg-white/15 ring-1 ring-white/25" : "bg-white/10"
            }`}
          >
            <IconWifi className="h-4 w-4" />
            {connected ? "Bağlı" : "Bağlanıyor"}
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              torchOn ? "bg-team-red/30 ring-1 ring-team-red/40" : "bg-white/10 ring-1 ring-white/20"
            }`}
          >
            <IconFlash className="h-4 w-4" />
            {torchSupported ? (torchOn ? "Flaş açık" : "Flaş hazır") : "Flaş kapalı"}
          </span>
        </div>
        {error ? <p className="mt-4 max-w-sm text-sm text-red-200">{error}</p> : null}
        {torchSupported !== true ? (
          <TeamButton
            variant="ghost"
            icon={<IconFlash className="h-6 w-6" />}
            onClick={() => void enableTorch()}
            disabled={torchBusy}
            className="mt-8 min-h-14 w-full max-w-xs border-2 border-white/40 text-base"
          >
            {torchBusy
              ? "Kamera izni bekleniyor…"
              : torchSupported === false
                ? "Flaşı tekrar dene"
                : "Flaşı aç"}
          </TeamButton>
        ) : null}
      </div>
    </main>
  );
}
