"use client";

import { IconPhone, IconQr, IconSpark } from "@/components/brand/icons";
import { TeamHeader } from "@/components/brand/team-header";
import { QR_COLORS, TEAM } from "@/lib/brand/team";
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
  }, [joinUrl]);

  return (
    <main className="flex min-h-dvh flex-col bg-team-white">
      <section className="panel-head px-6 py-8 text-center text-white">
        <TeamHeader
          align="center"
          tone="light"
          subtitle="Tribün ışık gösterisi"
          logoSize={80}
        />
        <div className="mt-6 flex items-center justify-center gap-3">
          <IconSpark className="h-6 w-6 text-team-cyan" />
          <p className="font-display text-4xl font-bold uppercase tracking-[0.1em] sm:text-5xl">
            Telefonunla katıl
          </p>
          <IconSpark className="h-6 w-6 text-team-cyan" />
        </div>
        <p className="mt-3 text-sm font-medium text-white/80">{TEAM.tagline}</p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <div className="card-premium rounded-3xl p-6 sm:p-8">
          <div className="mb-4 flex items-center justify-center gap-2 text-team-red">
            <IconQr className="h-5 w-5" />
            <span className="font-display text-sm font-bold uppercase tracking-[0.2em]">
              QR Tara
            </span>
          </div>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="Katılım QR kodu"
              className="mx-auto h-[min(52vh,560px)] w-[min(52vh,560px)]"
            />
          ) : (
            <p className="py-20 text-lg text-team-ink">
              {joinUrl ? "QR hazırlanıyor…" : "Adres yok"}
            </p>
          )}
        </div>
        {joinUrl ? (
          <p className="mt-6 inline-flex max-w-3xl items-center gap-2 break-all text-sm text-team-muted">
            <IconPhone className="h-4 w-4 shrink-0 text-team-cyan" />
            {joinUrl}
          </p>
        ) : null}
      </section>
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
