import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-keys";
import type { UserRow } from "@/lib/supabase/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

/**
 * Extract Bearer token from Authorization header, validate, and return the user.
 * Returns a NextResponse error if auth fails (caller should return it directly).
 */
export async function authenticateCliRequest(
  request: Request
): Promise<{ user: UserRow; apiKeyId: string } | NextResponse> {
  const auth = request.headers.get("authorization");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or malformed Authorization header. Use: Bearer <api-key>" },
      {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  const rawKey = auth.slice(7);
  const result = await validateApiKey(rawKey);
  if (!result) {
    return NextResponse.json(
      { error: "Invalid or revoked API key" },
      {
        status: 401,
        headers: {
          ...CORS_HEADERS,
          "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  return { user: result.user, apiKeyId: result.keyId };
}
