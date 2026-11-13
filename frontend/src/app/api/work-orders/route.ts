import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || undefined;
  const search = request.nextUrl.search;

  try {
    const res = await fetch(`${BACKEND_URL}/api/work-orders${search}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend work-order service unavailable" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") || undefined;

  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/work-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend work-order service unavailable" },
      { status: 503 }
    );
  }
}

