import { ScreenClient } from "@/components/show/screen-client";
import { sanitizeRoomId } from "@/lib/show/protocol";
import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Flaş ekranı",
  description: "Dev ekranda gösterilecek katılım QR’ı.",
};

function sanitizeOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export default async function ScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; origin?: string }>;
}) {
  const params = await searchParams;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const forwarded = headerStore.get("x-forwarded-proto");
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : "https";
  const origin = sanitizeOrigin(params.origin) || (host ? `${proto}://${host}` : "");
  return <ScreenClient roomId={sanitizeRoomId(params.room)} origin={origin} />;
}
