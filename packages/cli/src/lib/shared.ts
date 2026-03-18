import chalk from "chalk";
import { findProjectConfig } from "./config.js";
import { ApiError } from "./api-client.js";
import { error as logError, warn } from "./output.js";

// ── Project resolution ──────────────────────────────────────────────

export function resolveProject(flag: string | undefined): string {
  if (flag) return flag;

  const config = findProjectConfig();
  if (config?.config.project) return config.config.project;

  logError(
    `No project specified. Use ${chalk.bold("-p <slug>")} or run ${chalk.bold("remb init")} in your project directory.`,
  );
  process.exit(1);
}

// ── Error handling ──────────────────────────────────────────────────

export function handleError(err: unknown): never {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 401:
        logError(
          `Authentication failed. Run ${chalk.bold("remb login")} to re-authenticate.`,
        );
        break;
      case 403:
        logError("Permission denied. Check your project access.");
        break;
      case 404:
        logError("Not found. Check the project slug or resource ID.");
        break;
      case 409:
        logError(err.message || "Conflict — the resource already exists.");
        break;
      case 429:
        logError("Rate limited. Wait a moment and try again.");
        break;
      default:
        if (err.statusCode >= 500) {
          logError(
            `Server error — try again later. ${chalk.dim(`(HTTP ${err.statusCode})`)}`,
          );
        } else {
          logError(
            `${err.message} ${chalk.dim(`(HTTP ${err.statusCode})`)}`,
          );
        }
    }
  } else if (
    err instanceof TypeError &&
    err.message.includes("fetch")
  ) {
    logError(
      "Could not reach Remb. Check your internet connection.",
    );
  } else if (err instanceof Error) {
    logError(err.message);
  } else {
    logError("An unexpected error occurred.");
  }
  process.exit(1);
}

// ── Confirmation prompt ─────────────────────────────────────────────

export async function confirmAction(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  process.stdout.write(`${message} ${chalk.dim("[y/N]")}: `);
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
    break;
  }
  const answer = Buffer.concat(chunks).toString("utf-8").trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

// ── Input validators ────────────────────────────────────────────────

export function validateContentSize(
  content: string,
  maxKB: number = 50,
): void {
  const sizeKB = Buffer.byteLength(content, "utf-8") / 1024;
  if (sizeKB > maxKB) {
    logError(
      `Content is too large (${Math.round(sizeKB)}KB). Maximum is ${maxKB}KB.`,
    );
    process.exit(1);
  }
}

export function validateStringLength(
  value: string,
  field: string,
  maxLen: number,
): void {
  if (!value || value.trim().length === 0) {
    logError(`${field} cannot be empty.`);
    process.exit(1);
  }
  if (value.length > maxLen) {
    logError(
      `${field} is too long (${value.length} chars). Maximum is ${maxLen}.`,
    );
    process.exit(1);
  }
}

export function validateEnum(
  value: string,
  field: string,
  allowed: string[],
): void {
  if (!allowed.includes(value)) {
    logError(
      `Invalid ${field} "${value}". Choose: ${allowed.join(", ")}`,
    );
    process.exit(1);
  }
}

export function validateUUID(value: string, field: string): void {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    logError(`Invalid ${field}. Expected a UUID (e.g. 12345678-abcd-...).`);
    process.exit(1);
  }
}

export function validateDateFormat(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    logError(
      `Invalid ${field} "${value}". Expected format: YYYY-MM-DD`,
    );
    process.exit(1);
  }
}

export function validatePositiveInt(
  value: number,
  field: string,
  max?: number,
): void {
  if (!Number.isFinite(value) || value < 1) {
    logError(`${field} must be a positive integer.`);
    process.exit(1);
  }
  if (max && value > max) {
    logError(`${field} cannot exceed ${max}.`);
    process.exit(1);
  }
}
