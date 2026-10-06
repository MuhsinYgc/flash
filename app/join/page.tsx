import { JoinClient } from "@/components/show/join-client";
import { sanitizeRoomId } from "@/lib/show/protocol";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kipaş İstiklal — Katıl",
  description: "Kipaş İstiklal Basket tribün ışık gösterisine katıl.",
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; go?: string }>;
}) {
  const params = await searchParams;
  return (
    <JoinClient
      roomId={sanitizeRoomId(params.room)}
      start={params.go === "1"}
    />
  );
}
