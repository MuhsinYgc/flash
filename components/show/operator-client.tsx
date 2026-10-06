"use client";

import {
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconCopy,
  IconFlash,
  IconLink,
  IconMonitor,
  IconMusic,
  IconPause,
  IconPhone,
  IconPlay,
  IconPlus,
  IconQr,
  IconSettings,
  IconSpark,
  IconSun,
  IconSkipBack,
  IconSkipForward,
  IconTrash,
  IconUsers,
  IconWifi,
} from "@/components/brand/icons";
import { StatusPill } from "@/components/brand/status-pill";
import { TeamButton } from "@/components/brand/team-button";
import { TeamHeader } from "@/components/brand/team-header";
import { OperatorLogin } from "@/components/show/operator-login";
import { QR_COLORS, TEAM } from "@/lib/brand/team";
import { beatsToCues, detectBeats } from "@/lib/show/beat-detect";
import { connectShow } from "@/lib/show/connect";
import { detectJoinOrigin, normalizeJoinOrigin } from "@/lib/show/join-origin";
import {
  clearOperatorToken,
  getOperatorToken,
  loadTrackLeadMs,
  saveTrackLeadMs,
  subscribeOperatorToken,
} from "@/lib/show/operator-session";
import {
  TRACK_FLASH_LEAD_MAX_MS,
  TRACK_FLASH_LEAD_MIN_MS,
  TRACK_FLASH_LEAD_MS,
  getShowHttpUrl,
  sanitizeRoomId,
  type ClientMessage,
} from "@/lib/show/protocol";
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

const SEEK_MS = 400;
const LOOP_MS = 500;
const CUE_ON_MS = 120;
const REANCHOR_MIN_MS = 80;
const REANCHOR_COOLDOWN_MS = 2000;

export function OperatorClient({ roomId }: { roomId: string }) {
  const token = useSyncExternalStore(subscribeOperatorToken, getOperatorToken, () => "");

  if (!token) {
    return <OperatorLogin onAuthed={() => undefined} />;
  }

  return (
    <OperatorBooth
      key={token}
      roomId={roomId}
      token={token}
      onLogout={() => {
        clearOperatorToken();
      }}
    />
  );
}

function OperatorBooth({
  roomId,
  token,
  onLogout,
}: {
  roomId: string;
  token: string;
  onLogout: () => void;
}) {
  const [room, setRoom] = useState(roomId);
  const [publicOrigin, setPublicOrigin] = useState("");
  const [originReady, setOriginReady] = useState(false);
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [flashLeadMs, setFlashLeadMs] = useState(() => loadTrackLeadMs(TRACK_FLASH_LEAD_MS));

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
  const flashLeadRef = useRef(flashLeadMs);
  const lastReanchorRef = useRef(0);

  useEffect(() => {
    flashLeadRef.current = flashLeadMs;
  }, [flashLeadMs]);

  const origin = normalizeJoinOrigin(publicOrigin);
  const joinUrl = useMemo(
    () => `${origin}/join?room=${encodeURIComponent(room)}`,
    [origin, room],
  );
  const wrongPort = /:32000\b/.test(publicOrigin);
  const phoneUnreachable =
    !origin || origin.includes("localhost") || origin.includes("127.0.0.1");

  async function redetectOrigin() {
    const detected = await detectJoinOrigin();
    if (detected) {
      setPublicOrigin(detected);
      setOriginReady(true);
    }
  }

  async function copyJoinLink() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Link kopyalanamadı.");
    }
  }
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
    void detectJoinOrigin().then((detected) => {
      if (cancelled || !detected) return;
      setPublicOrigin(detected);
      setOriginReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 1,
      color: { dark: QR_COLORS.dark, light: QR_COLORS.light },
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
  }, [joinUrl, origin]);

  useEffect(() => {
    let cancelled = false;
    anchoredRef.current = false;
    anchorAtRef.current = null;
    flashedStopRef.current = false;
    clockReadyRef.current = false;
    const session = connectShow(
      "operator",
      room,
      {
        onConnected: (ok) => setConnected(ok),
        onState: (_next, count) => setAudienceCount(count),
        onFlash: () => undefined,
        onError: (message) => setError(message),
      },
      { token },
    );
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
  }, [room, token]);

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

      const lead = flashLeadRef.current;
      const serverNow = session.clock.serverNow();
      if (!anchoredRef.current || anchorAtRef.current == null) {
        if (!clockReadyRef.current) return;
        const startedAtServerMs = Math.round(serverNow - timeMs - lead);
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

      const errorMs = timeMs - (serverNow - anchorAtRef.current - lead);
      if (Math.abs(errorMs) > SEEK_MS) {
        halt();
        setPhase("gap");
        return;
      }
      if (Math.abs(errorMs) >= REANCHOR_MIN_MS && Date.now() - lastReanchorRef.current > REANCHOR_COOLDOWN_MS) {
        const startedAtServerMs = Math.round(serverNow - timeMs - lead);
        anchorAtRef.current = startedAtServerMs;
        lastReanchorRef.current = Date.now();
        void sendRef.current({ type: "reanchor", startedAtServerMs });
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
  const transportDisabled = !playerReady || readyTracks.length === 0;

  function renderTransport(compact: boolean) {
    return (
      <div className={`flex items-center justify-center gap-2 ${compact ? "sm:gap-3" : "sm:gap-4"}`}>
        <button
          type="button"
          className={`booth-transport-btn ${compact ? "min-w-[4.5rem] px-3" : "min-w-[5.5rem] sm:min-w-[6.5rem]"}`}
          onClick={() => step(-1)}
          disabled={orderIndex <= 0}
        >
          <IconSkipBack className="h-4 w-4" />
          <span>Önceki</span>
        </button>
        <button
          type="button"
          className={`booth-play-btn shrink-0 ${compact ? "h-14 w-14" : ""}`}
          aria-label={wantPlay ? "Duraklat" : "Çal"}
          onClick={() => {
            if (wantPlay) pause();
            else play();
          }}
          disabled={transportDisabled}
        >
          {wantPlay ? (
            <IconPause className={compact ? "h-6 w-6" : "h-7 w-7"} />
          ) : (
            <IconPlay className={`ml-0.5 ${compact ? "h-6 w-6" : "h-7 w-7"}`} />
          )}
        </button>
        <button
          type="button"
          className={`booth-transport-btn ${compact ? "min-w-[4.5rem] px-3" : "min-w-[5.5rem] sm:min-w-[6.5rem]"}`}
          onClick={() => step(1)}
          disabled={orderIndex < 0 || orderIndex >= readyTracks.length - 1}
        >
          <span>Sonraki</span>
          <IconSkipForward className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col gap-4 px-3 py-4 pb-24 sm:px-6 sm:py-8 lg:gap-6 lg:pb-8">
      <header className="card-premium rounded-2xl p-3 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TeamHeader subtitle="Işık gösterisi kontrol" logoSize={44} />
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <StatusPill
              active={connected}
              icon={<IconWifi className="h-3.5 w-3.5" />}
              label={connected ? "Canlı" : "Bağlantı yok"}
            />
            <StatusPill
              active={audienceCount > 0}
              icon={<IconUsers className="h-3.5 w-3.5" />}
              label={`${audienceCount} telefon`}
            />
            <StatusPill
              active={phase === "playing"}
              icon={<IconClock className="h-3.5 w-3.5" />}
              label={
                current?.status === "ready"
                  ? `${formatClock(positionMs)} / ${formatClock(current.durationMs)}`
                  : "Durdu"
              }
            />
            <TeamButton variant="secondary" className="min-h-9 px-3 text-xs" onClick={onLogout}>
              Çıkış
            </TeamButton>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_1fr] lg:gap-6">
        <article className="card-premium order-2 overflow-hidden rounded-2xl lg:order-1">
          <div className="panel-head px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white">
                <IconQr className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white">
                  Taraftar QR
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/85">
                  Şarkı değişince QR değişmez. Dev ekranda açık kalsın.
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mx-auto flex max-w-[13rem] justify-center rounded-2xl bg-team-surface p-4 ring-1 ring-team-border">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Katılım QR kodu" className="aspect-square w-full" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-center text-xs text-team-muted">
                  {originReady ? "QR hazırlanıyor…" : "Site adresi algılanıyor…"}
                </div>
              )}
            </div>
            <p className="mt-4 break-all text-center text-xs text-team-muted">{joinUrl}</p>
            <a href={screenUrl} target="_blank" rel="noreferrer" className="mt-4 block">
              <TeamButton icon={<IconMonitor className="h-4 w-4" />} className="w-full">
                Dev ekranda aç
              </TeamButton>
            </a>
            <TeamButton
              type="button"
              variant="secondary"
              icon={<IconCopy className="h-4 w-4" />}
              onClick={() => void copyJoinLink()}
              disabled={!joinUrl}
              className="mt-2 w-full"
            >
              {linkCopied ? "Kopyalandı!" : "Katılım linkini kopyala"}
            </TeamButton>

            <details className="mt-5 rounded-xl border border-team-border bg-gradient-to-br from-team-red/6 via-team-white to-team-cyan/8 p-4 lg:open">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-team-red [&::-webkit-details-marker]:hidden lg:pointer-events-none">
                Tribün durumu
                <span className="font-display text-2xl font-bold text-team-ink lg:hidden">
                  {audienceCount}
                </span>
              </summary>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-4xl font-bold leading-none text-team-ink">
                    {audienceCount}
                  </p>
                  <p className="mt-1 text-xs text-team-muted">bağlı telefon</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusPill
                    active={connected}
                    icon={<IconWifi className="h-3.5 w-3.5" />}
                    label={connected ? "Sunucu canlı" : "Bağlantı yok"}
                  />
                  <span className="rounded-full bg-team-white px-2.5 py-1 text-xs font-medium text-team-muted ring-1 ring-team-border">
                    Oda: {room}
                  </span>
                </div>
              </div>
            </details>

            <details className="mt-4 rounded-xl border border-team-border bg-team-surface/80 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-team-ink [&::-webkit-details-marker]:hidden">
                <IconSpark className="h-3.5 w-3.5 text-team-cyan" />
                Taraftar nasıl katılır?
              </summary>
              <ol className="mt-3 space-y-2.5 text-xs leading-5 text-team-muted">
                <li className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-team-red text-[10px] font-bold text-white">
                    1
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconQr className="h-3.5 w-3.5 shrink-0 text-team-red" />
                    QR kodu tara veya katılım linkini aç
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-team-red text-[10px] font-bold text-white">
                    2
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconPhone className="h-3.5 w-3.5 shrink-0 text-team-cyan" />
                    Kamera ve flaş iznini ver
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-team-red text-[10px] font-bold text-white">
                    3
                  </span>
                  <span className="flex items-center gap-1.5">
                    <IconFlash className="h-3.5 w-3.5 shrink-0 text-team-red" />
                    Müzik başladığında flaş otomatik senkron olur
                  </span>
                </li>
              </ol>
            </details>

            <p className="mt-4 hidden text-center font-display text-sm font-semibold uppercase tracking-wide text-team-red lg:block">
              {TEAM.tagline}
            </p>
            <p className="mt-1 hidden text-center text-xs text-team-muted lg:block">{TEAM.instagram}</p>

            <details className="mt-5 rounded-xl border border-team-border bg-team-surface/80 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-team-muted [&::-webkit-details-marker]:hidden">
                <IconSettings className="h-4 w-4 shrink-0 text-team-ink" />
                Teknik ayarlar
              </summary>
              <label className="mt-4 block">
                <span className="flex items-center gap-2 text-xs font-semibold text-team-ink">
                  <IconSun className="h-4 w-4 shrink-0 text-team-cyan" />
                  Site adresi
                </span>
                <p className="mt-1 text-xs leading-5 text-team-muted">
                  Taraftarların telefonla bağlanacağı adres. Yerelde Wi-Fi IP otomatik algılanır;
                  canlıda alan adınız kullanılır.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={origin}
                    onChange={(event) => {
                      setOriginReady(true);
                      setPublicOrigin(normalizeJoinOrigin(event.target.value));
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-team-border bg-team-white px-3 py-2 text-sm"
                  />
                  <TeamButton
                    type="button"
                    variant="secondary"
                    icon={<IconSun className="h-4 w-4" />}
                    onClick={() => void redetectOrigin()}
                    className="shrink-0 px-3"
                  >
                    Algıla
                  </TeamButton>
                </div>
              </label>
              <label className="mt-4 block">
                <span className="flex items-center gap-2 text-xs font-semibold text-team-ink">
                  <IconSettings className="h-4 w-4 shrink-0 text-team-muted" />
                  Oda
                </span>
                <input
                  value={room}
                  onChange={(event) => setRoom(sanitizeRoomId(event.target.value))}
                  className="mt-2 w-full rounded-lg border border-team-border bg-team-white px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-4 block">
                <span className="flex items-center gap-2 text-xs font-semibold text-team-ink">
                  <IconFlash className="h-4 w-4 shrink-0 text-team-red" />
                  Flaş ofseti ({flashLeadMs} ms)
                </span>
                <p className="mt-1 text-xs leading-5 text-team-muted">
                  Varsayılan 170 ms. Değiştirmeden mevcut senkron aynı kalır.
                </p>
                <input
                  type="range"
                  min={TRACK_FLASH_LEAD_MIN_MS}
                  max={TRACK_FLASH_LEAD_MAX_MS}
                  value={flashLeadMs}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setFlashLeadMs(next);
                    saveTrackLeadMs(next);
                  }}
                  className="mt-2 w-full"
                />
              </label>
              {wrongPort ? (
                <p className="mt-3 text-xs leading-5 text-team-red">
                  Port 32000 yanlış. 3200 olmalı.
                </p>
              ) : null}
              {phoneUnreachable ? (
                <p className="mt-3 text-xs leading-5 text-team-red">
                  Telefon localhost ile bağlanamaz. Algıla ile Wi-Fi adresini al veya elle yaz.
                </p>
              ) : null}
            </details>
          </div>
        </article>

        <article className="card-premium order-1 flex flex-col rounded-2xl p-4 sm:p-6 lg:order-2">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-team-red/10 text-team-red">
              <IconMusic className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-team-ink">
                Müzik listesi
              </h2>
              <p className="mt-1 text-sm text-team-muted">
                Link ekle, ritim hazır olunca başlat. Flaş ses gerçekten çalınca başlar.
              </p>
            </div>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-team-red/8 px-3 py-1.5 text-sm font-semibold text-team-red">
            {wantPlay && phase === "playing" ? (
              <IconPlay className="h-3.5 w-3.5" />
            ) : (
              <IconClock className="h-3.5 w-3.5" />
            )}
            {statusLabel(phase, wantPlay, playerReady)}
          </p>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void addLink(draft);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <IconLink className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-team-muted" />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="YouTube linki"
                className="w-full rounded-xl border border-team-border bg-team-surface py-2.5 pr-3 pl-10 text-sm outline-none ring-team-cyan/40 focus:border-team-cyan focus:ring-2"
              />
            </div>
            <TeamButton type="submit" icon={<IconPlus className="h-4 w-4" />} className="sm:min-w-[7rem]">
              Ekle
            </TeamButton>
          </form>

          <div className="booth-deck order-2 mt-5 overflow-hidden rounded-2xl lg:order-3">
            <div className="panel-head flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <IconMusic className="h-4 w-4 shrink-0 text-white/90" />
                <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-white">
                  Kabin oynatıcı
                </span>
              </div>
              <span className="truncate text-right text-xs font-medium text-white/85">
                {current?.title ?? selected?.title ?? "Parça seç"}
              </span>
            </div>

            <div className="booth-deck-body px-3 py-4 sm:px-6 sm:py-6">
              <div className="mx-auto max-w-xl">
                <div className="booth-player-frame mx-auto aspect-video w-full max-w-[32rem] bg-black">
                  <div id="booth-player" className="h-full w-full" />
                </div>

                {current?.status === "ready" && wantPlay ? (
                  <p className="mt-3 text-center font-mono text-xs tracking-wide text-team-muted">
                    {formatClock(positionMs)} / {formatClock(current.durationMs)}
                  </p>
                ) : null}

                <div className="mt-4 hidden lg:block">{renderTransport(false)}</div>
              </div>
            </div>

            <p className="hidden border-t border-team-border px-4 py-3 text-center text-xs text-team-muted lg:block">
              Kabin sesi bu oynatıcıdan çıkar — tribün flaşı müzikle senkron başlar
            </p>
          </div>

          {playlist.length === 0 ? (
            <p className="order-3 mt-4 text-sm text-team-muted lg:order-2">Liste boş.</p>
          ) : (
            <div className="playlist-scroll order-3 mt-4 lg:order-2">
              <ul className="flex flex-col gap-2">
                {playlist.map((track, index) => (
                  <li
                    key={track.videoId}
                    className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-3 sm:gap-3 ${
                      track.videoId === selectedId
                        ? "border-team-red bg-team-red/8 shadow-sm shadow-team-red/10"
                        : "border-team-border bg-team-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(track.videoId)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-team-ink">
                        {track.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-team-muted">
                        {track.status === "analyzing"
                          ? "Ritim hazırlanıyor…"
                          : track.status === "error"
                            ? track.error
                            : `${formatClock(track.durationMs)}${
                                track.videoId === currentId && wantPlay ? " · çalıyor" : ""
                              }`}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <TeamButton
                        variant="icon"
                        aria-label="Yukarı taşı"
                        onClick={() => moveTrack(track.videoId, -1)}
                        disabled={index === 0}
                      >
                        <IconChevronUp className="h-4 w-4" />
                      </TeamButton>
                      <TeamButton
                        variant="icon"
                        aria-label="Aşağı taşı"
                        onClick={() => moveTrack(track.videoId, 1)}
                        disabled={index === playlist.length - 1}
                      >
                        <IconChevronDown className="h-4 w-4" />
                      </TeamButton>
                      <TeamButton
                        variant="icon"
                        aria-label="Sil"
                        onClick={() => removeTrack(track.videoId)}
                        className="text-team-red hover:border-team-red/40 hover:bg-team-red/10"
                      >
                        <IconTrash className="h-4 w-4" />
                      </TeamButton>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected?.status === "analyzing" ? (
            <p className="mt-3 text-sm text-team-muted">Ritim hazırlanıyor…</p>
          ) : null}
          {error ? <p className="mt-4 text-sm text-team-red">{error}</p> : null}
        </article>
      </section>

      <div className="operator-sticky-bar lg:hidden">
        {renderTransport(true)}
      </div>
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

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
