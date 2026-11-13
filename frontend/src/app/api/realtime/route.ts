import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const upstream = await fetch(`${process.env.BACKEND_URL || "http://localhost:4000"}/api/realtime`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("Realtime service unavailable", { status: 503 });
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
