/** Prevents open redirects: only same-origin relative paths allowed. */
export function safeRelativePath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  if (t.includes("\\") || t.includes("@")) return "/";
  return t;
}
