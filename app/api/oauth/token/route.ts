import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  OAuthError,
} from "@/lib/mcp-oauth-server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** Preflight for CORS */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/oauth/token
 * OAuth 2.1 Token Endpoint — exchanges an authorization code for an access token.
 * Supports application/x-www-form-urlencoded (standard) and application/json.
 */
export async function POST(request: Request) {
  let grantType: string | null = null;
  let code: string | null = null;
  let codeVerifier: string | null = null;
  let clientId: string | null = null;
  let redirectUri: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  console.log("[oauth/token] Content-Type:", contentType);

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    grantType = form.get("grant_type") as string | null;
    code = form.get("code") as string | null;
    codeVerifier = form.get("code_verifier") as string | null;
    clientId = form.get("client_id") as string | null;
    redirectUri = form.get("redirect_uri") as string | null;
  } else {
    try {
      const body = await request.json();
      grantType = body.grant_type ?? null;
      code = body.code ?? null;
      codeVerifier = body.code_verifier ?? null;
      clientId = body.client_id ?? null;
      redirectUri = body.redirect_uri ?? null;
    } catch {
      console.log("[oauth/token] Failed to parse body");
      return oauthError("invalid_request", "Invalid request body", 400);
    }
  }

  console.log("[oauth/token] grant_type:", grantType, "client_id:", clientId?.slice(0, 20), "redirect_uri:", redirectUri, "has_code:", !!code, "has_verifier:", !!codeVerifier);

  if (grantType !== "authorization_code") {
    console.log("[oauth/token] REJECTED: unsupported grant_type:", grantType);
    return oauthError(
      "unsupported_grant_type",
      "Only authorization_code grant is supported",
      400
    );
  }

  if (!code || !codeVerifier || !clientId || !redirectUri) {
    console.log("[oauth/token] REJECTED: missing params — code:", !!code, "verifier:", !!codeVerifier, "client:", !!clientId, "redirect:", !!redirectUri);
    return oauthError(
      "invalid_request",
      "Missing required parameters: code, code_verifier, client_id, redirect_uri",
      400
    );
  }

  try {
    const result = await exchangeAuthorizationCode({
      code,
      codeVerifier,
      clientId,
      redirectUri,
    });

    console.log("[oauth/token] SUCCESS — issued token for client:", clientId?.slice(0, 20));

    return NextResponse.json(
      { ...result, expires_in: 31536000 },
      {
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.log("[oauth/token] FAILED:", msg);
    if (err instanceof OAuthError) {
      return oauthError(err.code, err.message, 400);
    }
    return oauthError("server_error", msg, 500);
  }
}

function oauthError(error: string, description: string, status: number) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    }
  );
}
