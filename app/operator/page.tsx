import { OperatorClient } from "@/components/show/operator-client";
import { sanitizeRoomId } from "@/lib/show/protocol";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Light show operator",
  description: "Control the synced phone light show and display the join QR.",
};

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const params = await searchParams;
  return <OperatorClient roomId={sanitizeRoomId(params.room)} />;
}
