import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { validateRedirectUri, validateClientId, getClientInfo } from "@/lib/mcp-oauth-server";
import { AuthorizeClient } from "./_components/authorize-client";

/**
 * /authorize — OAuth 2.1 Authorization Endpoint
 *
 * The IDE redirects the user here with PKCE params.
 * If the user isn't logged in, we redirect to GitHub OAuth first.
 */
export default async function AuthorizePage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const clientId = searchParams.client_id;
  const responseType = searchParams.response_type;
  const codeChallenge = searchParams.code_challenge;
  const codeChallengeMethod = searchParams.code_challenge_method ?? "S256";
  const redirectUri = searchParams.redirect_uri;
  const state = searchParams.state;
  const scope = searchParams.scope;

  // Validate required params
  if (!clientId || !responseType || !codeChallenge || !redirectUri) {
    return (
      <ErrorPage message="Missing required OAuth parameters (client_id, response_type, code_challenge, redirect_uri)" />
    );
  }

  if (responseType !== "code") {
    return <ErrorPage message="Only response_type=code is supported" />;
  }

  if (codeChallengeMethod !== "S256") {
    return <ErrorPage message="Only S256 code_challenge_method is supported" />;
  }

  if (!validateRedirectUri(redirectUri)) {
    return <ErrorPage message="Invalid redirect_uri. Only localhost and HTTPS URIs are allowed." />;
  }

  const isValidClient = await validateClientId(clientId);
  if (!isValidClient) {
    return <ErrorPage message="Invalid client_id" />;
  }

  // Check if user is authenticated
  const session = await getSession();

  if (!session) {
    // Redirect to the route handler which can set cookies and redirect to GitHub OAuth
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const authorizeUrl = `${appUrl}/authorize?${new URLSearchParams(
      Object.entries(searchParams).filter((e): e is [string, string] => e[1] !== undefined)
    ).toString()}`;

    redirect(
      `/api/oauth/start?return_to=${encodeURIComponent(authorizeUrl)}`
    );
  }

  // User is authenticated — show approval screen
  const clientInfo = await getClientInfo(clientId);

  return (
    <AuthorizeClient
      user={{
        login: session.dbUser.github_login,
        avatar: session.dbUser.github_avatar ?? undefined,
      }}
      clientId={clientId}
      clientName={clientInfo?.client_name ?? undefined}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      codeChallengeMethod={codeChallengeMethod}
      state={state}
      scope={scope}
    />
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background to-muted/30 px-4">
      <div className="w-full max-w-105">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-red-500">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">
                Authorization failed
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
