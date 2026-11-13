import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || undefined;
  const backendRes = await proxyToBackend(
    "/api/auth/me",
    "GET",
    undefined,
    cookieHeader
  );

  if (!backendRes) {
    const response = NextResponse.json(
      { success: false, message: "Backend authentication service unavailable" },
      { status: 401 }
    );
    response.cookies.set("fielddesk_session", "", {
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const data = await backendRes.json();
  const response = NextResponse.json(data, { status: backendRes.status });

  if (backendRes.status === 401) {
    response.cookies.set("fielddesk_session", "", {
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
