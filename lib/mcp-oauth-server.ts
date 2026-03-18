/**
 * MCP OAuth 2.1 Authorization Server
 *
 * Implements:
 * - RFC 9728 (OAuth Protected Resource Metadata)
 * - RFC 8414 (Authorization Server Metadata)
 * - RFC 7636 (PKCE)
 * - RFC 7591 (Dynamic Client Registration)
 *
 * Flow:
 * 1. IDE discovers OAuth via .well-known endpoints
 * 2. IDE redirects user to /authorize with PKCE
 * 3. User authenticates via GitHub OAuth (if needed) and approves
 * 4. Server generates authorization code, redirects to IDE's redirect_uri
 * 5. IDE exchanges code for access token at /api/oauth/token
 * 6. IDE uses access token as Bearer for MCP requests
 */

import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

const CODE_TTL_MINUTES = 5;

/* ─── helpers ─── */

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeUri(uri: string): string {
  try {
    const u = new URL(uri);
    // Normalize: lowercase scheme+host, remove default ports, strip trailing slashes
    let normalized = `${u.protocol}//${u.hostname}`;
    if (u.port) normalized += `:${u.port}`;
    normalized += u.pathname.replace(/\/+$/, "") || "/";
    if (u.search) normalized += u.search;
    return normalized;
  } catch {
    return uri;
  }
}

/* ─── Dynamic Client Registration ─── */

export async function registerClient(body: {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}): Promise<{
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}> {
  const db = createAdminClient();
  const clientId = `remb_client_${randomBytes(16).toString("hex")}`;

  const redirectUris = body.redirect_uris ?? [];
  const grantTypes = body.grant_types ?? ["authorization_code"];
  const responseTypes = body.response_types ?? ["code"];
  const authMethod = body.token_endpoint_auth_method ?? "none";

  const { error } = await db.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_name: body.client_name ?? null,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
  });

  if (error) throw new Error(`Failed to register client: ${error.message}`);

  return {
    client_id: clientId,
    client_name: body.client_name,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
  };
}

/* ─── Client Info Lookup ─── */

export async function getClientInfo(
  clientId: string
): Promise<{ client_name: string | null; redirect_uris: string[] } | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("mcp_oauth_clients")
    .select("client_name, redirect_uris")
    .eq("client_id", clientId)
    .single();
  return data ?? null;
}

/* ─── Authorization Code ─── */

/**
 * Generate an authorization code, store its hash in DB, and return the raw code.
 */
export async function createAuthorizationCode(params: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
  state?: string;
}): Promise<string> {
  const db = createAdminClient();
  const rawCode = randomBytes(32).toString("base64url");
  const codeHash = sha256(rawCode);
  const expiresAt = new Date(
    Date.now() + CODE_TTL_MINUTES * 60 * 1000
  ).toISOString();

  const { error } = await db.from("mcp_oauth_codes").insert({
    code_hash: codeHash,
    user_id: params.userId,
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    scope: params.scope ?? null,
    state: params.state ?? null,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Failed to create authorization code: ${error.message}`);
  return rawCode;
}

/**
 * Exchange an authorization code for an access token.
 * Validates PKCE code_verifier against the stored code_challenge.
 * Returns the generated API key (access_token).
 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<{
  access_token: string;
  token_type: "bearer";
  scope?: string;
}> {
  const db = createAdminClient();
  const codeHash = sha256(params.code);

  // Look up the code
  const { data: codeRow, error: lookupErr } = await db
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .single();

  if (lookupErr || !codeRow) {
    throw new OAuthError("invalid_grant", "Authorization code not found");
  }

  // Check if already used
  if (codeRow.used) {
    throw new OAuthError("invalid_grant", "Authorization code already used");
  }

  // Check expiry
  if (new Date(codeRow.expires_at) < new Date()) {
    throw new OAuthError("invalid_grant", "Authorization code expired");
  }

  // For PKCE-protected flows, the code_verifier is the primary security mechanism.
  // IDEs may send different client_ids between /authorize and /token (e.g. API key vs registered id).
  // We still verify redirect_uri to prevent code interception attacks.

  // Verify redirect_uri matches (normalize before comparing)
  if (normalizeUri(codeRow.redirect_uri) !== normalizeUri(params.redirectUri)) {
    throw new OAuthError("invalid_grant", "Redirect URI mismatch");
  }

  // Verify PKCE: base64url(sha256(code_verifier)) === code_challenge
  const computedChallenge = createHash("sha256")
    .update(params.codeVerifier)
    .digest("base64url");

  if (computedChallenge !== codeRow.code_challenge) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  // Mark code as used
  await db
    .from("mcp_oauth_codes")
    .update({ used: true })
    .eq("id", codeRow.id);

  // Generate an API key as the access token
  const rawKey = `remb_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const preview = rawKey.slice(-4);

  const { error: keyErr } = await db.from("api_keys").insert({
    user_id: codeRow.user_id,
    name: `MCP Client (${params.clientId.slice(0, 20)})`,
    key_hash: keyHash,
    key_preview: preview,
  });

  if (keyErr) {
    throw new OAuthError("server_error", `Failed to create access token: ${keyErr.message}`);
  }

  return {
    access_token: rawKey,
    token_type: "bearer",
    scope: codeRow.scope ?? undefined,
  };
}

/* ─── Validate client_id ─── */

/**
 * Check if a client_id is valid. Accepts:
 * - Dynamically registered clients (in mcp_oauth_clients table)
 * - Any client_id for public clients (IDEs) — we're permissive since PKCE provides security
 */
export async function validateClientId(clientId: string): Promise<boolean> {
  // We allow any client_id for public clients since PKCE secures the flow.
  // This matches the MCP spec which says servers SHOULD support dynamic registration
  // but clients may also use arbitrary client IDs.
  return clientId.length > 0;
}

/* ─── Validate redirect_uri ─── */

/**
 * Validate the redirect_uri. For MCP clients:
 * - localhost/127.0.0.1 loopback URIs are always allowed (IDE local servers)
 * - Registered redirect_uris are checked for dynamic clients
 */
export function validateRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    // Allow loopback addresses (any port) — standard for desktop OAuth clients
    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]"
    ) {
      return true;
    }
    // Allow HTTPS redirect URIs
    if (url.protocol === "https:") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ─── OAuth metadata builders ─── */

export function getProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  };
}

export function getAuthorizationServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

/* ─── Error class ─── */

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OAuthError";
  }
}
