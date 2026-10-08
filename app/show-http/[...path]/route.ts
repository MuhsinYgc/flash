const showOrigin = (process.env.SHOW_SERVER_ORIGIN ?? `http://127.0.0.1:${process.env.SHOW_WS_PORT ?? "3202"}`).replace(/\/$/, "");

export const dynamic = "force-dynamic";

/** Fallback when next.config rewrites do not apply. Keep snapshot/command behavior identical. */

async function proxy(request: Request, path: string[]) {
  const incoming = new URL(request.url);
  const target = `${showOrigin}/${path.join("/")}${incoming.search}`;
  try {
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const upstream = await fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ ok: false, error: "Show server unreachable" }, { status: 502 });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}
