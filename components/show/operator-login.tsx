"use client";

import { IconSettings } from "@/components/brand/icons";
import { TeamButton } from "@/components/brand/team-button";
import { TeamHeader } from "@/components/brand/team-header";
import { getShowHttpUrl } from "@/lib/show/protocol";
import { setOperatorToken } from "@/lib/show/operator-session";
import type { FormEvent } from "react";
import { useState } from "react";

export function OperatorLogin({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(getShowHttpUrl("/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error || "Giriş başarısız.");
        return;
      }
      setOperatorToken(data.token);
      onAuthed(data.token);
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <TeamHeader align="center" subtitle="DJ kontrol girişi" logoSize={64} />
      <form
        onSubmit={(event) => void submit(event)}
        className="card-premium mt-8 overflow-hidden rounded-2xl"
      >
        <div className="panel-head px-5 py-3">
          <p className="flex items-center justify-center gap-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-white">
            <IconSettings className="h-4 w-4" />
            Operator
          </p>
        </div>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-medium text-team-ink">
            Kullanıcı adı
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-xl border border-team-border bg-team-surface px-3 py-2.5 text-sm outline-none focus:border-team-cyan focus:ring-2 focus:ring-team-cyan/40"
            />
          </label>
          <label className="block text-sm font-medium text-team-ink">
            Şifre
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-team-border bg-team-surface px-3 py-2.5 text-sm outline-none focus:border-team-cyan focus:ring-2 focus:ring-team-cyan/40"
            />
          </label>
          {error ? <p className="text-sm text-team-red">{error}</p> : null}
          <TeamButton type="submit" className="w-full" disabled={busy}>
            {busy ? "Giriş yapılıyor…" : "Giriş yap"}
          </TeamButton>
        </div>
      </form>
    </main>
  );
}
