import { cookies } from "next/headers";

function apiOrigin(): string {
  return (process.env.API_URL ?? "http://localhost:3201").replace(/\/$/, "");
}

/** Server-side fetch to flask-web-api with session cookies forwarded. */
export async function fetchApiJson<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  try {
    const res = await fetch(`${apiOrigin()}${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
