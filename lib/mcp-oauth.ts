"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { UserRow, McpServerRow, Json } from "@/lib/supabase/types";
import {
  discoverOAuthServerInfo,
  startAuthorization,
  exchangeAuthorization,
  registerClient,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

/* ─── helpers ─── */

async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function getRedirectUrl(serverId: string): string {
  return `${getAppUrl()}/api/mcp/oauth/callback?server_id=${encodeURIComponent(serverId)}`;
}

/* ─── initiate OAuth ─── */

export interface OAuthInitResult {
  authorizationUrl: string;
}

/**
 * Kicks off the MCP OAuth flow for a given server.
 * 1. Discovers the server's OAuth metadata (RFC 9728 + RFC 8414)
 * 2. Dynamically registers our client if needed
 * 3. Generates PKCE challenge and builds the authorization URL
 * 4. Returns the URL for the frontend to open in a popup
 */
export async function initMcpOAuth(
  serverId: string
): Promise<OAuthInitResult> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: server, error: fetchErr } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !server) throw new Error("MCP server not found");

  const redirectUrl = getRedirectUrl(serverId);

  // Step 1: Discover OAuth server info
  const serverInfo = await discoverOAuthServerInfo(server.url);
  const { authorizationServerUrl, authorizationServerMetadata } = serverInfo;

  if (!authorizationServerMetadata) {
    throw new Error(
      "This MCP server does not support OAuth — try using a bearer token instead."
    );
  }

  // Step 2: Dynamic client registration (or use existing)
  let clientInfo = server.oauth_client_info as unknown as OAuthClientInformationFull | null;

  if (!clientInfo?.client_id) {
    const registered = await registerClient(authorizationServerUrl, {
      metadata: authorizationServerMetadata,
      clientMetadata: {
        client_name: "Remb MCP Hub",
        redirect_uris: [redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
    clientInfo = registered;

    await db
      .from("mcp_servers")
      .update({
        oauth_client_info: registered as unknown as Json,
        auth_type: "oauth",
      })
      .eq("id", serverId)
      .eq("user_id", user.id);
  }

  // Step 3: Start PKCE authorization
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    authorizationServerUrl,
    {
      metadata: authorizationServerMetadata,
      clientInformation: clientInfo,
      redirectUrl,
      resource: serverInfo.resourceMetadata?.resource
        ? new URL(serverInfo.resourceMetadata.resource)
        : undefined,
    }
  );

  // Save code verifier for the callback to use
  await db
    .from("mcp_servers")
    .update({ oauth_code_verifier: codeVerifier })
    .eq("id", serverId)
    .eq("user_id", user.id);

  return { authorizationUrl: authorizationUrl.toString() };
}

/* ─── complete OAuth (called from callback route) ─── */

/**
 * Exchanges the authorization code for tokens and saves them.
 * Called from the /api/mcp/oauth/callback route.
 */
export async function completeMcpOAuth(
  serverId: string,
  userId: string,
  authorizationCode: string
): Promise<void> {
  const db = createAdminClient();

  const { data: server, error: fetchErr } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !server) throw new Error("MCP server not found");
  if (!server.oauth_code_verifier) throw new Error("No pending OAuth flow");
  if (!server.oauth_client_info) throw new Error("No OAuth client registration");

  const clientInfo = server.oauth_client_info as unknown as OAuthClientInformationFull;
  const redirectUrl = getRedirectUrl(serverId);

  // Discover server info again
  const serverInfo = await discoverOAuthServerInfo(server.url);
  const { authorizationServerUrl, authorizationServerMetadata } = serverInfo;

  // Exchange code for tokens
  const tokens: OAuthTokens = await exchangeAuthorization(
    authorizationServerUrl,
    {
      metadata: authorizationServerMetadata,
      clientInformation: clientInfo,
      authorizationCode,
      codeVerifier: server.oauth_code_verifier,
      redirectUri: redirectUrl,
      resource: serverInfo.resourceMetadata?.resource
        ? new URL(serverInfo.resourceMetadata.resource)
        : undefined,
    }
  );

  // Save tokens and clear verifier
  await db
    .from("mcp_servers")
    .update({
      oauth_tokens: tokens as unknown as Json,
      oauth_code_verifier: null,
      auth_type: "oauth",
      health_status: "unknown",
    })
    .eq("id", serverId)
    .eq("user_id", userId);
}

/* ─── check OAuth status (for polling from UI) ─── */

export async function checkMcpOAuthStatus(
  serverId: string
): Promise<{ authenticated: boolean }> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: server } = await db
    .from("mcp_servers")
    .select("oauth_tokens")
    .eq("id", serverId)
    .eq("user_id", user.id)
    .single();

  if (!server) throw new Error("MCP server not found");

  const tokens = server.oauth_tokens as unknown as OAuthTokens | null;
  return { authenticated: !!tokens?.access_token };
}
