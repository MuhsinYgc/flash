import { AppHeader } from "@/components/app-header";
import type { AuthUser } from "@/lib/api";
import { fetchApiJson } from "@/lib/server/fetch-api";

export default async function HomePage() {
  const [me, health, hello] = await Promise.all([
    fetchApiJson<{ user: AuthUser | null }>("/api/auth/me"),
    fetchApiJson<{ ok: boolean; service?: string; time?: string }>("/api/health"),
    fetchApiJson<{ message: string; email: string | null }>("/api/hello"),
  ]);

  const user = me?.user;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader email={user?.email ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {user?.name ? `Hello, ${user.name}` : "Workspace"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-foreground/70">
          Base app is running. The web UI talks to flask-web-api through{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 text-xs">/api/*</code>.
          Run a synced phone light show from{" "}
          <a href="/operator" className="font-medium text-accent underline-offset-2 hover:underline">
            /operator
          </a>
          . Audience joins at{" "}
          <a href="/join" className="font-medium text-accent underline-offset-2 hover:underline">
            /join
          </a>
          .
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">API health</h2>
            <p className="mt-2 text-sm text-foreground/80">
              {health?.ok
                ? `${health.service ?? "api"} · ${health.time ?? "ok"}`
                : "Unreachable"}
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Protected hello</h2>
            <p className="mt-2 text-sm text-foreground/80">
              {hello?.message ?? "Failed"}
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
