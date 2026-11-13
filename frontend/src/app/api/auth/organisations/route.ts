import { NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/server-auth";

export async function GET() {
  const backendRes = await proxyToBackend("/api/auth/organisations", "GET");

  if (!backendRes) {
    return NextResponse.json({ success: false, message: "Backend authentication service unavailable" }, { status: 503 });
  }

  const data = await backendRes.json();
  return NextResponse.json(data, { status: backendRes.status });
}

