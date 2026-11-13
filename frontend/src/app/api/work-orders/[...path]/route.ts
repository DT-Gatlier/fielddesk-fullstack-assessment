import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const search = request.nextUrl.search;
  const cookieHeader = request.headers.get("cookie") || undefined;

  try {
    const res = await fetch(`${BACKEND_URL}/api/work-orders/${subPath}${search}`, {
      method: "GET",
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const headers = new Headers();
    if (res.headers.get("content-disposition")) {
      headers.set("content-disposition", res.headers.get("content-disposition")!);
    }
    headers.set("content-type", contentType);

    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend work-order service unavailable" },
      { status: 503 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const cookieHeader = request.headers.get("cookie") || undefined;
  const contentType = request.headers.get("content-type") || "";

  try {
    const body = await request.arrayBuffer();
    const res = await fetch(`${BACKEND_URL}/api/work-orders/${subPath}`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body,
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path.join("/");
  const cookieHeader = request.headers.get("cookie") || undefined;

  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/work-orders/${subPath}`, {
      method: "PUT",
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
