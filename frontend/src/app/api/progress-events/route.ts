import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || undefined;
  const body = await request.text();

  try {
    const res = await fetch(`${BACKEND_URL}/api/progress-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body,
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

