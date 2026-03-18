"use client";

import { useState } from "react";
import Image from "next/image";
import { approveAuthorization } from "../_actions/approve";

/* ─── IDE detection from client name / redirect URI ─── */

type IdeInfo = {
  name: string;
  icon: React.ReactNode;
};

function detectIde(clientName?: string, redirectUri?: string, oauthState?: string): IdeInfo {
  const text = `${clientName ?? ""} ${redirectUri ?? ""} ${oauthState ?? ""}`.toLowerCase();

  if (text.includes("cursor"))
    return {
      name: "Cursor",
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
          <circle cx="12" cy="12" r="12" fill="#1a1a2e" />
          <path d="M6 18L18 12L6 6v4.5L12.5 12 6 13.5V18z" fill="white" />
        </svg>
      ),
    };

  if (text.includes("windsurf"))
    return {
      name: "Windsurf",
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
          <circle cx="12" cy="12" r="12" fill="#0a1628" />
          <path d="M6 17c2-3 4-8 12-11-2 4-3.5 7-5 9.5C11.5 18 8 18 6 17z" fill="#00c2ff" />
        </svg>
      ),
    };

  if (text.includes("vscode") || text.includes("visual studio code") || text.includes("vscode.dev"))
    return {
      name: "VS Code",
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
          <circle cx="12" cy="12" r="12" fill="#1e1e1e" />
          <path d="M16.5 3L8.5 10.2 5.5 7.8 4 8.7v6.6l1.5.9 3-2.4L16.5 21l3.5-1.7V4.7L16.5 3zm0 3.4v11.2l-5.5-5.6 5.5-5.6z" fill="#007acc" />
        </svg>
      ),
    };

  if (text.includes("zed"))
    return {
      name: "Zed",
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
          <circle cx="12" cy="12" r="12" fill="#18181b" />
          <text x="12" y="16" textAnchor="middle" fill="#f59e0b" fontSize="12" fontWeight="bold" fontFamily="system-ui">Z</text>
        </svg>
      ),
    };

  if (text.includes("neovim") || text.includes("nvim"))
    return {
      name: "Neovim",
      icon: (
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
          <circle cx="12" cy="12" r="12" fill="#18181b" />
          <path d="M6 6l6 12V6h-2v7L6 6zm6 0v12l6-12h-2l-4 7V6z" fill="#57a143" />
        </svg>
      ),
    };

  return {
    name: clientName || "Application",
    icon: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
        <circle cx="12" cy="12" r="12" fill="#18181b" />
        <path d="M8 6l-4 6 4 6M16 6l4 6-4 6M13 5l-2 14" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };
}

/* ─── Permission item ─── */

function PermissionItem({
  icon,
  label,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/50 px-3.5 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

export function AuthorizeClient({
  user,
  clientId,
  clientName,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
}: {
  user: { login: string; avatar?: string };
  clientId: string;
  clientName?: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  scope?: string;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ide = detectIde(clientName, redirectUri, state);

  async function handleApprove() {
    setIsApproving(true);
    setError(null);

    try {
      const result = await approveAuthorization({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        state,
        scope,
      });

      if (result.error) {
        setError(result.error);
        setIsApproving(false);
        return;
      }

      if (result.redirectUrl) {
        setIsRedirecting(true);
        window.location.href = result.redirectUrl;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsApproving(false);
    }
  }

  function handleDeny() {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  if (isRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background to-muted/30 px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center">
            <div className="relative z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-card shadow-md ring-4 ring-background">
              {ide.icon}
            </div>
            <div className="relative z-20 -mx-2 flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 shadow-md ring-4 ring-background dark:bg-zinc-50">
              <span className="text-xl font-bold text-zinc-50 dark:text-zinc-950">C</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Authorized</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Redirecting back to {ide.name}…
            </p>
          </div>
          <svg className="h-5 w-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background to-muted/30 px-4">
      <div className="w-full max-w-105">
        {/* Overlapping icons with + badge */}
        <div className="mb-6 flex flex-col items-center">
          <div className="relative flex items-center">
            {/* IDE icon */}
            <div className="relative z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-card shadow-md ring-4 ring-background">
              {ide.icon}
            </div>
            {/* + badge */}
            <div className="relative z-20 -mx-2 flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
              </svg>
            </div>
            {/* Remb icon */}
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-950 shadow-md ring-4 ring-background dark:bg-zinc-50">
              <span className="text-xl font-bold text-zinc-50 dark:text-zinc-950">C</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{ide.name}</span>
            <span>&</span>
            <span className="font-medium text-foreground">Remb</span>
          </div>
        </div>

        {/* Main card */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-xl shadow-black/5">
          {/* Header */}
          <div className="px-6 pt-6 pb-0">
            <h1 className="text-center text-lg font-semibold text-foreground">
              Authorize connection
            </h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{ide.name}</span>{" "}
              wants to access your Remb account
            </p>
          </div>

          <div className="px-6 py-5">
            {/* Signed in as */}
            <div className="mb-5 flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.login}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {user.login[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.login}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                GitHub
              </span>
            </div>

            {/* Permissions */}
            <div className="mb-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Permissions
              </p>
              <div className="space-y-2">
                <PermissionItem
                  icon={
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093z" />
                    </svg>
                  }
                  label="MCP tools & resources"
                  description="Execute tools and access resources via MCP"
                />
                <PermissionItem
                  icon={
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 0 0 1.33 0l1.713-3.293a.783.783 0 0 1 .642-.413 41.1 41.1 0 0 0 3.55-.414C18.007 13.245 19 11.987 19 10.574V5.426c0-1.413-.993-2.67-2.43-2.902A41.3 41.3 0 0 0 10 2zM6.75 6a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5zm0 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Read & write memories"
                  description="Store and retrieve context memories for projects"
                />
                <PermissionItem
                  icon={
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M14.5 10a4.5 4.5 0 0 0 4.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 0 1-.493.1 3.29 3.29 0 0 1-1.604-1.604.455.455 0 0 1 .099-.493l2.691-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 0 0-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 1 0 3.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.291.01zM5 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" clipRule="evenodd" />
                    </svg>
                  }
                  label="Connected MCP servers"
                  description="Call tools on linked third-party servers"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-destructive">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDeny}
                disabled={isApproving}
                className="flex-1 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {isApproving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Authorizing…
                  </span>
                ) : (
                  "Authorize"
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-muted/20 px-6 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Redirects to{" "}
                <span className="font-mono text-foreground/70">
                  {(() => {
                    try {
                      const u = new URL(redirectUri);
                      return `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
                    } catch {
                      return redirectUri;
                    }
                  })()}
                </span>
              </p>
              <div className="flex items-center gap-1 text-[11px] text-primary">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path
                    fillRule="evenodd"
                    d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1zm2 6V4.5a2 2 0 1 0-4 0V7h4z"
                    clipRule="evenodd"
                  />
                </svg>
                PKCE secured
              </div>
            </div>
          </div>
        </div>

        {/* Client ID */}
        <p className="mt-3 text-center text-[11px] text-muted-foreground/60">
          {clientId}
        </p>
      </div>
    </div>
  );
}
