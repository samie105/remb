/* ─── Server-side GitHub helpers ─── */

const GITHUB_API = "https://api.github.com";

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

export interface GitHubRepo {
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  private: boolean;
  stargazers_count: number;
  pushed_at: string;
  default_branch: string;
}

/** Exchange the OAuth code for an access token */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!res.ok) throw new Error("Failed to exchange code for token");

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(data.error ?? "No access token returned");
  }

  return data.access_token;
}

/** Fetch the authenticated user's profile */
export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  return res.json() as Promise<GitHubUser>;
}

/** Fetch up to 100 of the user's repos (sorted by most recently pushed) */
export async function fetchGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?sort=pushed&per_page=100&type=owner`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    }
  );
  if (!res.ok) throw new Error("Failed to fetch GitHub repos");
  return res.json() as Promise<GitHubRepo[]>;
}
