import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const cookieHeader = request.headers.get("cookie") || undefined;

  try {
    const res = await fetch(`${BACKEND_URL}/api/progress-events/${subPath}`, {
      method: "GET",
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend service unreachable" },
      { status: 502 }
    );
  }
}

