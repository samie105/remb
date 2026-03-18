"use server";

import { getSession } from "@/lib/auth";
import {
  createAuthorizationCode,
  validateRedirectUri,
} from "@/lib/mcp-oauth-server";

export async function approveAuthorization(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  scope?: string;
}): Promise<{ redirectUrl?: string; error?: string }> {
  const session = await getSession();
  if (!session) {
    return { error: "Not authenticated" };
  }

  if (!validateRedirectUri(params.redirectUri)) {
    return { error: "Invalid redirect URI" };
  }

  try {
    const code = await createAuthorizationCode({
      userId: session.dbUser.id,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope,
      state: params.state,
    });

    // Build redirect URL with code
    const url = new URL(params.redirectUri);
    url.searchParams.set("code", code);
    if (params.state) {
      url.searchParams.set("state", params.state);
    }

    return { redirectUrl: url.toString() };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create authorization code",
    };
  }
}
