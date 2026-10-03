"use client";

import { beatsToCues, detectBeats } from "@/lib/show/beat-detect";
import { connectShow } from "@/lib/show/connect";
import {
  PLAY_LEAD_MS,
  SHOW_COLORS,
  defaultShowState,
  sanitizeRoomId,
  type ClientMessage,
  type ShowPattern,
  type ShowState,
  type TimelineCue,
} from "@/lib/show/protocol";
import { showTimeMs } from "@/lib/show/timeline-player";
import { createTrackPlayer } from "@/lib/show/track-player";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";

type LoadedTrack = {
  name: string;
  durationMs: number;
  bpm: number;
  cues: TimelineCue[];
  buffer: AudioBuffer;
};

const DEFAULT_PUBLIC_ORIGIN = "https://192.168.1.70:3200";

const PATTERNS: { id: ShowPattern; label: string; hint: string }[] = [
  { id: "beat", label: "Beat", hint: "Flash on each beat" },
  { id: "pulse", label: "Pulse", hint: "Steady 2.5 Hz pulse" },
  { id: "hold", label: "Hold", hint: "Solid light while playing" },
  { id: "timeline", label: "Demo", hint: "16 beats, then hits" },
];

export function OperatorClient({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState(roomId);
  const [publicOrigin, setPublicOrigin] = useState(DEFAULT_PUBLIC_ORIGIN);
  const [qr, setQr] = useState("");
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [audienceCount, setAudienceCount] = useState(0);
  const [state, setState] = useState<ShowState>(defaultShowState);
  const [clockMs, setClockMs] = useState(0);
  const [error, setError] = useState("");
  const [track, setTrack] = useState<LoadedTrack | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const sendRef = useRef<(msg: ClientMessage) => void | Promise<void>>(() => undefined);
  const sessionRef = useRef<ReturnType<typeof connectShow> | null>(null);
  const playerRef = useRef<ReturnType<typeof createTrackPlayer> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const trackRef = useRef<LoadedTrack | null>(null);
  const seekingRef = useRef(false);

  const origin = normalizeJoinOrigin(publicOrigin) || DEFAULT_PUBLIC_ORIGIN;
  const joinUrl = useMemo(() => {
    return `${origin}/join?room=${encodeURIComponent(room)}`;
  }, [origin, room]);
  const wrongPort = /:32000\b/.test(publicOrigin);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#152028", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    let latest = defaultShowState();
    const session = connectShow("operator", room, {
      onConnected: (ok) => {
        setConnected(ok);
        setSynced(ok);
        if (ok) setError("");
      },
      onState: (next, count) => {
        const loaded = trackRef.current;
        latest = loaded
          ? {
              ...next,
              pattern: "timeline",
              timeline: loaded.cues,
              bpm: loaded.bpm,
            }
          : next;
        setState(latest);
        setAudienceCount(count);
      },
      onFlash: () => undefined,
      onError: (message) => setError(message),
    });
    sendRef.current = session.send;
    sessionRef.current = session;

    const timer = window.setInterval(() => {
      const showMs = showTimeMs(latest, session.clock.serverNow());
      const loaded = trackRef.current;
      const nextPos = Math.max(0, Math.min(loaded?.durationMs ?? Infinity, showMs ?? 0));
      setClockMs(nextPos);
      if (loaded && latest.playing && !seekingRef.current) {
        setPositionMs(nextPos);
      }
    }, 80);

    return () => {
      window.clearInterval(timer);
      sendRef.current = () => undefined;
      sessionRef.current = null;
      session.close();
    };
  }, [room]);

  useEffect(() => {
    playerRef.current = createTrackPlayer();
    return () => {
      playerRef.current?.close();
      playerRef.current = null;
    };
  }, []);

  function send(msg: ClientMessage) {
    if (msg.type === "setBpm") {
      setState((current) => ({ ...current, bpm: msg.bpm }));
    }
    if (msg.type === "setPattern") {
      setState((current) => ({ ...current, pattern: msg.pattern }));
    }
    if (msg.type === "setColor") {
      setState((current) => ({ ...current, color: msg.color }));
    }
    void sendRef.current(msg);
  }

  async function onPickTrack(file: File | undefined) {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) {
      setError("Dosya 40 MB’dan küçük olmalı.");
      return;
    }
    setError("");
    setAnalyzing(true);
    stopAudio();
    try {
      const player = playerRef.current ?? createTrackPlayer();
      playerRef.current = player;
      const buffer = await player.decode(file);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      const map = detectBeats(buffer);
      const cues = beatsToCues(map.beatsMs);
      if (cues.length < 8) {
        throw new Error("Bu kayıtta yeterli beat bulunamadı. Daha net bir parça dene.");
      }
      const loaded = {
        name: file.name,
        durationMs: map.durationMs,
        bpm: Math.round(map.bpm),
        cues,
        buffer,
      };
      trackRef.current = loaded;
      setTrack(loaded);
      setPositionMs(0);
      setState((current) => ({
        ...current,
        playing: false,
        startedAtServerMs: null,
        bpm: loaded.bpm,
        pattern: "timeline",
        timeline: cues,
      }));
      await sendRef.current({ type: "stop" });
      await sendRef.current({ type: "setBpm", bpm: loaded.bpm });
      await sendRef.current({ type: "setTimeline", cues });
    } catch (err) {
      trackRef.current = null;
      setTrack(null);
      setError(err instanceof Error ? err.message : "Şarkı analiz edilemedi.");
    } finally {
      setAnalyzing(false);
    }
  }

  function stopAudio() {
    sourceRef.current = null;
    playerRef.current?.stop();
  }

  async function playFrom(offsetMs: number) {
    const loaded = trackRef.current;
    if (!loaded) {
      setError("Önce bir şarkı yükle.");
      return;
    }
    if (!playerRef.current || !sessionRef.current) {
      setError("Show sunucusuna bağlı değil. Sayfayı yenile.");
      return;
    }
    const duration = loaded.durationMs;
    const offset = Math.max(0, Math.min(duration - 50, offsetMs));
    setError("");
    const player = playerRef.current;
    await player.resume();
    await sessionRef.current.calibrate();
    const startCtx = player.now() + PLAY_LEAD_MS / 1000;
    const startedAtServerMs = Math.round(
      sessionRef.current.clock.serverNow() + PLAY_LEAD_MS - offset,
    );
    const source = await player.playAt(loaded.buffer, startCtx, offset / 1000);
    sourceRef.current = source;
    void sendRef.current({
      type: "playTrack",
      startedAtServerMs,
      bpm: loaded.bpm,
      cues: loaded.cues,
    });
    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null;
        setPositionMs(loaded.durationMs);
        send({ type: "stop" });
        setState((current) => ({ ...current, playing: false }));
      }
    };
    setPositionMs(offset);
    setState((current) => ({
      ...current,
      playing: true,
      startedAtServerMs,
      pattern: "timeline",
      bpm: loaded.bpm,
      timeline: loaded.cues,
    }));
  }

  function handlePause() {
    const loaded = trackRef.current;
    const live =
      loaded && sessionRef.current
        ? showTimeMs(state, sessionRef.current.clock.serverNow())
        : positionMs;
    const current = loaded
      ? Math.max(0, Math.min(loaded.durationMs, live ?? positionMs))
      : positionMs;
    stopAudio();
    setPositionMs(current);
    send({ type: "stop" });
    setState((prev) => ({ ...prev, playing: false }));
  }

  function handleStop() {
    stopAudio();
    setPositionMs(0);
    send({ type: "stop" });
    setState((current) => ({ ...current, playing: false, startedAtServerMs: null }));
  }

  async function seekTo(nextMs: number) {
    const loaded = trackRef.current;
    if (!loaded) return;
    const offset = Math.max(0, Math.min(loaded.durationMs, nextMs));
    setPositionMs(offset);
    if (state.playing) {
      await playFrom(offset);
    }
  }

  const localhost =
    origin.includes("localhost") || origin.includes("127.0.0.1");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
            Operator
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Light show</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <Pill ok={connected} label={connected ? "Console live" : "Offline"} />
          <Pill ok={synced} label={synced ? "Clock synced" : "Syncing"} />
          <Pill ok={audienceCount > 0} label={`${audienceCount} phones`} />
          <Pill
            ok={state.playing}
            label={
              track
                ? `${formatClock(positionMs)} / ${formatClock(track.durationMs)}`
                : state.playing
                  ? formatClock(clockMs)
                  : "Stopped"
            }
          />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Audience QR</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Phones scan this, accept the warning, and stay on the page.
          </p>
          <label className="mt-4 block text-xs font-medium text-foreground/60">
            Public site URL
            <input
              value={origin}
              onChange={(event) => setPublicOrigin(normalizeJoinOrigin(event.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-foreground/60">
            Room
            <input
              value={room}
              onChange={(event) => setRoom(sanitizeRoomId(event.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          {wrongPort ? (
            <p className="mt-3 text-xs leading-5 text-red-700">
              Port 32000 yanlis. 3200 olmali: http://192.168.1.70:3200
            </p>
          ) : null}
          {localhost ? (
            <p className="mt-3 text-xs leading-5 text-foreground/60">
              Telefona localhost yazma. Kutuyu http://192.168.1.70:3200
              olarak bırak, sonra QR’ı oku.
            </p>
          ) : null}
          <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Join QR code" className="h-48 w-48" />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center text-xs text-foreground/50">
                QR unavailable
              </div>
            )}
          </div>
          <p className="mt-3 break-all text-xs text-foreground/60">{joinUrl}</p>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Show control</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Şarkı yüklüyken flaş o parçanın vuruşlarına kilitlenir.
            Demo / Beat kullanılmaz. Duraklatınca kaldığın yerden devam eder.
          </p>

          <label className="mt-5 block rounded-xl border border-dashed border-border bg-background px-4 py-4 text-sm">
            <span className="font-medium">Şarkı yükle</span>
            <input
              type="file"
              accept="audio/*"
              className="mt-2 block w-full text-xs"
              disabled={analyzing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onPickTrack(file);
              }}
            />
            <p className="mt-2 text-xs text-foreground/60">
              {analyzing
                ? "Beat analizi yapılıyor…"
                : track
                  ? `${track.name} · ${formatClock(track.durationMs)} · ${track.bpm} BPM · ${track.cues.length} flaş`
                  : "MP3, WAV veya M4A. En fazla 40 MB."}
            </p>
          </label>

          {track ? (
            <div className="mt-5 rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>{formatClock(positionMs)}</span>
                <span className="font-medium text-foreground">
                  Şarkı ritmi · {track.bpm} BPM · {track.cues.length} vuruş
                </span>
                <span>{formatClock(track.durationMs)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={track.durationMs}
                step={100}
                value={Math.min(positionMs, track.durationMs)}
                className="mt-3 w-full"
                onPointerDown={() => {
                  seekingRef.current = true;
                }}
                onChange={(event) => setPositionMs(Number(event.target.value))}
                onPointerUp={(event) => {
                  const next = Number((event.target as HTMLInputElement).value);
                  seekingRef.current = false;
                  void seekTo(next);
                }}
              />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (state.playing) handlePause();
                else void playFrom(positionMs);
              }}
              disabled={analyzing || !track}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {state.playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"
            >
              Başa sar
            </button>
            <button
              type="button"
              onClick={() => send({ type: "flash", onMs: 100 })}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
            >
              Flash now
            </button>
          </div>

          {!track ? (
          <div className="mt-6">
            <p className="text-xs font-medium text-foreground/60">Pattern</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PATTERNS.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => send({ type: "setPattern", pattern: pattern.id })}
                  className={`rounded-xl border px-3 py-2 text-left ${
                    state.pattern === pattern.id
                      ? "border-accent bg-accent/10"
                      : "border-border"
                  }`}
                >
                  <span className="block text-sm font-semibold">{pattern.label}</span>
                  <span className="block text-xs text-foreground/60">{pattern.hint}</span>
                </button>
              ))}
            </div>
          </div>
          ) : null}

          {!track ? (
          <label className="mt-6 block text-xs font-medium text-foreground/60">
            BPM {state.bpm}
            <input
              type="range"
              min={60}
              max={170}
              value={state.bpm}
              onChange={(event) => send({ type: "setBpm", bpm: Number(event.target.value) })}
              className="mt-2 w-full"
            />
          </label>
          ) : null}

          <div className="mt-5">
            <p className="text-xs font-medium text-foreground/60">Color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SHOW_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => send({ type: "setColor", color: item.value })}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    state.color === item.value ? "border-accent" : "border-border"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ backgroundColor: item.value }}
                  />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        </article>
      </section>
    </main>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        ok ? "bg-accent/10 text-accent" : "bg-background text-foreground/60"
      }`}
    >
      {label}
    </span>
  );
}

function normalizeJoinOrigin(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  const withProtocol = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.port === "32000" || url.port === "320") url.port = "3200";
    return url.origin;
  } catch {
    return trimmed.replace(":32000", ":3200");
  }
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
