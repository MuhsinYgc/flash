import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const apiUrl = (process.env.API_URL ?? "http://localhost:3201").replace(/\/$/, "");

function redirectToSignIn(request: NextRequest) {
  const url = new URL("/signin", request.url);
  const path = request.nextUrl.pathname;
  if (path && path !== "/signin") {
    url.searchParams.set("from", path);
  }
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return redirectToSignIn(request);
  }

  try {
    const response = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await response.json().catch(() => null)) as { user?: unknown } | null;
    if (!response.ok || !body?.user) return redirectToSignIn(request);
  } catch {
    return redirectToSignIn(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*"],
};
