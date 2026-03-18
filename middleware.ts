import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Redirect /landing (and /landing/*) → /
  if (request.nextUrl.pathname === "/landing" || request.nextUrl.pathname.startsWith("/landing/")) {
    return NextResponse.redirect(new URL("/", request.url), { status: 301 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/landing", "/landing/:path*"],
};
