"use client";

import { useSyncExternalStore, useCallback, useEffect } from "react";

/* ─── types ─── */
export interface GitHubAccount {
  username: string;
  avatarUrl: string;
  connectedAt: string;
}

export interface LinkedRepo {
  fullName: string; // e.g. "richie/my-saas-app"
  name: string;
  description: string;
  language: string;
  isPrivate: boolean;
  linkedAt: string;
  projectSlug: string; // the Remb project this is linked to
}

export interface GitHubState {
  account: GitHubAccount | null;
  linkedRepos: LinkedRepo[];
}

/* ─── storage key ─── */
const STORAGE_KEY = "remb:github";
const EMPTY_STATE: GitHubState = { account: null, linkedRepos: [] };

let cachedState: GitHubState = EMPTY_STATE;
let hasLoadedSnapshot = false;

/* ─── helpers ─── */
function readStateFromStorage(): GitHubState {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return JSON.parse(raw) as GitHubState;
  } catch {
    return EMPTY_STATE;
  }
}

function getState(): GitHubState {
  if (!hasLoadedSnapshot && typeof window !== "undefined") {
    cachedState = readStateFromStorage();
    hasLoadedSnapshot = true;
  }

  return cachedState;
}

function setState(next: GitHubState) {
  cachedState = next;
  hasLoadedSnapshot = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // notify subscribers
  listeners.forEach((l) => l());
}

/* ─── external store plumbing ─── */
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): GitHubState {
  return getState();
}

function getServerSnapshot(): GitHubState {
  return EMPTY_STATE;
}

/* ─── hook ─── */
export function useGitHubStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Hydrate from URL search params after OAuth callback redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ghConnected = params.get("gh_connected");
    const ghUser = params.get("gh_user");
    const ghAvatar = params.get("gh_avatar");

    if (ghConnected === "true" && ghUser) {
      const current = getState();
      if (current.account?.username !== ghUser) {
        setState({
          ...current,
          account: {
            username: ghUser,
            avatarUrl: ghAvatar ?? `https://api.dicebear.com/9.x/initials/svg?seed=${ghUser}`,
            connectedAt: new Date().toISOString(),
          },
        });
      }
      // Clean up URL params without a page reload
      const url = new URL(window.location.href);
      url.searchParams.delete("gh_connected");
      url.searchParams.delete("gh_user");
      url.searchParams.delete("gh_avatar");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Server-side fallback: if no local account, check server connection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = getState();
    if (current.account) return; // already hydrated
    let cancelled = false;
    (async () => {
      const { getGitHubConnection } = await import("@/lib/github-actions");
      const { connected, user } = await getGitHubConnection();
      if (cancelled || !connected || !user) return;
      const latest = getState();
      if (latest.account) return; // hydrated while we were fetching
      setState({
        ...latest,
        account: {
          username: user.login,
          avatarUrl: user.avatar_url ?? `https://api.dicebear.com/9.x/initials/svg?seed=${user.login}`,
          connectedAt: new Date().toISOString(),
        },
      });
    })();
    return () => { cancelled = true; };
  }, []);

  /** Redirect to GitHub OAuth flow via server action */
  const connectAccount = useCallback(async () => {
    const { initiateGitHubOAuth } = await import("@/lib/github-actions");
    const returnTo = window.location.pathname + window.location.search;
    const { url } = await initiateGitHubOAuth(returnTo);
    window.location.href = url;
  }, []);

  /** Disconnect: clear local store + remove server-side token cookie */
  const disconnectAccount = useCallback(async () => {
    setState({ account: null, linkedRepos: [] });
    const { disconnectGitHub } = await import("@/lib/github-actions");
    await disconnectGitHub();
  }, []);

  const linkRepo = useCallback(
    (repo: Omit<LinkedRepo, "linkedAt">) => {
      const current = getState();
      // avoid duplicates
      if (current.linkedRepos.some((r) => r.fullName === repo.fullName)) return;
      setState({
        ...current,
        linkedRepos: [
          ...current.linkedRepos,
          { ...repo, linkedAt: new Date().toISOString() },
        ],
      });
    },
    []
  );

  const unlinkRepo = useCallback((fullName: string) => {
    const current = getState();
    setState({
      ...current,
      linkedRepos: current.linkedRepos.filter((r) => r.fullName !== fullName),
    });
  }, []);

  const isRepoLinked = useCallback(
    (fullName: string) => {
      return state.linkedRepos.some((r) => r.fullName === fullName);
    },
    [state.linkedRepos]
  );

  const getLinkedRepoForProject = useCallback(
    (projectSlug: string) => {
      return state.linkedRepos.find((r) => r.projectSlug === projectSlug) ?? null;
    },
    [state.linkedRepos]
  );

  return {
    account: state.account,
    linkedRepos: state.linkedRepos,
    isConnected: state.account !== null,
    connectAccount,
    disconnectAccount,
    linkRepo,
    unlinkRepo,
    isRepoLinked,
    getLinkedRepoForProject,
  };
}
