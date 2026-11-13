import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: RouteContext, method: "GET" | "POST" | "PATCH") {
  const { path } = await context.params;
  const pathname = `/api/admin/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const body = method === "GET" ? undefined : await request.text();
  const backendRes = await proxyToBackend(pathname, method, body ? JSON.parse(body) : undefined, request.headers.get("cookie") || undefined);
  if (!backendRes) return NextResponse.json({ success: false, message: "Backend service unavailable" }, { status: 503 });
  return new NextResponse(backendRes.body, { status: backendRes.status, headers: { "content-type": backendRes.headers.get("content-type") || "application/json", ...(backendRes.headers.get("content-disposition") ? { "content-disposition": backendRes.headers.get("content-disposition")! } : {}) } });
}

export const GET = (request: NextRequest, context: RouteContext) => forward(request, context, "GET");
export const POST = (request: NextRequest, context: RouteContext) => forward(request, context, "POST");
export const PATCH = (request: NextRequest, context: RouteContext) => forward(request, context, "PATCH");
