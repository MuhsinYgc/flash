type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchSettings = MediaTrackSettings & { torch?: boolean };

export type TorchReason = "insecure" | "no-api" | "denied" | "timeout" | "no-torch";

export type TorchControl = {
  supported: boolean;
  reason?: TorchReason;
  setTorch: (on: boolean) => Promise<void>;
  attach: (video: HTMLVideoElement | null) => void;
  stop: () => void;
};

function empty(reason?: TorchReason): TorchControl {
  return {
    supported: false,
    reason,
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
  try {
    await track.applyConstraints({
      advanced: [{ torch: true } as MediaTrackConstraintSet],
    });
    const on = ((track.getSettings?.() ?? {}) as TorchSettings).torch;
    await track.applyConstraints({
      advanced: [{ torch: false } as MediaTrackConstraintSet],
    });
    return on !== false;
  } catch {
    try {
      await track.applyConstraints({ torch: true } as MediaTrackConstraintSet);
      await track.applyConstraints({ torch: false } as MediaTrackConstraintSet);
      return true;
    } catch {
      return false;
    }
  }
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

  let desired = false;
  let inflight = false;

  async function apply(on: boolean) {
    desired = on;
    if (inflight) return;
    inflight = true;
    try {
      while (true) {
        const target = desired;
        try {
          await track.applyConstraints({
            advanced: [{ torch: target } as MediaTrackConstraintSet],
          });
        } catch {
          await track.applyConstraints({ torch: target } as MediaTrackConstraintSet);
        }
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
  if (reason === "insecure") {
    return "Telefonun flaşı uygun. Safari LED’i yalnız HTTPS’te açar. QR https://192.168.1.70:3200 olmalı; kırmızı uyarıda İlerle / Visit demelisin.";
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
