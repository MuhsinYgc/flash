"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/signin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <p className="text-sm font-semibold tracking-tight">Flah</p>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-foreground/70 sm:inline">{email}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
