import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Credentials are stored at ~/.config/remb/credentials
 * following XDG conventions. The file is chmod 600.
 *
 * Format (plain text, one key):
 *   api_key=remb_xxxx...
 */

function getCredentialsDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || resolve(homedir(), ".config");
  return resolve(base, "remb");
}

function getCredentialsPath(): string {
  return resolve(getCredentialsDir(), "credentials");
}

export function getApiKey(): string | null {
  // 1. Environment variable takes precedence
  const envKey = process.env.REMB_API_KEY;
  if (envKey) {
    if (!isValidKeyFormat(envKey)) {
      process.stderr.write("Warning: REMB_API_KEY has an unexpected format (expected remb_ prefix, ≥20 chars)\n");
    }
    return envKey;
  }

  // 2. Credentials file
  const path = getCredentialsPath();
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("api_key=")) {
      return trimmed.slice("api_key=".length).trim();
    }
  }
  return null;
}

export function saveApiKey(apiKey: string): string {
  if (!isValidKeyFormat(apiKey)) {
    throw new Error("Invalid API key format. Keys must start with remb_ and be at least 20 characters.");
  }

  const dir = getCredentialsDir();
  mkdirSync(dir, { recursive: true });

  const path = getCredentialsPath();
  const content = `# Remb API credentials\n# Keep this file secret — do not commit to version control\napi_key=${apiKey}\n`;

  writeFileSync(path, content, { encoding: "utf-8", mode: 0o600 });

  // Ensure proper permissions even if file already existed
  try {
    chmodSync(path, 0o600);
  } catch {
    // Ignore on Windows
  }

  return path;
}

export function clearApiKey(): boolean {
  const path = getCredentialsPath();
  if (!existsSync(path)) return false;
  writeFileSync(path, "", { encoding: "utf-8", mode: 0o600 });
  return true;
}

export function getCredentialsFilePath(): string {
  return getCredentialsPath();
}

function isValidKeyFormat(key: string): boolean {
  return key.startsWith("remb_") && key.length >= 20;
}
