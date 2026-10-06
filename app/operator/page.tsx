import { OperatorClient } from "@/components/show/operator-client";
import { sanitizeRoomId } from "@/lib/show/protocol";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kipaş İstiklal — Kontrol",
  description: "Kipaş İstiklal Basket ışık gösterisi DJ kontrol paneli.",
};

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const params = await searchParams;
  return <OperatorClient roomId={sanitizeRoomId(params.room)} />;
}
