"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function ScreenClient({ roomId, origin }: { roomId: string; origin: string }) {
  const safeOrigin = sanitizeOrigin(origin);
  const joinUrl = safeOrigin ? `${safeOrigin}/join?room=${encodeURIComponent(roomId)}` : "";
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(joinUrl, {
      width: 900,
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-10 text-center">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Flaşa katıl" className="h-[min(72vh,720px)] w-[min(72vh,720px)]" />
      ) : (
        <p className="text-lg text-[#152028]">{joinUrl ? "QR hazırlanıyor…" : "Adres yok"}</p>
      )}
      <p className="mt-6 text-3xl font-semibold text-[#152028]">Flaşa katıl</p>
      {joinUrl ? <p className="mt-2 break-all text-sm text-[#152028]/70">{joinUrl}</p> : null}
    </main>
  );
}

function sanitizeOrigin(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}
