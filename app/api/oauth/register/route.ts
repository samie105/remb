import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp-oauth-server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Preflight for CORS */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/oauth/register
 * RFC 7591 — Dynamic Client Registration.
 * MCP clients call this to register before starting the OAuth flow.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Invalid JSON body" },
      { status: 400 }
    );
  }

  try {
    const result = await registerClient({
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : undefined,
      grant_types: Array.isArray(body.grant_types) ? body.grant_types : undefined,
      response_types: Array.isArray(body.response_types) ? body.response_types : undefined,
      token_endpoint_auth_method:
        typeof body.token_endpoint_auth_method === "string"
          ? body.token_endpoint_auth_method
          : undefined,
    });

    return NextResponse.json(result, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: err instanceof Error ? err.message : "Registration failed",
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }
}
