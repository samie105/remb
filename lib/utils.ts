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
