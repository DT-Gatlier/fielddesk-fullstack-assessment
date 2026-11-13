import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cookieHeader = request.headers.get("cookie") || undefined;

    const backendRes = await proxyToBackend(
      "/api/auth/login",
      "POST",
      body,
      cookieHeader
    );

    if (!backendRes) {
      return NextResponse.json(
        {
          success: false,
          message: "Backend authentication service unavailable",
        },
        { status: 503 }
      );
    }

    const data = await backendRes.json();
    const response = NextResponse.json(data, { status: backendRes.status });
    const setCookie = backendRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Authentication request failed" },
      { status: 500 }
    );
  }
}
