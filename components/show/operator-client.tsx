"use client";

import { beatsToCues, detectBeats } from "@/lib/show/beat-detect";
import { connectShow } from "@/lib/show/connect";
import { getShowHttpUrl, sanitizeRoomId, type ClientMessage } from "@/lib/show/protocol";
import {
  commitPlaylist,
  getPlaylistSnapshot,
  getPlaylistServerSnapshot,
  parseYouTubeVideoId,
  subscribePlaylist,
  type PlaylistRow,
} from "@/lib/show/youtube";
import {
  mountYouTubePlayer,
  YT_ENDED,
  YT_PLAYING,
  type BoothPlayer,
} from "@/lib/show/youtube-player";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

type Phase = "idle" | "gap" | "playing";
type Row = PlaylistRow;

const DEFAULT_PUBLIC_ORIGIN = "https://192.168.1.70:3200";
const FLASH_LEAD_MS = 170;
const SEEK_MS = 400;
const LOOP_MS = 500;
const CUE_ON_MS = 120;

export function OperatorClient({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState(roomId);
  const [publicOrigin, setPublicOrigin] = useState(DEFAULT_PUBLIC_ORIGIN);
  const [qr, setQr] = useState("");
  const [connected, setConnected] = useState(false);
  const [audienceCount, setAudienceCount] = useState(0);
  const playlist = useSyncExternalStore(
    subscribePlaylist,
    getPlaylistSnapshot,
    getPlaylistServerSnapshot,
  );
  const [selectedId, setSelectedId] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const [wantPlay, setWantPlay] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [positionMs, setPositionMs] = useState(0);

  const sendRef = useRef<(msg: ClientMessage) => void | Promise<void>>(() => undefined);
  const sessionRef = useRef<ReturnType<typeof connectShow> | null>(null);
  const playerRef = useRef<BoothPlayer | null>(null);
  const currentIdRef = useRef("");
  const wantPlayRef = useRef(false);
  const anchoredRef = useRef(false);
  const anchorAtRef = useRef<number | null>(null);
  const flashedStopRef = useRef(false);
  const lastTimeRef = useRef(0);
  const stallRef = useRef(0);
  const endedForRef = useRef("");
  const onEndedRef = useRef(() => undefined);
  const clockReadyRef = useRef(false);
  const mountedRef = useRef(true);

  const origin = normalizeJoinOrigin(publicOrigin) || DEFAULT_PUBLIC_ORIGIN;
  const joinUrl = useMemo(
    () => `${origin}/join?room=${encodeURIComponent(room)}`,
    [origin, room],
  );
  const wrongPort = /:32000\b/.test(publicOrigin);
  const localhost = origin.includes("localhost") || origin.includes("127.0.0.1");
  const selected = playlist.find((track) => track.videoId === selectedId) ?? null;
  const current = playlist.find((track) => track.videoId === currentId) ?? null;
  const readyTracks = playlist.filter((track) => track.status === "ready");
  const orderId = currentId || selectedId;
  const orderIndex = readyTracks.findIndex((track) => track.videoId === orderId);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    let cancelled = false;
    anchoredRef.current = false;
    anchorAtRef.current = null;
    flashedStopRef.current = false;
    clockReadyRef.current = false;
    const session = connectShow("operator", room, {
      onConnected: (ok) => setConnected(ok),
      onState: (_next, count) => setAudienceCount(count),
      onFlash: () => undefined,
      onError: (message) => setError(message),
    });
    sendRef.current = session.send;
    sessionRef.current = session;
    void session.ready.then(() => {
      if (!cancelled) clockReadyRef.current = true;
    });
    return () => {
      cancelled = true;
      clockReadyRef.current = false;
      sendRef.current = () => undefined;
      sessionRef.current = null;
      session.close();
    };
  }, [room]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let player: BoothPlayer | null = null;
    void mountYouTubePlayer("booth-player", (state) => {
      if (state === YT_ENDED) onEndedRef.current();
    }).then((handle) => {
      if (cancelled) {
        handle.destroy();
        return;
      }
      player = handle;
      playerRef.current = handle;
      setPlayerReady(true);
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      player?.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    onEndedRef.current = () => {
      if (!mountedRef.current) return;
      const active = playerRef.current;
      const id = active?.videoId() ?? "";
      if (!id || endedForRef.current === id || id !== currentIdRef.current) return;
      endedForRef.current = id;
      if (!wantPlayRef.current) return;
      const list = getPlaylistSnapshot().filter((track) => track.status === "ready");
      const index = list.findIndex((track) => track.videoId === id);
      const next = list[index + 1];
      if (!next) {
        setTransport(false);
        halt();
        setPhase("idle");
        return;
      }
      begin(next, true);
    };
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      const session = sessionRef.current;
      if (!player || !session || !wantPlayRef.current) return;
      const track = getPlaylistSnapshot().find(
        (item) => item.videoId === currentIdRef.current && item.status === "ready",
      );
      if (!track) return;

      const state = player.state();
      const timeMs = player.currentTimeMs();
      setPositionMs(timeMs);

      if (state !== YT_PLAYING) {
        stallRef.current = 0;
        lastTimeRef.current = timeMs;
        if (anchoredRef.current) {
          halt();
          setPhase((currentPhase) => (currentPhase === "gap" ? currentPhase : "gap"));
        }
        return;
      }

      const advanced = timeMs > lastTimeRef.current + 15;
      lastTimeRef.current = timeMs;
      if (!advanced) {
        stallRef.current += 1;
        if (anchoredRef.current && stallRef.current >= 2) {
          halt();
          setPhase("gap");
        }
        return;
      }
      stallRef.current = 0;

      const serverNow = session.clock.serverNow();
      if (!anchoredRef.current || anchorAtRef.current == null) {
        if (!clockReadyRef.current) return;
        const startedAtServerMs = Math.round(serverNow - timeMs - FLASH_LEAD_MS);
        anchorAtRef.current = startedAtServerMs;
        anchoredRef.current = true;
        flashedStopRef.current = false;
        setPhase("playing");
        void sendRef.current({
          type: "playTrack",
          startedAtServerMs,
          bpm: track.bpm,
          cues: track.cues.map((cue) => ({ atMs: cue.atMs, onMs: Math.max(CUE_ON_MS, cue.onMs) })),
        });
        return;
      }

      const errorMs = timeMs - (serverNow - anchorAtRef.current - FLASH_LEAD_MS);
      if (Math.abs(errorMs) > SEEK_MS) {
        halt();
        setPhase("gap");
        return;
      }
      setPhase((currentPhase) => (currentPhase === "playing" ? currentPhase : "playing"));
    }, LOOP_MS);
    return () => window.clearInterval(timer);
  }, []);

  function halt() {
    anchoredRef.current = false;
    anchorAtRef.current = null;
    if (flashedStopRef.current) return;
    flashedStopRef.current = true;
    void sendRef.current({ type: "stop" });
  }

  function setTransport(next: boolean) {
    wantPlayRef.current = next;
    setWantPlay(next);
  }

  function begin(track: Row, autoplay: boolean) {
    endedForRef.current = "";
    stallRef.current = 0;
    lastTimeRef.current = 0;
    anchoredRef.current = false;
    anchorAtRef.current = null;
    currentIdRef.current = track.videoId;
    setCurrentId(track.videoId);
    setSelectedId(track.videoId);
    setTransport(autoplay);
    setPhase(autoplay ? "gap" : "idle");
    setPositionMs(0);
    flashedStopRef.current = false;
    void sendRef.current({ type: "stop" });
    flashedStopRef.current = true;
    const player = playerRef.current;
    if (!player) return;
    if (autoplay) player.load(track.videoId);
    else player.cue(track.videoId);
  }

  async function addLink(raw: string) {
    const videoId = parseYouTubeVideoId(raw);
    if (!videoId) {
      setError("YouTube linki değil.");
      return;
    }
    if (getPlaylistSnapshot().some((track) => track.videoId === videoId)) {
      setError("Bu parça zaten listede.");
      return;
    }
    setError("");
    setDraft("");
    const placeholder: Row = {
      videoId,
      title: "Ritim hazırlanıyor…",
      bpm: 0,
      durationMs: 0,
      cues: [],
      status: "analyzing",
    };
    commitPlaylist((list) =>
      list.some((track) => track.videoId === videoId) ? list : [...list, placeholder],
    );
    if (!selectedId) setSelectedId(videoId);
    try {
      const infoRes = await fetch(getShowHttpUrl("/youtube/info", { videoId }));
      const info = (await infoRes.json()) as { title?: string; error?: string };
      if (!infoRes.ok) throw new Error(info.error || "Video bulunamadı.");
      if (mountedRef.current) {
        commitPlaylist((list) =>
          list.map((track) =>
            track.videoId === videoId ? { ...track, title: info.title || videoId } : track,
          ),
        );
      }
      const audioRes = await fetch(getShowHttpUrl("/youtube/audio", { videoId }));
      if (!audioRes.ok) {
        const data = (await audioRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Ses indirilemedi.");
      }
      const contentType = audioRes.headers.get("content-type") ?? "";
      if (!contentType.startsWith("audio/")) throw new Error("Ses indirilemedi.");
      const buffer = await decodeAudio(await audioRes.arrayBuffer());
      const map = detectBeats(buffer);
      const cues = beatsToCues(map.beatsMs);
      if (cues.length < 8) throw new Error("Bu kayıtta yeterli beat bulunamadı.");
      if (!mountedRef.current) return;
      commitPlaylist((list) =>
        list.map((track) =>
          track.videoId === videoId
            ? {
                ...track,
                title: info.title || track.title,
                bpm: Math.round(map.bpm),
                durationMs: Math.round(map.durationMs),
                cues,
                status: "ready",
                error: undefined,
              }
            : track,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Şarkı hazırlanamadı.";
      if (!mountedRef.current) return;
      commitPlaylist((list) =>
        list.map((track) =>
          track.videoId === videoId ? { ...track, status: "error", error: message } : track,
        ),
      );
      setError(message);
    }
  }

  function play() {
    const track =
      (selected?.status === "ready" ? selected : null) ?? (!selectedId ? readyTracks[0] : null);
    if (!track) {
      setError("Önce ritmi hazır bir parça seç.");
      return;
    }
    if (!playerRef.current || !playerReady) {
      setError("YouTube oynatıcı hazır değil.");
      return;
    }
    setError("");
    const same = playerRef.current.videoId() === track.videoId;
    if (!same) {
      begin(track, true);
      return;
    }
    endedForRef.current = "";
    stallRef.current = 0;
    currentIdRef.current = track.videoId;
    setCurrentId(track.videoId);
    setTransport(true);
    setPhase("gap");
    playerRef.current.play();
  }

  function pause() {
    playerRef.current?.pause();
    setTransport(false);
    halt();
    setPhase("idle");
  }

  function step(direction: -1 | 1) {
    const list = getPlaylistSnapshot().filter((track) => track.status === "ready");
    if (list.length === 0) return;
    const index = list.findIndex((track) => track.videoId === (currentIdRef.current || selectedId));
    const next = list[index < 0 ? 0 : index + direction];
    if (!next) return;
    if (wantPlayRef.current) begin(next, true);
    else {
      setSelectedId(next.videoId);
      begin(next, false);
    }
  }

  function removeTrack(videoId: string) {
    commitPlaylist((list) => list.filter((track) => track.videoId !== videoId));
    if (selectedId === videoId) setSelectedId("");
    if (currentIdRef.current !== videoId) return;
    playerRef.current?.pause();
    setTransport(false);
    halt();
    setPhase("idle");
    currentIdRef.current = "";
    setCurrentId("");
  }

  function moveTrack(videoId: string, direction: -1 | 1) {
    commitPlaylist((list) => {
      const index = list.findIndex((track) => track.videoId === videoId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= list.length) return list;
      const copy = list.slice();
      const [item] = copy.splice(index, 1);
      if (!item) return list;
      copy.splice(next, 0, item);
      return copy;
    });
  }

  const screenUrl = `/screen?room=${encodeURIComponent(room)}&origin=${encodeURIComponent(origin)}`;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
            Operator
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Flaş</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <Pill ok={connected} label={connected ? "Console live" : "Offline"} />
          <Pill ok={audienceCount > 0} label={`${audienceCount} phones`} />
          <Pill
            ok={phase === "playing"}
            label={
              current?.status === "ready"
                ? `${formatClock(positionMs)} / ${formatClock(current.durationMs)}`
                : "Durdu"
            }
          />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Audience QR</h2>
          <p className="mt-1 text-sm text-foreground/70">
            QR şarkı değişince değişmez. Dev ekranda açık kalsın.
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
              Telefona localhost yazma. Kutuyu http://192.168.1.70:3200 olarak bırak, sonra QR’ı oku.
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
          <a
            href={screenUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white"
          >
            Dev ekranda aç
          </a>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Playlist</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Link ekle, ritim hazır olunca başlat. Flaş, ses gerçekten çalınca başlar.
          </p>
          <p className="mt-2 text-sm font-medium">{statusLabel(phase, wantPlay, playerReady)}</p>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addLink(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="YouTube linki"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Ekle
            </button>
          </form>

          {playlist.length === 0 ? (
            <p className="mt-4 text-sm text-foreground/60">Liste boş.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {playlist.map((track, index) => (
                <li
                  key={track.videoId}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                    track.videoId === selectedId ? "border-accent bg-accent/10" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(track.videoId)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-semibold">{track.title}</span>
                    <span className="block text-xs text-foreground/60">
                      {track.status === "analyzing"
                        ? "Ritim hazırlanıyor…"
                        : track.status === "error"
                          ? track.error
                          : `${formatClock(track.durationMs)}${
                              track.videoId === currentId && wantPlay ? " · çalıyor" : ""
                            }`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTrack(track.videoId, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Yukarı
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTrack(track.videoId, 1)}
                    disabled={index === playlist.length - 1}
                    className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Aşağı
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTrack(track.videoId)}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={orderIndex <= 0}
              className="rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={() => {
                if (wantPlay) pause();
                else play();
              }}
              disabled={!playerReady || readyTracks.length === 0}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {wantPlay ? "Duraklat" : "Çal"}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={orderIndex < 0 || orderIndex >= readyTracks.length - 1}
              className="rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Sonraki
            </button>
          </div>

          <div className="mt-5 min-h-[180px] overflow-hidden rounded-xl bg-black">
            <div id="booth-player" />
          </div>
          <p className="mt-2 text-xs text-foreground/60">Kabin sesi bu oynatıcıdan çıkar.</p>
          {selected?.status === "analyzing" ? (
            <p className="mt-3 text-sm text-foreground/70">Ritim hazırlanıyor…</p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        </article>
      </section>
    </main>
  );
}

function statusLabel(phase: Phase, wantPlay: boolean, playerReady: boolean) {
  if (!playerReady) return "Oynatıcı hazırlanıyor";
  if (phase === "playing") return "Çalıyor";
  if (wantPlay) return "Ara — ses başlayınca flaş başlar";
  return "Durdu";
}

async function decodeAudio(bytes: ArrayBuffer) {
  const ctx = new AudioContext();
  try {
    await ctx.resume();
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error("Bu parçanın sesi okunamadı.");
  } finally {
    await ctx.close();
  }
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
