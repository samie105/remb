import { NextResponse } from "next/server";
import { getProtectedResourceMetadata } from "@/lib/mcp-oauth-server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /.well-known/oauth-protected-resource
 * RFC 9728 — tells MCP clients where to find the authorization server.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json(getProtectedResourceMetadata(baseUrl), {
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
