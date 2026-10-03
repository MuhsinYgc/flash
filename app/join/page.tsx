import { JoinClient } from "@/components/show/join-client";
import { sanitizeRoomId } from "@/lib/show/protocol";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the light show",
  description: "Scan in and keep this tab open. Your screen and flashlight follow the show.",
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
