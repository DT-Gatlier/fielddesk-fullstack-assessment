import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || undefined;
  const backendRes = await proxyToBackend(
    "/api/auth/logout",
    "POST",
    undefined,
    cookieHeader
  );

  const response = NextResponse.json({
    success: true,
    message: "Logout successful",
  });

  if (backendRes) {
    const setCookie = backendRes.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
      return response;
    }
  }

  response.cookies.set("fielddesk_session", "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}
