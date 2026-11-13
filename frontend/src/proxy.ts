import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("fielddesk_session")?.value;
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isRootRoute = request.nextUrl.pathname === "/";

  if (!token && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isRootRoute) {
    const url = request.nextUrl.clone();
    url.pathname = token ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/work-orders/:path*"],
};
