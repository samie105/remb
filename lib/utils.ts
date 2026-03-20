import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the base URL for internal server-to-server API calls.
 *
 * Prefers VERCEL_URL (the direct deployment URL) over NEXT_PUBLIC_APP_URL
 * (the custom domain) because custom domains can involve redirects (e.g.
 * non-www → www) that cause fetch() to strip the Authorization header per
 * the Fetch specification — which breaks SCAN_WORKER_SECRET auth.
 */
export function getInternalApiUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return "http://localhost:3000";
}

/**
 * Returns headers needed for internal server-to-server fetch calls.
 *
 * Includes the Vercel Deployment Protection bypass header when
 * VERCEL_AUTOMATION_BYPASS_SECRET is set, so internal calls don't get
 * blocked by Vercel's authentication wall.
 */
export function getInternalFetchHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    headers["x-vercel-protection-bypass"] = bypassSecret;
  }
  return headers;
}
