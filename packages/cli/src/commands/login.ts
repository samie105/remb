import { Command } from "commander";
import chalk from "chalk";
import { saveApiKey, getApiKey, clearApiKey, getCredentialsFilePath } from "../lib/credentials.js";
import { success, error, info, keyValue } from "../lib/output.js";
import { findProjectConfig } from "../lib/config.js";
import { confirmAction } from "../lib/shared.js";

const DEFAULT_API_URL = "http://localhost:3000";

function getBaseUrl(): string {
  const projectConfig = findProjectConfig();
  return (
    projectConfig?.config.api_url ?? DEFAULT_API_URL
  ).replace(/\/+$/, "");
}

/** Open a URL in the user's default browser. */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const { platform } = await import("node:os");
  const os = platform();
  const cmd =
    os === "darwin" ? "open" :
    os === "win32" ? "start" :
    "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

/** Poll the server until the OAuth flow completes or times out. */
async function pollForToken(
  baseUrl: string,
  state: string,
  timeoutMs: number = 120_000
): Promise<{ apiKey: string; login?: string } | null> {
  const deadline = Date.now() + timeoutMs;
  const interval = 2_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    try {
      const res = await fetch(`${baseUrl}/api/cli/auth/poll?state=${encodeURIComponent(state)}`);
      if (!res.ok) continue;

      const data = await res.json() as { status: string; apiKey?: string; login?: string };

      if (data.status === "completed" && data.apiKey) {
        return { apiKey: data.apiKey, login: data.login };
      }
      if (data.status === "expired") {
        return null;
      }
      // status === "pending" → keep polling
    } catch {
      // Network error — keep trying
    }
  }

  return null;
}

export const loginCommand = new Command("login")
  .description("Authenticate the CLI via browser OAuth or manual API key")
  .option("--key <api-key>", "Authenticate with an API key directly")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb login\n  $ remb login --key remb_abc123...\n  $ echo $REMB_KEY | remb login`,
  )
  .action(async (opts) => {
    // ── Path 1: Manual key ──────────────────────────────────────────────
    if (opts.key) {
      return saveAndConfirm(opts.key);
    }

    // ── Path 2: Interactive — offer choice ──────────────────────────────
    if (!process.stdin.isTTY) {
      // Piped input → read key from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      return saveAndConfirm(Buffer.concat(chunks).toString("utf-8").trim());
    }

    // TTY: ask the user how they want to login
    console.log();
    console.log(chalk.bold("  How would you like to authenticate?"));
    console.log();
    console.log(`  ${chalk.cyan("1)")} Sign in with GitHub ${chalk.dim("(opens browser)")}`);
    console.log(`  ${chalk.cyan("2)")} Paste an API key manually`);
    console.log();
    process.stdout.write(`  ${chalk.bold("Choice")} ${chalk.dim("[1/2]")}: `);

    const choice = await readLine();

    if (choice === "2") {
      // Manual key entry
      process.stdout.write(
        `  ${chalk.bold("Paste your API key")} ${chalk.dim("(from Dashboard → Settings → API Keys)")}: `
      );
      const key = await readLine();
      return saveAndConfirm(key);
    }

    // Default (1 or blank): Browser OAuth
    console.log();
    info("Starting browser login...");

    const baseUrl = getBaseUrl();

    try {
      const res = await fetch(`${baseUrl}/api/cli/auth/start`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        error(`Failed to start login: ${(body as { error?: string }).error ?? res.statusText}`);
        process.exit(1);
      }

      const { state, authUrl } = await res.json() as { state: string; authUrl: string };

      console.log();
      info(`Opening browser to authenticate...`);
      console.log(chalk.dim(`  If the browser doesn't open, visit:`));
      console.log(chalk.dim(`  ${authUrl}`));
      console.log();

      await openBrowser(authUrl);

      // Poll with a spinner
      const ora = (await import("ora")).default;
      const spinner = ora("Waiting for browser authentication...").start();

      const result = await pollForToken(baseUrl, state);

      if (!result) {
        spinner.fail("Login timed out or was cancelled.");
        console.log();
        info(`You can also login manually: ${chalk.bold("remb login --key <api-key>")}`);
        process.exit(1);
      }

      spinner.stop();

      const path = saveApiKey(result.apiKey);
      console.log();
      success(`Authenticated${result.login ? ` as ${chalk.bold(result.login)}` : ""}!`);
      keyValue("Location", path);
      keyValue("Preview", `remb_...${result.apiKey.slice(-4)}`);
      console.log();
      info(`Run ${chalk.bold("remb get -p <project>")} to verify your key works.`);
    } catch (err) {
      error(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
      console.log();
      info(`You can also login manually: ${chalk.bold("remb login --key <api-key>")}`);
      process.exit(1);
    }
  });

function saveAndConfirm(key: string): void {
  if (!key) {
    error("No API key provided.");
    process.exit(1);
  }

  if (!key.startsWith("remb_")) {
    error(
      `Invalid key format. Remb keys start with ${chalk.bold("remb_")}`
    );
    process.exit(1);
  }

  if (key.length < 20) {
    error("API key is too short. Check that you copied the full key.");
    process.exit(1);
  }

  const path = saveApiKey(key);
  console.log();
  success("API key saved successfully!");
  keyValue("Location", path);
  keyValue("Preview", `remb_...${key.slice(-4)}`);
  console.log();
  info(
    `Run ${chalk.bold("remb get -p <project>")} to verify your key works.`
  );
}

async function readLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
    break;
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export const logoutCommand = new Command("logout")
  .description("Remove stored API credentials")
  .option("-f, --force", "Skip confirmation prompt")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb logout\n  $ remb logout --force`,
  )
  .action(async (opts) => {
    if (!opts.force) {
      const confirmed = await confirmAction("Remove stored API credentials?");
      if (!confirmed) {
        info("Cancelled.");
        return;
      }
    }
    clearApiKey();
    success("API credentials cleared.");
  });

export const whoamiCommand = new Command("whoami")
  .description("Show current authentication status")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb whoami`,
  )
  .action(() => {
    const key = getApiKey();
    if (!key) {
      error("Not authenticated. Run `remb login` to set up.");
      process.exit(1);
    }

    success("Authenticated");
    keyValue("Key", `remb_...${key.slice(-4)}`);
    keyValue("Credentials", getCredentialsFilePath());

    const config = findProjectConfig();
    if (config?.config?.project) {
      keyValue("Project", config.config.project);
    }
    if (config?.config?.api_url) {
      keyValue("API URL", config.config.api_url);
    }
    if (!config?.config?.project) {
      console.log(chalk.dim("  No project configured. Run `remb init` to set up."));
    }
  });
