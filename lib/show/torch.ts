type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export type TorchReason = "insecure" | "no-api" | "denied" | "timeout" | "no-torch";

export type TorchControl = {
  supported: boolean;
  reason?: TorchReason;
  /** Estimated ms to fire LED after applyConstraints (for sync lead). */
  torchLeadMs: number;
  setTorch: (on: boolean) => Promise<void>;
  attach: (video: HTMLVideoElement | null) => void;
  stop: () => void;
};

function empty(reason?: TorchReason): TorchControl {
  return {
    supported: false,
    reason,
    torchLeadMs: 0,
    setTorch: async () => undefined,
    attach: () => undefined,
    stop: () => undefined,
  };
}

async function requestCamera() {
  const attempts = [
    { video: { facingMode: { exact: "environment" as const } } },
    { video: { facingMode: { ideal: "environment" as const } } },
    { video: true },
  ];
  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function probeTorch(track: MediaStreamTrack) {
  const caps = (track.getCapabilities?.() ?? {}) as TorchCapabilities;
  if (caps.torch) return true;
  return typeof track.applyConstraints === "function";
}

export async function acquireTorch(video?: HTMLVideoElement | null): Promise<TorchControl> {
  if (!window.isSecureContext) return empty("insecure");
  if (!navigator.mediaDevices?.getUserMedia) return empty("no-api");

  let stream: MediaStream;
  try {
    stream = await Promise.race([
      requestCamera(),
      new Promise<MediaStream>((_, reject) => {
        window.setTimeout(() => reject(new Error("timeout")), 8000);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return empty(message === "timeout" ? "timeout" : "denied");
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    return empty("no-torch");
  }

  if (video) {
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute("playsinline", "true");
    await video.play().catch(() => undefined);
  }

  const supported = await probeTorch(track);
  if (!supported) {
    stream.getTracks().forEach((item) => item.stop());
    return empty("no-torch");
  }

  const torchLeadMs = 0;

  let desired = false;
  let inflight = false;
  let onAppliedAt = 0;
  const latchMs = 110;

  async function writeTorch(on: boolean) {
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
    } catch {
      await track.applyConstraints({ torch: on } as MediaTrackConstraintSet);
    }
  }

  async function apply(on: boolean) {
    desired = on;
    if (inflight) return;
    inflight = true;
    try {
      while (true) {
        const target = desired;
        if (!target && onAppliedAt > 0) {
          const wait = latchMs - (performance.now() - onAppliedAt);
          if (wait > 0) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, wait);
            });
            if (desired) continue;
          }
        }
        await writeTorch(target);
        if (target) onAppliedAt = performance.now();
        if (desired === target) break;
      }
    } catch {
      // Safari can reject mid-show; screen channel still runs.
    } finally {
      inflight = false;
    }
  }

  return {
    supported: true,
    torchLeadMs,
    setTorch: apply,
    attach(nextVideo) {
      if (!nextVideo) return;
      nextVideo.srcObject = stream;
      void nextVideo.play().catch(() => undefined);
    },
    stop() {
      void apply(false);
      stream.getTracks().forEach((item) => item.stop());
    },
  };
}

export function torchMessage(reason?: TorchReason) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (reason === "insecure") {
    return `Telefonun flaşı uygun. Safari LED’i yalnız HTTPS’te açar. QR ${origin || "bu sitenin https adresini"} olmalı; kırmızı uyarıda İlerle / Visit demelisin.`;
  }
  if (reason === "denied") {
    return "Kamera izni verilmedi. Ayarlar > Safari > Kamera’dan bu siteye izin ver.";
  }
  if (reason === "timeout") {
    return "Kamera izni zaman aşımına uğradı. Tekrar dene ve İzin Ver’e bas.";
  }
  if (reason === "no-api") {
    return "Bu tarayıcı kamera API’sini vermiyor. Safari’den aç.";
  }
  return "LED açılamadı. Ekran yine de yanacak.";
}
