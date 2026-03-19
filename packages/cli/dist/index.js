#!/usr/bin/env node

// src/index.ts
import { Command as Command14 } from "commander";
import chalk16 from "chalk";

// src/commands/login.ts
import { Command } from "commander";
import chalk3 from "chalk";

// src/lib/credentials.ts
import { resolve } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { homedir } from "os";
function getCredentialsDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || resolve(homedir(), ".config");
  return resolve(base, "remb");
}
function getCredentialsPath() {
  return resolve(getCredentialsDir(), "credentials");
}
function getApiKey() {
  const envKey = process.env.REMB_API_KEY;
  if (envKey) {
    if (!isValidKeyFormat(envKey)) {
      process.stderr.write("Warning: REMB_API_KEY has an unexpected format (expected remb_ prefix, \u226520 chars)\n");
    }
    return envKey;
  }
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
function saveApiKey(apiKey) {
  if (!isValidKeyFormat(apiKey)) {
    throw new Error("Invalid API key format. Keys must start with remb_ and be at least 20 characters.");
  }
  const dir = getCredentialsDir();
  mkdirSync(dir, { recursive: true });
  const path = getCredentialsPath();
  const content = `# Remb API credentials
# Keep this file secret \u2014 do not commit to version control
api_key=${apiKey}
`;
  writeFileSync(path, content, { encoding: "utf-8", mode: 384 });
  try {
    chmodSync(path, 384);
  } catch {
  }
  return path;
}
function clearApiKey() {
  const path = getCredentialsPath();
  if (!existsSync(path)) return false;
  writeFileSync(path, "", { encoding: "utf-8", mode: 384 });
  return true;
}
function getCredentialsFilePath() {
  return getCredentialsPath();
}
function isValidKeyFormat(key) {
  return key.startsWith("remb_") && key.length >= 20;
}

// src/lib/output.ts
import chalk from "chalk";
function formatEntries(entries, format) {
  if (entries.length === 0) {
    return chalk.dim("No entries found.");
  }
  switch (format) {
    case "json":
      return JSON.stringify(entries, null, 2);
    case "markdown":
      return formatMarkdown(entries);
    case "table":
    default:
      return formatTable(entries);
  }
}
function formatTable(entries) {
  const lines = [];
  const cols = {
    feature: "FEATURE",
    type: "TYPE",
    source: "SOURCE",
    date: "DATE",
    content: "CONTENT"
  };
  const w = {
    feature: Math.max(
      cols.feature.length,
      ...entries.map((e) => e.feature.length)
    ),
    type: Math.max(cols.type.length, ...entries.map((e) => e.entry_type.length)),
    source: Math.max(
      cols.source.length,
      ...entries.map((e) => e.source.length)
    ),
    date: 10
    // YYYY-MM-DD
  };
  const header = [
    chalk.bold(cols.feature.padEnd(w.feature)),
    chalk.bold(cols.type.padEnd(w.type)),
    chalk.bold(cols.source.padEnd(w.source)),
    chalk.bold(cols.date.padEnd(w.date)),
    chalk.bold(cols.content)
  ].join("  ");
  lines.push(header);
  lines.push(chalk.dim("\u2500".repeat(Math.min(process.stdout.columns || 100, 120))));
  for (const entry of entries) {
    const date = entry.created_at.slice(0, 10);
    const preview = entry.content.length > 60 ? entry.content.slice(0, 57) + "..." : entry.content;
    lines.push(
      [
        chalk.cyan(entry.feature.padEnd(w.feature)),
        chalk.yellow(entry.entry_type.padEnd(w.type)),
        entry.source.padEnd(w.source),
        chalk.dim(date.padEnd(w.date)),
        preview.replace(/\n/g, " ")
      ].join("  ")
    );
  }
  return lines.join("\n");
}
function formatMarkdown(entries) {
  const lines = [];
  let currentFeature = "";
  for (const entry of entries) {
    if (entry.feature !== currentFeature) {
      if (currentFeature) lines.push("");
      lines.push(`## ${entry.feature}`);
      currentFeature = entry.feature;
    }
    const date = entry.created_at.slice(0, 10);
    lines.push("");
    lines.push(
      `> **${entry.entry_type}** \xB7 ${entry.source} \xB7 ${date}`
    );
    lines.push("");
    lines.push(entry.content);
  }
  return lines.join("\n");
}
function success(msg) {
  console.log(`${chalk.green("\u2714")} ${msg}`);
}
function error2(msg) {
  console.error(`${chalk.red("\u2716")} ${msg}`);
}
function warn(msg) {
  console.log(`${chalk.yellow("!")} ${msg}`);
}
function info(msg) {
  console.log(`${chalk.blue("\u2139")} ${msg}`);
}
function keyValue(label, value) {
  console.log(`  ${chalk.dim(label + ":")} ${value}`);
}

// src/lib/config.ts
import { resolve as resolve2, dirname as dirname2 } from "path";
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
var CONFIG_FILENAME = ".remb.yml";
var DEFAULT_API_URL = "https://www.useremb.com";
function findProjectConfig(cwd = process.cwd()) {
  let dir = resolve2(cwd);
  while (true) {
    const candidate = resolve2(dir, CONFIG_FILENAME);
    if (existsSync2(candidate)) {
      const raw = readFileSync2(candidate, "utf-8");
      const parsed = parseSimpleYaml(raw);
      return {
        config: {
          project: parsed.project ?? "",
          api_url: parsed.api_url ?? DEFAULT_API_URL,
          ide: parsed.ide || void 0
        },
        dir
      };
    }
    const parent = dirname2(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function writeProjectConfig(dir, config) {
  const filePath = resolve2(dir, CONFIG_FILENAME);
  const lines = [
    "# Remb project configuration",
    `# Generated by remb init`,
    "",
    `project: ${config.project}`,
    `api_url: ${config.api_url}`
  ];
  if (config.ide) lines.push(`ide: ${config.ide}`);
  lines.push("");
  const content = lines.join("\n");
  mkdirSync2(dir, { recursive: true });
  writeFileSync2(filePath, content, "utf-8");
  return filePath;
}
function parseSimpleYaml(raw) {
  const result = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

// src/lib/shared.ts
import chalk2 from "chalk";

// src/lib/api-client.ts
var ApiError = class extends Error {
  constructor(statusCode, message, body) {
    super(message);
    this.statusCode = statusCode;
    this.body = body;
    this.name = "ApiError";
  }
};
var MAX_RETRIES = 3;
var REQUEST_TIMEOUT_MS = 3e4;
var RETRY_BACKOFF = [1e3, 2e3, 4e3];
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function createApiClient(opts = {}) {
  const apiKey = opts.apiKey ?? getApiKey();
  if (!apiKey) {
    throw new Error(
      "No API key found. Run `remb login` or set REMB_API_KEY."
    );
  }
  const projectConfig = findProjectConfig();
  const baseUrl = (opts.apiUrl ?? projectConfig?.config.api_url ?? "http://localhost:3000").replace(/\/+$/, "");
  async function request(method, path, body, searchParams) {
    let url = `${baseUrl}${path}`;
    if (searchParams) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== void 0 && v !== null && v !== "") {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "remb-cli/0.1.0"
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    const jsonBody = body ? JSON.stringify(body) : void 0;
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS
        );
        const res = await fetch(url, {
          method,
          headers,
          body: jsonBody,
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1e3 || 5e3 : 5e3;
          await sleep(Math.min(waitMs, 3e4));
          continue;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.error ?? `HTTP ${res.status} ${res.statusText}`;
          throw new ApiError(res.status, msg, data);
        }
        return data;
      } catch (err) {
        lastError = err;
        if (err instanceof ApiError && err.statusCode < 500) {
          throw err;
        }
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF[attempt] ?? 4e3);
          continue;
        }
      }
    }
    throw lastError;
  }
  return {
    /** POST /api/cli/context/save */
    saveContext(params) {
      return request(
        "POST",
        "/api/cli/context/save",
        params
      );
    },
    /** GET /api/cli/context/get */
    getContext(params) {
      const searchParams = {
        projectSlug: params.projectSlug
      };
      if (params.featureName) searchParams.featureName = params.featureName;
      if (params.limit) searchParams.limit = String(params.limit);
      return request("GET", "/api/cli/context/get", void 0, searchParams);
    },
    /** POST /api/cli/context/save — batch variant for scan results */
    saveBatch(projectSlug, entries, onProgress) {
      const BATCH_SIZE = 5;
      const results = [];
      const run = async () => {
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const chunk = entries.slice(i, i + BATCH_SIZE);
          const chunkResults = await Promise.all(
            chunk.map(
              (entry) => request(
                "POST",
                "/api/cli/context/save",
                { projectSlug, ...entry }
              )
            )
          );
          results.push(...chunkResults);
          onProgress?.(results.length, entries.length);
        }
        return results;
      };
      return run();
    },
    /** Raw request for future endpoints */
    request,
    /** GET /api/cli/context/bundle — full project context for agents */
    bundleContext(projectSlug) {
      return request("GET", "/api/cli/context/bundle", void 0, { projectSlug });
    },
    /** POST /api/cli/context/diff — analyze local git diff */
    saveDiff(params) {
      return request("POST", "/api/cli/context/diff", params);
    },
    /** GET /api/cli/memory */
    listMemories(params) {
      const searchParams = {};
      if (params?.tier) searchParams.tier = params.tier;
      if (params?.category) searchParams.category = params.category;
      if (params?.project) searchParams.project = params.project;
      if (params?.search) searchParams.search = params.search;
      if (params?.limit) searchParams.limit = String(params.limit);
      return request("GET", "/api/cli/memory", void 0, searchParams);
    },
    /** POST /api/cli/memory */
    createMemory(params) {
      return request("POST", "/api/cli/memory", params);
    },
    /** PATCH /api/cli/memory/:id */
    updateMemory(id, params) {
      return request("PATCH", `/api/cli/memory/${id}`, params);
    },
    /** DELETE /api/cli/memory/:id */
    deleteMemory(id) {
      return request(
        "DELETE",
        `/api/cli/memory/${id}`
      );
    },
    /** GET /api/cli/projects */
    listProjects(params) {
      const searchParams = {};
      if (params?.status) searchParams.status = params.status;
      if (params?.limit) searchParams.limit = String(params.limit);
      return request("GET", "/api/cli/projects", void 0, searchParams);
    },
    /** POST /api/cli/projects — create/register a project */
    createProject(params) {
      return request("POST", "/api/cli/projects", params);
    },
    /** POST /api/cli/scan — trigger a server-side scan */
    triggerScan(projectSlug) {
      return request("POST", "/api/cli/scan", { projectSlug });
    },
    /** GET /api/cli/scan?scanId=<id> — poll scan progress */
    getScanStatus(scanId) {
      return request("GET", "/api/cli/scan", void 0, { scanId });
    },
    /** GET /api/cli/conversations — fetch conversation history */
    getConversationHistory(params = {}) {
      const search = {};
      if (params.projectSlug) search.projectSlug = params.projectSlug;
      if (params.startDate) search.startDate = params.startDate;
      if (params.endDate) search.endDate = params.endDate;
      if (params.limit) search.limit = String(params.limit);
      if (params.format) search.format = params.format;
      return request("GET", "/api/cli/conversations", void 0, search);
    },
    /** POST /api/cli/conversations — log a conversation entry */
    logConversation(params) {
      return request("POST", "/api/cli/conversations", params);
    },
    /** GET /api/cli/conversations/search — semantic search conversation history */
    searchConversations(params) {
      const search = { q: params.query };
      if (params.projectSlug) search.projectSlug = params.projectSlug;
      if (params.tags?.length) search.tags = params.tags.join(",");
      if (params.limit) search.limit = String(params.limit);
      return request("GET", "/api/cli/conversations/search", void 0, search);
    }
  };
}

// src/lib/shared.ts
function resolveProject(flag) {
  if (flag) return flag;
  const config = findProjectConfig();
  if (config?.config.project) return config.config.project;
  error2(
    `No project specified. Use ${chalk2.bold("-p <slug>")} or run ${chalk2.bold("remb init")} in your project directory.`
  );
  process.exit(1);
}
function handleError(err) {
  if (err instanceof ApiError) {
    switch (err.statusCode) {
      case 401:
        error2(
          `Authentication failed. Run ${chalk2.bold("remb login")} to re-authenticate.`
        );
        break;
      case 403:
        error2("Permission denied. Check your project access.");
        break;
      case 404:
        error2("Not found. Check the project slug or resource ID.");
        break;
      case 409:
        error2(err.message || "Conflict \u2014 the resource already exists.");
        break;
      case 429:
        error2("Rate limited. Wait a moment and try again.");
        break;
      default:
        if (err.statusCode >= 500) {
          error2(
            `Server error \u2014 try again later. ${chalk2.dim(`(HTTP ${err.statusCode})`)}`
          );
        } else {
          error2(
            `${err.message} ${chalk2.dim(`(HTTP ${err.statusCode})`)}`
          );
        }
    }
  } else if (err instanceof TypeError && err.message.includes("fetch")) {
    error2(
      "Could not reach Remb. Check your internet connection."
    );
  } else if (err instanceof Error) {
    error2(err.message);
  } else {
    error2("An unexpected error occurred.");
  }
  process.exit(1);
}
async function confirmAction(message) {
  if (!process.stdin.isTTY) return false;
  process.stdout.write(`${message} ${chalk2.dim("[y/N]")}: `);
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    break;
  }
  const answer = Buffer.concat(chunks).toString("utf-8").trim().toLowerCase();
  return answer === "y" || answer === "yes";
}
function validateContentSize(content, maxKB = 50) {
  const sizeKB = Buffer.byteLength(content, "utf-8") / 1024;
  if (sizeKB > maxKB) {
    error2(
      `Content is too large (${Math.round(sizeKB)}KB). Maximum is ${maxKB}KB.`
    );
    process.exit(1);
  }
}
function validateStringLength(value, field, maxLen) {
  if (!value || value.trim().length === 0) {
    error2(`${field} cannot be empty.`);
    process.exit(1);
  }
  if (value.length > maxLen) {
    error2(
      `${field} is too long (${value.length} chars). Maximum is ${maxLen}.`
    );
    process.exit(1);
  }
}
function validateEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    error2(
      `Invalid ${field} "${value}". Choose: ${allowed.join(", ")}`
    );
    process.exit(1);
  }
}
function validateUUID(value, field) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    error2(`Invalid ${field}. Expected a UUID (e.g. 12345678-abcd-...).`);
    process.exit(1);
  }
}
function validateDateFormat(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    error2(
      `Invalid ${field} "${value}". Expected format: YYYY-MM-DD`
    );
    process.exit(1);
  }
}
function validatePositiveInt(value, field, max) {
  if (!Number.isFinite(value) || value < 1) {
    error2(`${field} must be a positive integer.`);
    process.exit(1);
  }
  if (max && value > max) {
    error2(`${field} cannot exceed ${max}.`);
    process.exit(1);
  }
}

// src/commands/login.ts
var DEFAULT_API_URL2 = "https://www.useremb.com";
function getBaseUrl() {
  const projectConfig = findProjectConfig();
  return (projectConfig?.config.api_url ?? DEFAULT_API_URL2).replace(/\/+$/, "");
}
async function openBrowser(url) {
  const { exec } = await import("child_process");
  const { platform } = await import("os");
  const os = platform();
  const cmd = os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}
async function pollForToken(baseUrl, state, timeoutMs = 12e4) {
  const deadline = Date.now() + timeoutMs;
  const interval = 2e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(`${baseUrl}/api/cli/auth/poll?state=${encodeURIComponent(state)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === "completed" && data.apiKey) {
        return { apiKey: data.apiKey, login: data.login };
      }
      if (data.status === "expired") {
        return null;
      }
    } catch {
    }
  }
  return null;
}
var loginCommand = new Command("login").description("Authenticate the CLI via browser OAuth or manual API key").option("--key <api-key>", "Authenticate with an API key directly").addHelpText(
  "after",
  `
Examples:
  $ remb login
  $ remb login --key remb_abc123...
  $ echo $REMB_KEY | remb login`
).action(async (opts) => {
  if (opts.key) {
    return saveAndConfirm(opts.key);
  }
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return saveAndConfirm(Buffer.concat(chunks).toString("utf-8").trim());
  }
  console.log();
  console.log(chalk3.bold("  How would you like to authenticate?"));
  console.log();
  console.log(`  ${chalk3.cyan("1)")} Sign in with GitHub ${chalk3.dim("(opens browser)")}`);
  console.log(`  ${chalk3.cyan("2)")} Paste an API key manually`);
  console.log();
  process.stdout.write(`  ${chalk3.bold("Choice")} ${chalk3.dim("[1/2]")}: `);
  const choice = await readLine();
  if (choice === "2") {
    process.stdout.write(
      `  ${chalk3.bold("Paste your API key")} ${chalk3.dim("(from Dashboard \u2192 Settings \u2192 API Keys)")}: `
    );
    const key = await readLine();
    return saveAndConfirm(key);
  }
  console.log();
  info("Starting browser login...");
  const baseUrl = getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/cli/auth/start`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      error2(`Failed to start login: ${body.error ?? res.statusText}`);
      process.exit(1);
    }
    const { state, authUrl } = await res.json();
    console.log();
    info(`Opening browser to authenticate...`);
    console.log(chalk3.dim(`  If the browser doesn't open, visit:`));
    console.log(chalk3.dim(`  ${authUrl}`));
    console.log();
    await openBrowser(authUrl);
    const ora11 = (await import("ora")).default;
    const spinner = ora11("Waiting for browser authentication...").start();
    const result = await pollForToken(baseUrl, state);
    if (!result) {
      spinner.fail("Login timed out or was cancelled.");
      console.log();
      info(`You can also login manually: ${chalk3.bold("remb login --key <api-key>")}`);
      process.exit(1);
    }
    spinner.stop();
    const path = saveApiKey(result.apiKey);
    console.log();
    success(`Authenticated${result.login ? ` as ${chalk3.bold(result.login)}` : ""}!`);
    keyValue("Location", path);
    keyValue("Preview", `remb_...${result.apiKey.slice(-4)}`);
    console.log();
    info(`Run ${chalk3.bold("remb get -p <project>")} to verify your key works.`);
  } catch (err) {
    error2(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
    console.log();
    info(`You can also login manually: ${chalk3.bold("remb login --key <api-key>")}`);
    process.exit(1);
  }
});
function saveAndConfirm(key) {
  if (!key) {
    error2("No API key provided.");
    process.exit(1);
  }
  if (!key.startsWith("remb_")) {
    error2(
      `Invalid key format. Remb keys start with ${chalk3.bold("remb_")}`
    );
    process.exit(1);
  }
  if (key.length < 20) {
    error2("API key is too short. Check that you copied the full key.");
    process.exit(1);
  }
  const path = saveApiKey(key);
  console.log();
  success("API key saved successfully!");
  keyValue("Location", path);
  keyValue("Preview", `remb_...${key.slice(-4)}`);
  console.log();
  info(
    `Run ${chalk3.bold("remb get -p <project>")} to verify your key works.`
  );
}
async function readLine() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    break;
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}
var logoutCommand = new Command("logout").description("Remove stored API credentials").option("-f, --force", "Skip confirmation prompt").addHelpText(
  "after",
  `
Examples:
  $ remb logout
  $ remb logout --force`
).action(async (opts) => {
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
var whoamiCommand = new Command("whoami").description("Show current authentication status").addHelpText(
  "after",
  `
Examples:
  $ remb whoami`
).action(() => {
  const key = getApiKey();
  if (!key) {
    error2("Not authenticated. Run `remb login` to set up.");
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
    console.log(chalk3.dim("  No project configured. Run `remb init` to set up."));
  }
});

// src/commands/init.ts
import { Command as Command2 } from "commander";
import { resolve as resolve3, basename } from "path";
import { existsSync as existsSync3, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3 } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";
import chalk4 from "chalk";
function generateAgentMd(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management

> This file was generated by \`remb init\`. It documents the Remb CLI so your AI coding assistant knows how to use it.

## Project

- **Slug**: \`${slug}\`
- **API**: \`${apiUrl}\`
- **Config**: \`.remb.yml\` (committed, no secrets)

## What is Remb?

Remb is a persistent memory and context layer for AI coding sessions. It lets you save, retrieve, and scan project context \u2014 features, architecture decisions, code patterns \u2014 so AI assistants have deep project knowledge across sessions.

## Authentication

The user must be logged in before any command works (except \`init\`).

\`\`\`sh
remb login              # Opens browser OAuth flow
remb login --key <key>  # Direct API key auth
remb whoami             # Check current identity
remb logout             # Clear credentials
\`\`\`

Credentials are stored in \`~/.config/remb/credentials.json\` (never in the repo).

## Commands Reference

### remb init
Initialize a project \u2014 creates local config, generates this AI reference doc, and registers the project on the Remb server (if logged in).

\`\`\`sh
remb init                      # Init with directory name as project slug
remb init my-app               # Init with specific name
remb init --force              # Re-initialize (overwrites config + REMB.md)
\`\`\`

**What it does**:
1. Creates \`.remb.yml\` (project config)
2. Generates \`REMB.md\` (this file \u2014 AI agent reference)
3. Auto-detects git remote URL, repo name, and branch
4. Registers the project on the Remb server (if authenticated)

If not logged in, run \`remb login\` first, then \`remb init --force\` to register.

### remb push
Trigger a cloud scan to update project context after pushing code. Shows live progress with percentage and per-file status in the terminal.

\`\`\`sh
remb push                      # Scan current project (with live progress)
remb push -p <slug>            # Scan specific project
remb push --force              # Skip git pre-flight checks
remb push --no-progress        # Fire and forget (don't wait for results)
\`\`\`

**Pre-flight checks**: Verifies you're in a git repo, warns about uncommitted changes, checks if local is ahead of remote.

**Live progress**: After triggering, polls for scan status and displays a progress bar. During high load, scans queue; the status will show \`queued\` before it turns \`running\`. The CLI waits and shows progress regardless.

**Returns**: \`started\` | \`already_running\` | \`up_to_date\` | \`queued\`

### remb scan
**Local scan** \u2014 reads files directly from disk in the CLI process, groups them by directory into context entries, and uploads the results to Remb. No git required, no GitHub access needed. Works offline repos, monorepos, and any directory structure.

> **Local vs cloud**: \`remb scan\` runs entirely on your machine and uploads results immediately. \`remb push\` triggers a server-side scan that reads from GitHub \u2014 it requires committed + pushed changes and a connected GitHub repo.

\`\`\`sh
remb scan                           # Scan current directory (all subdirs)
remb scan --path src/               # Scan a specific subdirectory
remb scan -p <slug> --path src/     # Scan with explicit project slug
remb scan --depth 3                 # Limit recursion depth (default: 5)
remb scan --dry-run                 # Preview features without saving
remb scan --ignore "tests,dist"     # Skip directories by name
\`\`\`

**What it does**:
1. Walks the target directory (respecting \`--depth\` and \`--ignore\`)
2. Groups source files by directory \u2014 each directory becomes one context entry (feature)
3. Shows a preview: feature name, detected tags, content size in KB
4. Uploads all entries via \`saveBatch\` with a progress counter

**Preview output** (before saving):
\`\`\`
Found 84 source files across 12 directories.

  \u25CF app/api \u2014 typescript, backend \u2014 4.2KB
  \u25CF components/dashboard \u2014 typescript, react \u2014 11.8KB
  \u25CF lib \u2014 typescript, utilities \u2014 6.1KB
  ...

Saving context entries... 8/12
\u2713 Uploaded 12 context entries to my-app
\`\`\`

**When to use \`remb scan\` vs \`remb push\`**:
| Scenario | Use |
|---|---|
| No git remote / not on GitHub | \`remb scan\` |
| First-time setup, no commits yet | \`remb scan\` |
| Monorepo with multiple sub-projects | \`remb scan --path packages/my-pkg\` |
| After pushing commits to GitHub | \`remb push\` |
| Want AI-powered per-file analysis | \`remb push\` |

### remb save
Save a context entry for a feature.

\`\`\`sh
remb save -f "auth-flow" -c "Uses NextAuth with GitHub OAuth..."
remb save -f "db-schema" -c "PostgreSQL via Supabase with RLS..." -t "database,security"
remb save -f "api-design" --type architecture -c "REST API with..."
\`\`\`

**Options**: \`-f/--feature\` (required), \`-c/--content\` (required), \`-p/--project\`, \`-t/--tags\`, \`--type\`

### remb get
Retrieve saved context entries.

\`\`\`sh
remb get                           # All entries for project
remb get -f "auth-flow"            # Entries for specific feature
remb get -l 10 --format json       # Limit and format output
remb get --format markdown         # Markdown output
\`\`\`

**Formats**: \`table\` (default), \`json\`, \`markdown\`

### remb context
Download the full project context bundle as a single markdown document.

\`\`\`sh
remb context                       # Print to stdout
remb context -o context.md         # Write to file
remb context --json                # JSON format
\`\`\`

This is ideal for feeding full project knowledge into an AI assistant.

### remb diff
Analyze uncommitted git changes and save as context.

\`\`\`sh
remb diff                          # Unstaged changes
remb diff --staged                 # Staged changes only
remb diff --all                    # All changes (staged + unstaged)
\`\`\`

### remb memory
Manage persistent AI memories. Memories have two scopes:
- **Project-scoped** \u2014 linked to a specific project (relevant to that codebase only)
- **Global** \u2014 no project scope (project_id is null) \u2014 apply across ALL projects

\`\`\`sh
remb memory add -t "Title" -c "Content..." --tier core --category architecture
remb memory add -t "Title" -c "Content..." --project my-app  # project-scoped memory
remb memory list                       # All memories (shows [project] or [global] badge)
remb memory list --project my-app      # Project memories + global memories
remb memory list --global              # Only global memories
remb memory list --tier core -s "auth" # Search core-tier memories
remb memory update <id> -c "Updated content..."
remb memory delete <id>
remb memory promote <id> --to core     # Promote to core tier
\`\`\`

**Tiers**: \`core\` (always loaded), \`active\` (session-relevant), \`archive\` (historical)

### remb link
Create dependency relationships between features.

\`\`\`sh
remb link --from "auth-flow" --to "user-profile" --type depends_on
\`\`\`

**Types**: \`depends_on\`, \`extends\`, \`uses\`

### remb projects
List and manage projects. Switch the active project for the current workspace.

\`\`\`sh
remb projects list                           # List all projects
remb projects list --status active           # Filter by status
remb projects list --format json             # JSON output
remb projects use my-app                     # Set active project (writes .remb.yml)
remb projects switch my-app                  # Same as use
\`\`\`

**remb projects use <slug>** looks up the project on the server, confirms it exists, then writes \`.remb.yml\` in the current directory. All subsequent commands will use the new project.

### remb serve
Start a local MCP server for direct AI tool integration (stdio transport).

\`\`\`sh
remb serve                         # Serve current project
remb serve --project <slug>        # Serve specific project
\`\`\`

**Exposed MCP tools**:

Context & scanning:
- \`save_context\` \u2014 persist knowledge about a feature
- \`get_context\` \u2014 recall entries (with optional feature filter)
- \`load_project_context\` \u2014 full project bundle as markdown
- \`analyze_diff\` \u2014 AI-analyze uncommitted git changes

Memory management:
- \`memory_list\` \u2014 list memories; pass \`projectSlug\` to get project + global memories
- \`memory_create\` \u2014 create a memory (omit \`projectSlug\` for global scope)
- \`memory_update\` \u2014 update title, content, tier, category, or tags
- \`memory_delete\` \u2014 delete a memory by ID
- \`memory_promote\` \u2014 change a memory's tier

Conversation tracking:
- \`conversation_log\` \u2014 record what was discussed/accomplished (call after completing work)
- \`conversation_history\` \u2014 load prior session history (call at session start)

### remb history
View conversation history \u2014 see what AI discussed and did across sessions.

\`\`\`sh
remb history                           # Last 20 entries as timeline
remb history --date 2025-03-15         # Single day
remb history --from 2025-03-01 --to 2025-03-15  # Date range
remb history --limit 50                # More entries
remb history --format markdown         # Markdown output
remb history --format json             # Raw JSON
remb history -p <slug>                 # Filter by project
\`\`\`

**MCP tools** (available when connected via \`remb serve\` or the hosted MCP endpoint):
- \`conversation_log\` \u2014 record what you discussed or accomplished (call after completing work)
- \`conversation_history\` \u2014 load recent conversation history (call at session start to catch up)

## Step-by-Step Workflows

Follow these workflows in order. Each numbered step must complete before proceeding to the next.

### 1. First-time project setup

1. **Authenticate** \u2014 \`remb login\` (opens browser OAuth or use \`--key <key>\`)
2. **Initialize** \u2014 \`remb init\` (creates \`.remb.yml\`, generates \`REMB.md\`, registers project on server)
3. **First scan** \u2014 \`remb push\` (triggers cloud scan, shows live progress until complete)
4. **Verify** \u2014 \`remb projects list\` (confirm project appears with \`active\` status)

### 2. Update context after code changes

1. **Commit & push** \u2014 \`git add . && git commit -m "feat: ..." && git push\`
2. **Trigger scan** \u2014 \`remb push\` (detects new commits, runs cloud scan with progress)
3. **Wait for completion** \u2014 the CLI shows a progress bar; wait for \`Scan complete\` message

### 3. Save knowledge manually

1. **Save a feature** \u2014 \`remb save -f "feature-name" -c "Description..."\`
2. **Verify** \u2014 \`remb get -f "feature-name"\` (confirm entry was stored)

### 4. Load full context into AI session

1. **Bundle context** \u2014 \`remb context -o CONTEXT.md\`
2. **Feed to AI** \u2014 provide the generated \`CONTEXT.md\` file to your AI assistant

### 5. Analyze local changes before committing

1. **Make edits** \u2014 modify source files as needed
2. **Diff analysis** \u2014 \`remb diff --all\` (analyzes all staged + unstaged changes)
3. **Review** \u2014 check the generated context entries summarizing your changes

### 6. Local scan (no git / no GitHub required)

Use this when the repo isn't on GitHub, has no git remote, or you want to scan a specific subdirectory.

1. **Preview first** \u2014 \`remb scan --dry-run\` (see what directories will be scanned, no upload)
2. **Full scan** \u2014 \`remb scan\` (uploads all directory-grouped context entries)
3. **Verify** \u2014 \`remb get\` (confirm entries appear in the project)
4. **Targeted scan** \u2014 \`remb scan --path src/ --depth 3\` to narrow the scope

## MCP Integration

Add Remb as an MCP server in your IDE for direct AI tool access:

**Cursor / VS Code** (\`.cursor/mcp.json\` or \`.vscode/mcp.json\`):
\`\`\`json
{
  "mcpServers": {
    "remb": {
      "command": "remb",
      "args": ["serve"]
    }
  }
}
\`\`\`

Or connect to the hosted endpoint at \`${apiUrl}/api/mcp\` for aggregated MCP access with all your connected servers.

## Exit Codes

- \`0\` \u2014 Success
- \`1\` \u2014 Error (auth failure, network error, validation error)

All commands respect the \`-p/--project <slug>\` flag or fall back to \`.remb.yml\` in the current directory tree.
`;
}
var initCommand = new Command2("init").description("Initialize a project with remb tracking").argument("[project-name]", "Project name (defaults to directory name)").option("--api-url <url>", "API server URL", "https://www.useremb.com").option("--force", "Overwrite existing configuration", false).option(
  "--ide <ide>",
  "IDE to configure (vscode, cursor, windsurf, cline, jetbrains, claude, aider, all)"
).action(async (projectName, opts) => {
  const cwd = process.cwd();
  const name = projectName ?? basename(cwd);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    error2("Invalid project name \u2014 must contain at least one alphanumeric character.");
    process.exit(1);
  }
  const existing = findProjectConfig(cwd);
  if (existing && !opts.force) {
    warn(`Already initialized at ${chalk4.dim(existing.dir + "/.remb.yml")}`);
    info(`Use ${chalk4.bold("--force")} to overwrite.`);
    return;
  }
  const ide = await resolveIde(opts.ide, existing?.config.ide);
  const filePath = writeProjectConfig(cwd, {
    project: slug,
    api_url: opts.apiUrl,
    ide
  });
  const agentMdPath = resolve3(cwd, "REMB.md");
  writeFileSync3(agentMdPath, generateAgentMd(slug, opts.apiUrl), "utf-8");
  console.log();
  success(`Project ${chalk4.bold(slug)} initialized!`);
  keyValue("Config", filePath);
  keyValue("Agent docs", agentMdPath);
  keyValue("Project", slug);
  keyValue("API URL", opts.apiUrl);
  keyValue("IDE", ide);
  console.log();
  let apiKey = getApiKey();
  if (!apiKey && process.stdout.isTTY) {
    console.log(
      chalk4.dim("  You're not signed in \u2014 signing in lets Remb register your project and sync context.")
    );
    const shouldLogin = await promptYesNo("  Sign in now?");
    if (shouldLogin) {
      apiKey = await runInlineLogin(opts.apiUrl);
    }
  }
  if (apiKey) {
    try {
      let repoUrl;
      let repoName;
      let branch;
      try {
        repoUrl = execSync("git remote get-url origin", { cwd, encoding: "utf-8" }).trim();
        const match = repoUrl.match(/[/:]([-\w.]+\/[-\w.]+?)(?:\.git)?$/);
        if (match) repoName = match[1];
        branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
      } catch {
      }
      const client = createApiClient({ apiUrl: opts.apiUrl, apiKey });
      const { project } = await client.createProject({
        name: slug,
        repoUrl,
        repoName,
        branch
      });
      success(`Project registered on Remb ${chalk4.dim(`(${project.slug})`)}`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        info(`Project ${chalk4.bold(slug)} already exists on server \u2014 linked.`);
      } else {
        warn(`Could not register project on server: ${err instanceof Error ? err.message : "unknown error"}`);
        info(`You can register it later from the dashboard.`);
      }
    }
  } else if (!getApiKey()) {
    info(`Run ${chalk4.bold("remb login")} to register this project on the server.`);
  }
  const gitignorePath = resolve3(cwd, ".gitignore");
  if (existsSync3(gitignorePath)) {
    info(
      `${chalk4.dim("Tip:")} .remb.yml and REMB.md are safe to commit \u2014 they contain no secrets.`
    );
  }
  const injected = injectIntoIDEContextFiles(cwd, slug, opts.apiUrl, ide);
  if (injected.length > 0) {
    info(`AI context injected into: ${injected.map((p) => chalk4.dim(p)).join(", ")}`);
  }
  info(
    `${chalk4.bold("REMB.md")} generated \u2014 your IDE's AI agent can read it to learn all Remb commands.`
  );
});
function injectIntoIDEContextFiles(cwd, slug, apiUrl, ide) {
  const START_MARKER = "<!-- remb:start -->";
  const END_MARKER = "<!-- remb:end -->";
  const all = ide === "all";
  const is = (name) => all || ide === name;
  const targets = [
    {
      path: resolve3(cwd, ".github", "copilot-instructions.md"),
      label: ".github/copilot-instructions.md",
      content: generateCopilotInstructions(slug, apiUrl),
      enabled: is("vscode")
    },
    {
      path: resolve3(cwd, ".cursor", "rules", "remb.mdc"),
      label: ".cursor/rules/remb.mdc",
      content: generateCursorRules(slug, apiUrl),
      enabled: is("cursor")
    },
    {
      path: resolve3(cwd, ".windsurfrules"),
      label: ".windsurfrules",
      content: generateWindsurfRules(slug, apiUrl),
      enabled: is("windsurf")
    },
    {
      path: resolve3(cwd, ".clinerules"),
      label: ".clinerules",
      content: generateClineRules(slug, apiUrl),
      enabled: is("cline")
    },
    {
      path: resolve3(cwd, ".junie", "guidelines.md"),
      label: ".junie/guidelines.md",
      content: generateJetBrainsPrompt(slug, apiUrl),
      enabled: is("jetbrains")
    },
    {
      path: resolve3(cwd, "CLAUDE.md"),
      label: "CLAUDE.md",
      content: generateClaudeMd(slug, apiUrl),
      enabled: is("claude")
    },
    {
      path: resolve3(cwd, ".aider.conf.yml"),
      label: ".aider.conf.yml",
      content: generateAiderConfig(slug, apiUrl),
      enabled: is("aider")
    },
    {
      path: resolve3(cwd, ".github", "instructions", "remb-session.instructions.md"),
      label: ".github/instructions/remb-session.instructions.md",
      content: generateInstructionsMd(slug, apiUrl),
      enabled: is("vscode"),
      fileHeader: "---\napplyTo: '**'\n---"
    }
  ];
  const injected = [];
  for (const target of targets) {
    if (!target.enabled) continue;
    try {
      const dir = resolve3(target.path, "..");
      if (!existsSync3(dir)) {
        mkdirSync3(dir, { recursive: true });
      }
      const block = `${START_MARKER}
${target.content}
${END_MARKER}`;
      const header = target.fileHeader ? target.fileHeader + "\n\n" : "";
      if (existsSync3(target.path)) {
        const existing = readFileSync3(target.path, "utf-8");
        const startIdx = existing.indexOf(START_MARKER);
        const endIdx = existing.indexOf(END_MARKER);
        if (startIdx !== -1 && endIdx !== -1) {
          const updated = existing.slice(0, startIdx) + block + existing.slice(endIdx + END_MARKER.length);
          writeFileSync3(target.path, updated);
        } else if (target.fileHeader) {
          writeFileSync3(target.path, header + block + "\n");
        } else {
          writeFileSync3(target.path, existing.trimEnd() + "\n\n" + block + "\n");
        }
      } else {
        writeFileSync3(target.path, header + block + "\n");
      }
      injected.push(target.label);
    } catch {
    }
  }
  const mcpConfig = JSON.stringify({
    mcpServers: {
      remb: { command: "remb", args: ["serve"] }
    }
  }, null, 2);
  if (is("vscode")) {
    const vscMcp = resolve3(cwd, ".vscode", "mcp.json");
    if (!existsSync3(vscMcp)) {
      try {
        mkdirSync3(resolve3(cwd, ".vscode"), { recursive: true });
        writeFileSync3(vscMcp, mcpConfig + "\n");
        injected.push(".vscode/mcp.json");
      } catch {
      }
    }
  }
  if (is("cursor")) {
    const cursorMcp = resolve3(cwd, ".cursor", "mcp.json");
    if (!existsSync3(cursorMcp)) {
      try {
        mkdirSync3(resolve3(cwd, ".cursor"), { recursive: true });
        writeFileSync3(cursorMcp, mcpConfig + "\n");
        injected.push(".cursor/mcp.json");
      } catch {
      }
    }
  }
  return injected;
}
async function promptYesNo(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve6) => {
    rl.question(`${message} ${chalk4.dim("[Y/n]")}: `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve6(a === "" || a === "y" || a === "yes");
    });
  });
}
async function openBrowser2(url) {
  const { exec } = await import("child_process");
  const { platform } = await import("os");
  const os = platform();
  const cmd = os === "darwin" ? "open" : os === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}
async function runInlineLogin(apiUrl) {
  const baseUrl = apiUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${baseUrl}/api/cli/auth/start`, { method: "POST" });
    if (!res.ok) {
      warn("Could not start login flow.");
      return null;
    }
    const { state, authUrl } = await res.json();
    console.log();
    info("Opening browser to authenticate...");
    console.log(chalk4.dim(`  If the browser doesn't open, visit:`));
    console.log(chalk4.dim(`  ${authUrl}`));
    await openBrowser2(authUrl);
    const ora11 = (await import("ora")).default;
    const spinner = ora11("Waiting for browser authentication...").start();
    const deadline = Date.now() + 12e4;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2e3));
      try {
        const poll = await fetch(`${baseUrl}/api/cli/auth/poll?state=${encodeURIComponent(state)}`);
        if (!poll.ok) continue;
        const data = await poll.json();
        if (data.status === "completed" && data.apiKey) {
          spinner.stop();
          const path = saveApiKey(data.apiKey);
          console.log();
          success(`Authenticated${data.login ? ` as ${chalk4.bold(data.login)}` : ""}!`);
          keyValue("Credentials", path);
          console.log();
          return data.apiKey;
        }
        if (data.status === "expired") break;
      } catch {
      }
    }
    spinner.fail("Login timed out.");
    return null;
  } catch {
    warn("Login failed \u2014 you can run `remb login` separately.");
    return null;
  }
}
var VALID_IDES = ["vscode", "cursor", "windsurf", "cline", "jetbrains", "claude", "aider", "all"];
var IDE_LABELS = {
  vscode: "VS Code (GitHub Copilot)",
  cursor: "Cursor",
  windsurf: "Windsurf",
  cline: "Cline",
  jetbrains: "JetBrains AI",
  claude: "Claude Code",
  aider: "Aider",
  all: "All / Multiple IDEs"
};
function detectIde() {
  const env = process.env;
  if (env.TERM_PROGRAM === "vscode" || env.VSCODE_PID) return "vscode";
  if (env.TERM_PROGRAM === "cursor") return "cursor";
  if (env.TERM_PROGRAM?.toLowerCase() === "windsurf") return "windsurf";
  if (env.TERMINAL_EMULATOR?.includes("JetBrains")) return "jetbrains";
  if (env.CLAUDE_CODE === "1" || env.TERM_PROGRAM === "claude") return "claude";
  return null;
}
async function resolveIde(flagValue, configValue) {
  if (flagValue) {
    const normalized = flagValue.toLowerCase();
    if (!VALID_IDES.includes(normalized)) {
      warn(`Unknown IDE "${flagValue}". Valid options: ${VALID_IDES.join(", ")}`);
      warn("Falling back to: all");
      return "all";
    }
    return normalized;
  }
  if (configValue && VALID_IDES.includes(configValue)) {
    return configValue;
  }
  const detected = detectIde();
  if (detected) {
    info(`Detected IDE: ${chalk4.bold(IDE_LABELS[detected])}`);
    return detected;
  }
  if (process.stdout.isTTY) {
    return promptIde();
  }
  return "all";
}
async function promptIde() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const choices = VALID_IDES.map((v, i) => ({ key: String(i + 1), value: v, label: IDE_LABELS[v] }));
  console.log();
  console.log(chalk4.bold("  Which IDE are you using?"));
  console.log();
  for (const c of choices) {
    console.log(`    ${chalk4.dim(c.key + ".")} ${c.label}`);
  }
  console.log();
  return new Promise((resolve6) => {
    rl.question(chalk4.bold("  Enter number: "), (answer) => {
      rl.close();
      const found = choices.find((c) => c.key === answer.trim());
      if (!found) {
        console.log(chalk4.dim("  No selection \u2014 using: all"));
        resolve6("all");
      } else {
        console.log(chalk4.dim(`  Selected: ${found.label}`));
        resolve6(found.value);
      }
    });
  });
}
function mcpToolReference() {
  return `### Available MCP Tools

**Memory Management:**
- \`remb__memory_list\` \u2014 list memories (filter by tier, category, search)
- \`remb__memory_search\` \u2014 semantic search across all memories
- \`remb__memory_load_context\` \u2014 load all core + active memories as context
- \`remb__memory_create\` \u2014 create a new memory
- \`remb__memory_update\` \u2014 update an existing memory
- \`remb__memory_delete\` \u2014 delete a memory
- \`remb__memory_promote\` \u2014 promote a memory to a higher tier
- \`remb__memory_stats\` \u2014 get memory usage statistics
- \`remb__memory_image_upload\` \u2014 upload an image to memory
- \`remb__memory_image_list\` \u2014 list stored images

**Conversation Tracking:**
- \`remb__conversation_log\` \u2014 record what you discussed or accomplished
- \`remb__conversation_history\` \u2014 load recent conversation history

**Project & Context:**
- \`remb__projects_list\` \u2014 list all projects with feature counts
- \`remb__project_get\` \u2014 get project details, features, and latest scan
- \`remb__context_save\` \u2014 save a context entry for a feature
- \`remb__context_get\` \u2014 retrieve context entries (optional feature filter)
- \`remb__context_bundle\` \u2014 full project context as markdown

**Scanning & Analysis:**
- \`remb__scan_trigger\` \u2014 trigger a cloud scan
- \`remb__scan_status\` \u2014 check scan progress
- \`remb__diff_analyze\` \u2014 analyze a git diff and save extracted changes

**Cross-Project:**
- \`remb__cross_project_search\` \u2014 search across ALL projects for features, context, and memories
- \`remb__context_bundle\` \u2014 also works with other project slugs to load another project's full context
- \`remb__memory_create\` \u2014 create with no project_id to save global preferences that apply everywhere`;
}
function generateCopilotInstructions(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management Rules

## Project: \`${slug}\`
## API: \`${apiUrl}\`

## MANDATORY \u2014 Conversation Tracking

You MUST follow these rules in EVERY session:

1. **Session Start**: Call \`remb__conversation_history\` to load recent history and catch up on prior work.
2. **Load Context**: Call \`remb__memory_load_context\` to load all persistent project memories.
3. **During Work**: Call \`remb__conversation_log\` after completing significant work to record what was done.
4. **Session End**: Call \`remb__conversation_log\` with a summary before the conversation ends.
5. **Save Discoveries**: When you discover important architectural patterns, decisions, or gotchas, call \`remb__memory_create\` to save them.

These calls ensure context persists across sessions. Skipping them causes knowledge loss.

${mcpToolReference()}

## When to Use Each Tool

- **Starting a session** \u2192 \`conversation_history\` + \`memory_load_context\`
- **Need project info** \u2192 \`project_get\` or \`context_bundle\`
- **Saving knowledge** \u2192 \`context_save\` (feature-specific) or \`memory_create\` (cross-cutting)
- **After code changes** \u2192 \`scan_trigger\` to refresh, \`diff_analyze\` for targeted analysis
- **Finishing work** \u2192 \`conversation_log\` with summary of what was accomplished

## Cross-Project Referencing

When the user says "do it like I did in project X" or references another project:

1. Call \`remb__projects_list\` to find available projects
2. Call \`remb__cross_project_search\` with the concept to find matching patterns across all projects
3. Call \`remb__context_bundle\` with the other project's slug to load its full context
4. Apply the patterns from that project to the current work

**Global preferences** \u2014 memories created without a project_id apply to ALL projects. Use \`remb__memory_create\` with category "preference" and no project_id to save cross-project coding standards.`;
}
function generateCursorRules(slug, apiUrl) {
  return `---
description: Remb context management \u2014 mandatory rules for AI sessions
globs: "**"
alwaysApply: true
---

# Remb \u2014 AI Context Management

**Project**: \`${slug}\` | **API**: \`${apiUrl}\`

## MANDATORY Rules

1. At session start, call \`remb__conversation_history\` and \`remb__memory_load_context\`.
2. After completing significant work, call \`remb__conversation_log\` to record it.
3. Before ending the session, call \`remb__conversation_log\` with a final summary.
4. Save important discoveries with \`remb__memory_create\`.

${mcpToolReference()}

## Usage Patterns

| Situation | Tool |
|---|---|
| Starting a session | \`conversation_history\` + \`memory_load_context\` |
| Need project info | \`project_get\` or \`context_bundle\` |
| Saving knowledge | \`context_save\` or \`memory_create\` |
| After code changes | \`scan_trigger\` or \`diff_analyze\` |
| Finishing work | \`conversation_log\` |
| Reference another project | \`cross_project_search\` + \`context_bundle\` |`;
}
function generateWindsurfRules(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management

Project: ${slug} | API: ${apiUrl}

## MANDATORY \u2014 Follow These Every Session

1. Session start \u2192 call \`remb__conversation_history\` and \`remb__memory_load_context\`
2. After significant work \u2192 call \`remb__conversation_log\`
3. Before ending \u2192 call \`remb__conversation_log\` with summary
4. Discoveries \u2192 call \`remb__memory_create\`

${mcpToolReference()}

## Quick Reference

- Starting: conversation_history + memory_load_context
- Project info: project_get or context_bundle
- Save knowledge: context_save (feature) or memory_create (general)
- After changes: scan_trigger or diff_analyze
- Finishing: conversation_log
- Reference another project: cross_project_search + context_bundle`;
}
function generateClineRules(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management

Project: ${slug} | API: ${apiUrl}

## MANDATORY Rules

These rules MUST be followed in every session:

1. ALWAYS call \`remb__conversation_history\` at session start to load prior context.
2. ALWAYS call \`remb__memory_load_context\` at session start to load project memories.
3. ALWAYS call \`remb__conversation_log\` after completing significant work.
4. ALWAYS call \`remb__conversation_log\` before ending the session.
5. Save important patterns/decisions with \`remb__memory_create\`.

${mcpToolReference()}

## Cross-Project

When told "implement it like in project X", use \`cross_project_search\` to find patterns across projects, then \`context_bundle\` with the other project's slug.`;
}
function generateJetBrainsPrompt(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management

**Project**: \`${slug}\`
**API**: \`${apiUrl}\`

## Mandatory Session Rules

1. At session start, call \`remb__conversation_history\` and \`remb__memory_load_context\`.
2. After completing significant work, call \`remb__conversation_log\`.
3. Before ending the session, call \`remb__conversation_log\` with a summary.
4. Save important discoveries with \`remb__memory_create\`.

${mcpToolReference()}

## Usage Guide

- **Starting a session**: Load history and context first
- **Need project info**: Use \`project_get\` or \`context_bundle\`
- **Saving knowledge**: \`context_save\` for features, \`memory_create\` for general patterns
- **After code changes**: \`scan_trigger\` to refresh, \`diff_analyze\` for targeted analysis
- **Finishing work**: Always log a summary with \`conversation_log\`
- **Referencing another project**: Use \`cross_project_search\` to find patterns, then \`context_bundle\` with that project's slug`;
}
function generateInstructionsMd(slug, apiUrl) {
  return `# Remb \u2014 Mandatory Session Protocol

**Project**: \`${slug}\` | **API**: \`${apiUrl}\`

## MANDATORY \u2014 Follow These in EVERY Session

### Session Start (do this FIRST, before anything else)
1. Call \`remb__conversation_history\` \u2014 load what was discussed and done in prior sessions
2. Call \`remb__memory_load_context\` \u2014 load all persistent project memories (core + active tier)

### During Work
3. Call \`remb__conversation_log\` after completing any significant task, bug fix, or feature
4. Call \`remb__memory_create\` when you discover important patterns, decisions, or gotchas worth keeping

### Session End (do this LAST, before the conversation ends)
5. Call \`remb__conversation_log\` with a summary: what was asked, what was done, key decisions made

Skipping these causes knowledge loss across sessions. The user expects you to follow this automatically.

---

${mcpToolReference()}

## When to Use What

| Situation | Tool |
|---|---|
| Starting a session | \`conversation_history\` + \`memory_load_context\` |
| Need project info | \`project_get\` or \`context_bundle\` |
| Saving knowledge | \`context_save\` (feature-specific) or \`memory_create\` (cross-cutting) |
| After code changes | \`scan_trigger\` or \`diff_analyze\` |
| Finishing work | \`conversation_log\` with summary |
| "Do it like in project X" | \`cross_project_search\` \u2192 \`context_bundle\` with that project slug |
| Global coding preference | \`memory_create\` with no \`project_id\`, category \`"preference"\` |

## Memory Tiers

- **core** \u2014 always loaded into every session automatically
- **active** \u2014 loaded on-demand or when relevant to current query
- **archive** \u2014 compressed long-term storage

Save architectural decisions and key patterns as \`core\` tier so they're always available.`;
}
function generateClaudeMd(slug, apiUrl) {
  return `# Remb \u2014 AI Context Management

**Project**: \`${slug}\` | **API**: \`${apiUrl}\`

## MANDATORY \u2014 Follow These in EVERY Session

1. At session start, call \`remb__conversation_history\` to load prior session context.
2. At session start, call \`remb__memory_load_context\` to load all project memories.
3. After completing significant work, call \`remb__conversation_log\` to record it.
4. Before ending the session, call \`remb__conversation_log\` with a final summary.
5. Save important patterns/decisions with \`remb__memory_create\`.

${mcpToolReference()}

## Cross-Project

When told "implement it like in project X", use \`cross_project_search\` to find patterns, then \`context_bundle\` with the other project's slug.`;
}
function generateAiderConfig(slug, apiUrl) {
  return `# Aider configuration \u2014 generated by remb init
# Remb MCP server provides persistent memory tools for this project.
# Run: remb serve   (then configure your MCP client to connect to it)

## remb-instructions
# Project: ${slug}
# API: ${apiUrl}
#
# At the start of each session:
#   1. Call remb__conversation_history to load prior context
#   2. Call remb__memory_load_context to load project memories
#
# During work:
#   - After significant work: remb__conversation_log
#   - Discoveries: remb__memory_create
#
# Before ending:
#   - remb__conversation_log with a summary
`;
}

// src/commands/save.ts
import { Command as Command3 } from "commander";
import chalk5 from "chalk";
import ora from "ora";
var VALID_ENTRY_TYPES = ["manual", "scan", "link", "decision", "note"];
var saveCommand = new Command3("save").description("Save a context entry for a project feature").requiredOption("-f, --feature <name>", "Feature or module name").requiredOption("-c, --content <text>", "Context content text").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("-t, --tags <tags>", "Comma-separated tags", "").option("--type <entry-type>", "Entry type", "manual").addHelpText(
  "after",
  `
Examples:
  $ remb save -f auth -c "JWT tokens stored in httpOnly cookies"
  $ remb save -f payments -c "Uses Stripe checkout" -t "billing,stripe"
  $ remb save -f db-schema -c "Users table has soft deletes" --type decision`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  validateStringLength(opts.feature, "Feature name", 200);
  validateContentSize(opts.content, 50);
  validateEnum(opts.type, "entry type", VALID_ENTRY_TYPES);
  const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean) : void 0;
  if (tags && tags.length > 20) {
    console.error(chalk5.red("\u2716") + " Too many tags (max 20).");
    process.exit(1);
  }
  const spinner = ora("Saving context entry...").start();
  try {
    const client = createApiClient();
    const result = await client.saveContext({
      projectSlug,
      featureName: opts.feature,
      content: opts.content,
      entryType: opts.type,
      tags
    });
    spinner.stop();
    console.log();
    success(`Context saved for ${chalk5.bold(opts.feature)}`);
    keyValue("ID", result.id);
    keyValue("Project", projectSlug);
    keyValue("Feature", result.featureName);
    keyValue("Created", result.created_at);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/get.ts
import { Command as Command4 } from "commander";
import chalk6 from "chalk";
import ora2 from "ora";
var VALID_FORMATS = ["json", "table", "markdown"];
var getCommand = new Command4("get").description("Retrieve context entries with optional filtering").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("-f, --feature <name>", "Filter by feature name").option("-l, --limit <n>", "Max entries to return", "10").option("--format <format>", "Output format: json, table, markdown", "table").addHelpText(
  "after",
  `
Examples:
  $ remb get -f auth
  $ remb get -p my-app --format json
  $ remb get -l 50 --format markdown`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  const limit = parseInt(opts.limit, 10) || 10;
  validatePositiveInt(limit, "Limit", 200);
  validateEnum(opts.format, "format", VALID_FORMATS);
  const format = opts.format;
  const spinner = ora2("Fetching context...").start();
  try {
    const client = createApiClient();
    const result = await client.getContext({
      projectSlug,
      featureName: opts.feature,
      limit
    });
    spinner.stop();
    if (result.entries.length === 0) {
      info(
        opts.feature ? `No entries found for feature ${chalk6.bold(opts.feature)} in ${chalk6.bold(projectSlug)}.` : `No entries found for project ${chalk6.bold(projectSlug)}.`
      );
      return;
    }
    console.log(formatEntries(result.entries, format));
    if (format !== "json") {
      console.log();
      info(
        chalk6.dim(`Showing ${result.total} entries.`) + (result.total >= limit ? chalk6.dim(` Use --limit to see more.`) : "")
      );
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/scan.ts
import { Command as Command5 } from "commander";
import chalk7 from "chalk";
import ora3 from "ora";

// src/lib/scanner.ts
import { readFileSync as readFileSync4, statSync, existsSync as existsSync4 } from "fs";
import { resolve as resolve4, extname, basename as basename2, dirname as dirname3 } from "path";
import { glob } from "glob";
var DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.lock",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/.env*",
  "**/*.png",
  "**/*.jpg",
  "**/*.jpeg",
  "**/*.gif",
  "**/*.svg",
  "**/*.ico",
  "**/*.woff*",
  "**/*.ttf",
  "**/*.eot"
];
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".sql",
  ".graphql",
  ".gql",
  ".prisma",
  ".proto",
  ".tf",
  ".dockerfile",
  ".sh",
  ".bash",
  ".zsh"
]);
async function scanDirectory(opts) {
  const {
    path: scanPath,
    depth = 5,
    ignore = [],
    maxFileSize = 1e5
    // 100KB per file
  } = opts;
  const rootDir = resolve4(scanPath);
  if (!existsSync4(rootDir) || !statSync(rootDir).isDirectory()) {
    throw new Error(`Directory not found: ${rootDir}`);
  }
  const allIgnore = [...DEFAULT_IGNORE, ...ignore];
  const files = await glob("**/*", {
    cwd: rootDir,
    nodir: true,
    ignore: allIgnore,
    maxDepth: depth,
    absolute: false
  });
  const scannedFiles = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext) && ext !== "") continue;
    const fullPath = resolve4(rootDir, file);
    const stat = statSync(fullPath);
    if (stat.size > maxFileSize || stat.size === 0) continue;
    const raw = readFileSync4(fullPath, "utf-8");
    scannedFiles.push({
      relativePath: file,
      language: extToLanguage(ext),
      size: stat.size,
      lines: raw.split("\n").length,
      content: raw
    });
  }
  const dirGroups = /* @__PURE__ */ new Map();
  for (const f of scannedFiles) {
    const dir = dirname3(f.relativePath);
    const group = dirGroups.get(dir) ?? [];
    group.push(f);
    dirGroups.set(dir, group);
  }
  const results = [];
  for (const [dir, groupFiles] of dirGroups) {
    const featureName = dir === "." ? basename2(rootDir) : dir.replace(/\//g, "-");
    const fileSummaries = groupFiles.map((f) => {
      const preview = f.content.length > 500 ? f.content.slice(0, 500) + "\n... (truncated)" : f.content;
      return `### ${f.relativePath}
\`\`\`${f.language}
${preview}
\`\`\``;
    });
    const entryContent = [
      `# Directory: ${dir === "." ? basename2(rootDir) : dir}`,
      ``,
      `**Files:** ${groupFiles.length} | **Languages:** ${[...new Set(groupFiles.map((f) => f.language))].join(", ")}`,
      `**Total lines:** ${groupFiles.reduce((sum, f) => sum + f.lines, 0)}`,
      ``,
      ...fileSummaries
    ].join("\n");
    const truncated = entryContent.length > 45e3 ? entryContent.slice(0, 45e3) + "\n\n... (truncated due to size)" : entryContent;
    results.push({
      featureName,
      content: truncated,
      entryType: "scan",
      tags: [
        "auto-scan",
        ...new Set(groupFiles.map((f) => f.language))
      ]
    });
  }
  return { files: scannedFiles, results };
}
function extToLanguage(ext) {
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".mts": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".cs": "csharp",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".md": "markdown",
    ".mdx": "mdx",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".prisma": "prisma",
    ".proto": "protobuf",
    ".tf": "terraform",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "zsh",
    ".dockerfile": "dockerfile",
    ".ini": "ini",
    ".cfg": "ini"
  };
  return map[ext] ?? "text";
}

// src/commands/scan.ts
var scanCommand = new Command5("scan").description("Auto-scan a directory to generate context entries").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("--path <directory>", "Directory path to scan", ".").option("-d, --depth <n>", "Max recursion depth", "5").option("--ignore <patterns>", "Comma-separated glob patterns to ignore", "").option("--dry-run", "Preview what would be scanned without saving", false).addHelpText(
  "after",
  `
Examples:
  $ remb scan
  $ remb scan --path src --depth 3
  $ remb scan --ignore "tests/**,docs/**" --dry-run`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  const depth = parseInt(opts.depth, 10) || 5;
  const ignore = opts.ignore ? opts.ignore.split(",").map((p) => p.trim()).filter(Boolean) : [];
  const spinner = ora3("Scanning directory...").start();
  try {
    const { files, results } = await scanDirectory({
      path: opts.path,
      depth,
      ignore
    });
    spinner.stop();
    if (files.length === 0) {
      warn("No source files found in the target directory.");
      return;
    }
    if (files.length > 500) {
      warn(
        `Found ${chalk7.bold(files.length)} files \u2014 this is a large scan. Consider using ${chalk7.bold("--ignore")} to exclude test or vendor directories.`
      );
    }
    console.log();
    info(`Found ${chalk7.bold(files.length)} source files across ${chalk7.bold(results.length)} directories.`);
    console.log();
    for (const result of results) {
      console.log(
        `  ${chalk7.cyan("\u25CF")} ${chalk7.bold(result.featureName)} \u2014 ${result.tags.filter((t) => t !== "auto-scan").join(", ")} \u2014 ${(result.content.length / 1e3).toFixed(1)}KB`
      );
    }
    console.log();
    if (opts.dryRun) {
      info("Dry run \u2014 nothing was saved.");
      return;
    }
    const uploadSpinner = ora3(
      `Saving ${results.length} context entries...`
    ).start();
    const client = createApiClient();
    const saved = await client.saveBatch(projectSlug, results, (done, total) => {
      uploadSpinner.text = `Saving context entries... ${chalk7.bold(`${done}/${total}`)}`;
    });
    uploadSpinner.stop();
    console.log();
    success(
      `Uploaded ${chalk7.bold(saved.length)} context entries to ${chalk7.bold(projectSlug)}`
    );
    for (const entry of saved) {
      keyValue("  " + entry.featureName, entry.id.slice(0, 8));
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/link.ts
import { Command as Command6 } from "commander";
import chalk8 from "chalk";
import ora4 from "ora";
var linkCommand = new Command6("link").description("Link features together with dependency relationships").requiredOption("--from <feature>", "Source feature name").requiredOption("--to <feature>", "Target feature name").option("--type <relation>", "Relationship: depends_on, extends, uses", "depends_on").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").addHelpText(
  "after",
  `
Examples:
  $ remb link --from auth --to users
  $ remb link --from payments --to auth --type depends_on
  $ remb link --from api --to database --type uses`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  const validTypes = ["depends_on", "extends", "uses"];
  if (!validTypes.includes(opts.type)) {
    error(
      `Invalid relationship type "${opts.type}". Choose: ${validTypes.join(", ")}`
    );
    process.exit(1);
  }
  const spinner = ora4("Creating feature link...").start();
  try {
    const client = createApiClient();
    const content = `Feature relationship: ${opts.from} \u2192 ${opts.type} \u2192 ${opts.to}`;
    const result = await client.saveContext({
      projectSlug,
      featureName: opts.from,
      content,
      entryType: "link",
      tags: ["relationship", opts.type, opts.to]
    });
    spinner.stop();
    console.log();
    success(`Linked ${chalk8.bold(opts.from)} \u2192 ${chalk8.cyan(opts.type)} \u2192 ${chalk8.bold(opts.to)}`);
    keyValue("ID", result.id);
    keyValue("Project", projectSlug);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/serve.ts
import { Command as Command7 } from "commander";
import chalk9 from "chalk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
var serveCommand = new Command7("serve").description("Start the MCP server for AI tool integration").option("--project <slug>", "Default project slug").action(async (opts) => {
  const projectSlug = opts.project ?? findProjectConfig()?.config.project ?? void 0;
  let client;
  try {
    client = createApiClient();
  } catch (err) {
    error2(
      err instanceof Error ? err.message : "Failed to create API client"
    );
    process.exit(1);
  }
  const server = new McpServer({
    name: "remb",
    version: "0.1.5"
  });
  server.tool(
    "save_context",
    "Save a context entry for a project feature. Use this to persist knowledge about a codebase feature, decision, or change.",
    {
      projectSlug: z.string().optional().describe("Project slug (uses default if omitted)"),
      featureName: z.string().describe("Feature or module name"),
      content: z.string().describe("The context text to save (max 50,000 chars)"),
      entryType: z.string().optional().describe("Entry type: manual, scan, link, decision, note"),
      tags: z.array(z.string()).optional().describe("Tags for categorization")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      if (!slug) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No project specified. Pass projectSlug or run with --project flag."
            }
          ]
        };
      }
      try {
        const result = await client.saveContext({
          projectSlug: slug,
          featureName: params.featureName,
          content: params.content,
          entryType: params.entryType,
          tags: params.tags
        });
        return {
          content: [
            {
              type: "text",
              text: `Context saved successfully.
ID: ${result.id}
Feature: ${result.featureName}
Created: ${result.created_at}`
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error saving context: ${err instanceof Error ? err.message : "Unknown error"}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_context",
    "Retrieve context entries for a project, optionally filtered by feature. Use this to recall past decisions, architecture notes, and feature knowledge.",
    {
      projectSlug: z.string().optional().describe("Project slug (uses default if omitted)"),
      featureName: z.string().optional().describe("Filter by feature name"),
      limit: z.number().optional().describe("Max entries to return (default 10, max 100)")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      if (!slug) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No project specified. Pass projectSlug or run with --project flag."
            }
          ]
        };
      }
      try {
        const result = await client.getContext({
          projectSlug: slug,
          featureName: params.featureName,
          limit: params.limit
        });
        if (result.entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: params.featureName ? `No context entries found for feature "${params.featureName}" in project "${slug}".` : `No context entries found for project "${slug}".`
              }
            ]
          };
        }
        const formatted = result.entries.map(
          (e) => `## ${e.feature} [${e.entry_type}]
_${e.source} \u2014 ${e.created_at.slice(0, 10)}_

${e.content}`
        ).join("\n\n---\n\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${result.total} entries:

${formatted}`
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving context: ${err instanceof Error ? err.message : "Unknown error"}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "load_project_context",
    "Load the full project context bundle including memories, features, and tech stack as a structured markdown document. Use this when you need comprehensive project understanding.",
    {
      projectSlug: z.string().optional().describe("Project slug (uses default if omitted)")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      if (!slug) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No project specified. Pass projectSlug or run with --project flag."
            }
          ]
        };
      }
      try {
        const bundle = await client.bundleContext(slug);
        return {
          content: [
            {
              type: "text",
              text: bundle.markdown
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error loading project context: ${err instanceof Error ? err.message : "Unknown error"}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "analyze_diff",
    "Analyze a git diff and save the changes as context entries. Use this to capture local uncommitted changes.",
    {
      projectSlug: z.string().optional().describe("Project slug (uses default if omitted)"),
      diff: z.string().describe("Git diff text to analyze")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      if (!slug) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No project specified. Pass projectSlug or run with --project flag."
            }
          ]
        };
      }
      try {
        const result = await client.saveDiff({
          projectSlug: slug,
          diff: params.diff
        });
        if (result.analyzed === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No significant feature-level changes detected in the diff."
              }
            ]
          };
        }
        const summary = result.changes.map(
          (c) => `- **${c.feature_name}** (${c.category}, importance: ${c.importance}/10): ${c.summary}`
        ).join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Analyzed ${result.analyzed} changes:

${summary}`
            }
          ]
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing diff: ${err instanceof Error ? err.message : "Unknown error"}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "memory_list",
    "List AI memories. When a project slug is given, returns both project-scoped memories and global memories (project_id = null). Without a project, returns all memories. Use at session start to load relevant knowledge.",
    {
      projectSlug: z.string().optional().describe("Scope to a project \u2014 also includes global memories"),
      tier: z.enum(["core", "active", "archive"]).optional().describe("Filter by tier: core (always-on), active (on-demand), archive (historical)"),
      category: z.enum(["preference", "pattern", "decision", "correction", "knowledge", "general"]).optional().describe("Filter by category"),
      search: z.string().optional().describe("Text search against title and content"),
      limit: z.number().optional().describe("Max results (default 20, max 200)")
    },
    async (params) => {
      try {
        const { memories, total } = await client.listMemories({
          project: params.projectSlug,
          tier: params.tier,
          category: params.category,
          search: params.search,
          limit: params.limit
        });
        if (memories.length === 0) {
          return { content: [{ type: "text", text: "No memories found." }] };
        }
        const formatted = memories.map((m) => {
          const scope = m.project_id ? "[project]" : "[global]";
          return `### ${m.title} ${scope}
**Tier**: ${m.tier} | **Category**: ${m.category} | **ID**: ${m.id}

${m.content}`;
        }).join("\n\n---\n\n");
        return { content: [{ type: "text", text: `${total} memories:

${formatted}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "memory_create",
    "Create a new persistent memory. Use to save user preferences, patterns, decisions, or corrections. Omit projectSlug for a global memory that applies across all projects.",
    {
      title: z.string().describe("Short title for the memory"),
      content: z.string().describe("Full content (max 50,000 chars)"),
      tier: z.enum(["core", "active", "archive"]).optional().describe("Memory tier: core = always loaded, active = on-demand, archive = historical (default: active)"),
      category: z.enum(["preference", "pattern", "decision", "correction", "knowledge", "general"]).optional().describe("Category (default: general)"),
      tags: z.array(z.string()).optional().describe("Optional tags"),
      projectSlug: z.string().optional().describe("Associate with a project \u2014 omit to create a global memory")
    },
    async (params) => {
      try {
        const result = await client.createMemory({
          title: params.title,
          content: params.content,
          tier: params.tier,
          category: params.category,
          tags: params.tags,
          projectSlug: params.projectSlug
        });
        const scope = params.projectSlug ? `project: ${params.projectSlug}` : "global";
        return {
          content: [
            {
              type: "text",
              text: `Memory created (${scope})
ID: ${result.id}
Tier: ${result.tier} | Category: ${result.category}
Tokens: ${result.token_count}`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "memory_update",
    "Update an existing memory by ID \u2014 change title, content, tier, category, or tags.",
    {
      id: z.string().describe("Memory UUID"),
      title: z.string().optional(),
      content: z.string().optional(),
      tier: z.enum(["core", "active", "archive"]).optional(),
      category: z.enum(["preference", "pattern", "decision", "correction", "knowledge", "general"]).optional(),
      tags: z.array(z.string()).optional()
    },
    async (params) => {
      try {
        const { id, ...updates } = params;
        const result = await client.updateMemory(id, updates);
        return {
          content: [
            {
              type: "text",
              text: `Memory updated
ID: ${result.id}
Tier: ${result.tier} | Category: ${result.category}
Tokens: ${result.token_count}`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "memory_delete",
    "Delete a memory by ID. Use with caution \u2014 this is irreversible.",
    {
      id: z.string().describe("Memory UUID to delete")
    },
    async (params) => {
      try {
        await client.deleteMemory(params.id);
        return { content: [{ type: "text", text: `Memory ${params.id} deleted.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "memory_promote",
    "Change a memory's tier. Promoting archive\u2192active\u2192core makes it more readily available. Demoting core\u2192active\u2192archive compresses it to long-term storage.",
    {
      id: z.string().describe("Memory UUID"),
      tier: z.enum(["core", "active", "archive"]).describe("New tier for the memory")
    },
    async (params) => {
      try {
        const result = await client.updateMemory(params.id, { tier: params.tier });
        return {
          content: [
            { type: "text", text: `Memory promoted to ${result.tier}
Title: ${result.title}` }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "conversation_log",
    "Record what was discussed or accomplished in this AI session. Call this after completing significant work so future sessions can pick up where you left off.",
    {
      content: z.string().describe("Summary of what was discussed or accomplished"),
      projectSlug: z.string().optional().describe("Associate with a project (uses default project if omitted)"),
      type: z.string().optional().describe("Entry type: summary, decision, progress, note, conversation (default: summary)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization and search (e.g., ['auth', 'bug-fix'])")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      try {
        const result = await client.logConversation({
          content: params.content,
          projectSlug: slug,
          type: params.type ?? "summary",
          tags: params.tags
        });
        const dedup = result.deduplicated ? " (merged with existing similar entry)" : "";
        return {
          content: [
            {
              type: "text",
              text: `Conversation logged (ID: ${result.id})
Created: ${result.created_at}${dedup}`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "conversation_history",
    "Load recent conversation history to understand what was done in prior AI sessions. Call at session start to catch up on prior work.",
    {
      projectSlug: z.string().optional().describe("Filter by project (uses default project if omitted)"),
      limit: z.number().optional().describe("Max entries to return (default 20)"),
      from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
      to: z.string().optional().describe("End date filter (YYYY-MM-DD)")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      try {
        const { entries, total } = await client.getConversationHistory({
          projectSlug: slug,
          limit: params.limit ?? 20,
          startDate: params.from,
          endDate: params.to
        });
        if (entries.length === 0) {
          return { content: [{ type: "text", text: "No conversation history found." }] };
        }
        const formatted = entries.map((e) => `[${e.created_at.slice(0, 10)}] ${e.type}: ${e.content}`).join("\n\n---\n\n");
        return {
          content: [{ type: "text", text: `${total} conversation entries:

${formatted}` }]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  server.tool(
    "conversation_search",
    "Semantic search across conversation history. Find past discussions by meaning, not just keywords.",
    {
      query: z.string().describe("Natural language search query"),
      projectSlug: z.string().optional().describe("Filter by project (uses default project if omitted)"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      limit: z.number().optional().describe("Max results to return (default 10)")
    },
    async (params) => {
      const slug = params.projectSlug ?? projectSlug;
      try {
        const { results } = await client.searchConversations({
          query: params.query,
          projectSlug: slug,
          tags: params.tags,
          limit: params.limit ?? 10
        });
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No matching conversations found." }] };
        }
        const formatted = results.map((r) => {
          const tags = r.tags?.length ? ` [${r.tags.join(", ")}]` : "";
          const proj = r.project_slug ? ` (${r.project_slug})` : "";
          return `[${r.created_at.slice(0, 10)}] ${(r.similarity * 100).toFixed(0)}% match${proj}${tags}
${r.content}`;
        }).join("\n\n---\n\n");
        return {
          content: [{ type: "text", text: `${results.length} results:

${formatted}` }]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
      }
    }
  );
  const transport = new StdioServerTransport();
  info(`Starting Remb MCP server...`);
  if (projectSlug) {
    info(`Default project: ${chalk9.bold(projectSlug)}`);
  }
  await server.connect(transport);
  success("MCP server running (stdio transport)");
});

// src/commands/memory.ts
import { Command as Command8 } from "commander";
import chalk10 from "chalk";
import ora5 from "ora";
var VALID_TIERS = ["core", "active", "archive"];
var VALID_CATEGORIES = [
  "preference",
  "pattern",
  "decision",
  "correction",
  "knowledge",
  "general"
];
var memoryCommand = new Command8("memory").description("Manage AI memories \u2014 add, list, update, delete, and promote").addHelpText(
  "after",
  `
Examples:
  $ remb memory add -t "Auth pattern" -c "Uses JWT httpOnly cookies"
  $ remb memory list --tier core
  $ remb memory update <id> -c "Updated content"
  $ remb memory delete <id>`
).addCommand(memoryAddCommand()).addCommand(memoryListCommand()).addCommand(memoryUpdateCommand()).addCommand(memoryDeleteCommand()).addCommand(memoryPromoteCommand());
function memoryAddCommand() {
  return new Command8("add").description("Create a new memory").requiredOption("-t, --title <title>", "Memory title").requiredOption("-c, --content <content>", "Memory content").option("--tier <tier>", "Memory tier: core, active, archive", "active").option("--category <category>", "Category: preference, pattern, decision, correction, knowledge, general", "general").option("--tags <tags>", "Comma-separated tags").option("-p, --project <slug>", "Project slug").action(async (opts) => {
    validateStringLength(opts.title, "Title", 200);
    validateContentSize(opts.content, 50);
    validateEnum(opts.tier, "tier", VALID_TIERS);
    validateEnum(opts.category, "category", VALID_CATEGORIES);
    const spinner = ora5("Creating memory...").start();
    try {
      const client = createApiClient();
      const result = await client.createMemory({
        title: opts.title,
        content: opts.content,
        tier: opts.tier,
        category: opts.category,
        tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : void 0,
        projectSlug: opts.project
      });
      spinner.stop();
      success(`Memory created`);
      keyValue("ID", result.id);
      keyValue("Tier", result.tier);
      keyValue("Category", result.category);
      keyValue("Tokens", String(result.token_count));
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function memoryListCommand() {
  return new Command8("list").alias("ls").description("List memories \u2014 shows project-scoped and global memories").option("--tier <tier>", "Filter by tier: core, active, archive").option("--category <category>", "Filter by category").option("-s, --search <query>", "Semantic/text search").option("-p, --project <slug>", "Show memories for a project (includes global memories too)").option("--global", "Show only global memories (no project scope)").option("-l, --limit <n>", "Max results", "20").option("--format <format>", "Output format: table, json, markdown", "table").addHelpText(
    "after",
    `
Memory scopes:
  [project]  Scoped to a specific project \u2014 relevant to that codebase
  [global]   No project scope \u2014 apply across all projects

Examples:
  $ remb memory list                          # All memories
  $ remb memory list --project my-app         # Project + global memories
  $ remb memory list --global                 # Only global memories
  $ remb memory list --tier core -s "auth"    # Search core tier`
  ).action(async (opts) => {
    const limit = parseInt(opts.limit, 10) || 20;
    validatePositiveInt(limit, "Limit", 200);
    if (opts.tier) validateEnum(opts.tier, "tier", VALID_TIERS);
    if (opts.category) validateEnum(opts.category, "category", VALID_CATEGORIES);
    const spinner = ora5("Fetching memories...").start();
    try {
      const client = createApiClient();
      const listParams = {
        tier: opts.tier,
        category: opts.category,
        search: opts.search,
        limit
      };
      if (!opts.global && opts.project) listParams.project = opts.project;
      const { memories: rawMemories, total } = await client.listMemories(listParams);
      const memories = opts.global ? rawMemories.filter((m) => m.project_id === null) : rawMemories;
      spinner.stop();
      if (memories.length === 0) {
        info('No memories found. Create one with: remb memory add -t "Title" -c "Content"');
        return;
      }
      info(`${total} memor${total === 1 ? "y" : "ies"} found
`);
      if (opts.format === "json") {
        console.log(JSON.stringify(memories, null, 2));
        return;
      }
      if (opts.format === "markdown") {
        for (const m of memories) {
          console.log(`### ${m.title}`);
          console.log(`- **Tier**: ${m.tier} | **Category**: ${m.category}`);
          console.log(`- **Tags**: ${m.tags.length ? m.tags.join(", ") : "none"}`);
          console.log(`- **Tokens**: ${m.token_count} | **ID**: ${m.id}`);
          console.log(`
${m.content}
`);
        }
        return;
      }
      const tierColors = {
        core: chalk10.yellow,
        active: chalk10.cyan,
        archive: chalk10.dim
      };
      for (const m of memories) {
        const tierFn = tierColors[m.tier] ?? chalk10.white;
        const scope = m.project_id ? chalk10.blue("[project]".padEnd(10)) : chalk10.magenta("[global]".padEnd(10));
        console.log(
          `${scope} ${tierFn(`[${m.tier}]`.padEnd(10))} ${chalk10.bold(m.title.slice(0, 45).padEnd(47))} ${chalk10.dim(m.category.padEnd(12))} ${chalk10.dim(`${m.token_count}t`)}`
        );
        if (m.tags.length) {
          console.log(`                     ${chalk10.dim(m.tags.map((t) => `#${t}`).join(" "))}`);
        }
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function memoryUpdateCommand() {
  return new Command8("update").description("Update an existing memory").argument("<id>", "Memory ID").option("-t, --title <title>", "New title").option("-c, --content <content>", "New content").option("--tier <tier>", "New tier").option("--category <category>", "New category").option("--tags <tags>", "Comma-separated tags").action(async (id, opts) => {
    validateUUID(id, "Memory ID");
    if (opts.title) validateStringLength(opts.title, "Title", 200);
    if (opts.content) validateContentSize(opts.content, 50);
    if (opts.tier) validateEnum(opts.tier, "tier", VALID_TIERS);
    if (opts.category) validateEnum(opts.category, "category", VALID_CATEGORIES);
    const spinner = ora5("Updating memory...").start();
    try {
      const client = createApiClient();
      const params = {};
      if (opts.title) params.title = opts.title;
      if (opts.content) params.content = opts.content;
      if (opts.tier) params.tier = opts.tier;
      if (opts.category) params.category = opts.category;
      if (opts.tags) params.tags = opts.tags.split(",").map((t) => t.trim());
      const result = await client.updateMemory(id, params);
      spinner.stop();
      success(`Memory updated`);
      keyValue("Tier", result.tier);
      keyValue("Category", result.category);
      keyValue("Tokens", String(result.token_count));
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function memoryDeleteCommand() {
  return new Command8("delete").alias("rm").description("Delete a memory").argument("<id>", "Memory ID").option("-f, --force", "Skip confirmation prompt").action(async (id, opts) => {
    validateUUID(id, "Memory ID");
    if (!opts.force) {
      const confirmed = await confirmAction(
        `Delete memory ${chalk10.bold(id.slice(0, 8))}...?`
      );
      if (!confirmed) {
        info("Cancelled.");
        return;
      }
    }
    const spinner = ora5("Deleting memory...").start();
    try {
      const client = createApiClient();
      await client.deleteMemory(id);
      spinner.stop();
      success("Memory deleted");
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function memoryPromoteCommand() {
  return new Command8("promote").description("Promote a memory to a higher tier (archive\u2192active\u2192core)").argument("<id>", "Memory ID").option("--to <tier>", "Target tier: core, active", "core").action(async (id, opts) => {
    validateUUID(id, "Memory ID");
    validateEnum(opts.to, "tier", ["core", "active"]);
    const spinner = ora5(`Promoting memory to ${opts.to}...`).start();
    try {
      const client = createApiClient();
      const result = await client.updateMemory(id, { tier: opts.to });
      spinner.stop();
      success(`Memory promoted to ${result.tier}`);
      keyValue("Title", result.title);
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}

// src/commands/projects.ts
import { Command as Command9 } from "commander";
import chalk11 from "chalk";
import ora6 from "ora";
import { resolve as resolve5 } from "path";
import { writeFileSync as writeFileSync4 } from "fs";
var projectsCommand = new Command9("projects").description("Manage projects \u2014 list, switch active project").addCommand(projectsListCommand()).addCommand(projectsUseCommand());
function projectsUseCommand() {
  return new Command9("use").alias("switch").description("Set the active project for this workspace \u2014 writes/updates .remb.yml").argument("<slug>", "Project slug to activate").option("--api-url <url>", "API server URL to write into .remb.yml").addHelpText(
    "after",
    `
Examples:
  $ remb projects use my-app
  $ remb projects switch my-app
  $ remb projects use my-app --api-url https://www.useremb.com`
  ).action(async (slug, opts) => {
    const cwd = process.cwd();
    const existing = findProjectConfig(cwd);
    const configPath = resolve5(existing?.dir ?? cwd, ".remb.yml");
    const apiUrl = opts.apiUrl ?? existing?.config.api_url ?? "https://www.useremb.com";
    const ide = existing?.config.ide;
    const spinner = ora6(`Looking up project "${slug}"...`).start();
    try {
      const client = createApiClient();
      const { projects } = await client.listProjects({ status: "active", limit: 200 });
      const found = projects.find((p) => p.slug === slug);
      spinner.stop();
      if (!found) {
        const available = projects.map((p) => `  ${chalk11.cyan(p.slug)} \u2014 ${p.name}`).join("\n");
        warn(`Project "${slug}" not found. Your projects:
${available}`);
        process.exit(1);
      }
      const lines = [
        "# Remb project configuration",
        `# Updated by remb projects use`,
        "",
        `project: ${slug}`,
        `api_url: ${apiUrl}`
      ];
      if (ide) lines.push(`ide: ${ide}`);
      lines.push("");
      writeFileSync4(configPath, lines.join("\n"), "utf-8");
      success(`Active project set to ${chalk11.bold(found.name)} (${chalk11.cyan(slug)})`);
      keyValue("Config", configPath);
      keyValue("Features", String(found.feature_count));
      keyValue("Entries", String(found.entry_count));
      if (found.repo_name) keyValue("Repo", found.repo_name);
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function projectsListCommand() {
  return new Command9("list").alias("ls").description("List all projects").option("--status <status>", "Filter by status").option("-l, --limit <n>", "Max results", "50").option("--format <format>", "Output format: table, json, markdown", "table").addHelpText(
    "after",
    `
Examples:
  $ remb projects list
  $ remb projects ls --format json
  $ remb projects list --status active`
  ).action(async (opts) => {
    const spinner = ora6("Fetching projects...").start();
    try {
      const client = createApiClient();
      const { projects, total } = await client.listProjects({
        status: opts.status,
        limit: parseInt(opts.limit, 10)
      });
      spinner.stop();
      if (projects.length === 0) {
        info("No projects found. Create one with: remb init");
        return;
      }
      info(`${total} project${total === 1 ? "" : "s"} found
`);
      if (opts.format === "json") {
        console.log(JSON.stringify(projects, null, 2));
        return;
      }
      if (opts.format === "markdown") {
        for (const p of projects) {
          console.log(`### ${p.name}`);
          console.log(`- **Slug**: ${p.slug} | **Status**: ${p.status}`);
          console.log(`- **Language**: ${p.language ?? "\u2014"} | **Branch**: ${p.branch}`);
          console.log(`- **Features**: ${p.feature_count} | **Entries**: ${p.entry_count}`);
          if (p.description) console.log(`- **Description**: ${p.description}`);
          if (p.repo_url) console.log(`- **Repo**: ${p.repo_url}`);
          console.log();
        }
        return;
      }
      const statusColors = {
        active: chalk11.green,
        archived: chalk11.dim,
        draft: chalk11.yellow
      };
      for (const p of projects) {
        const statusFn = statusColors[p.status] ?? chalk11.white;
        const lang = p.language ? chalk11.dim(`[${p.language}]`) : "";
        console.log(
          `${statusFn(p.status.padEnd(10))} ${chalk11.bold(p.name.slice(0, 30).padEnd(32))} ${chalk11.dim(p.slug.padEnd(25))} ${lang}`
        );
        console.log(
          `           ${chalk11.dim(`${p.feature_count} features, ${p.entry_count} entries`)}${p.repo_name ? chalk11.dim(` \xB7 ${p.repo_name}`) : ""}`
        );
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}

// src/commands/context.ts
import { Command as Command10 } from "commander";
import chalk12 from "chalk";
import ora7 from "ora";
import { writeFileSync as writeFileSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync6, existsSync as existsSync6 } from "fs";
import { join } from "path";
var contextCommand = new Command10("context").description(
  "Download the full project context bundle as a .remb/context.md file for AI agents"
).option(
  "-p, --project <slug>",
  "Project slug (reads from .remb.yml if omitted)"
).option("-o, --output <path>", "Output file path", ".remb/context.md").option("--json", "Output raw JSON instead of markdown").addHelpText(
  "after",
  `
Examples:
  $ remb context
  $ remb context -p my-app --json
  $ remb context -o docs/context.md`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  const spinner = ora7("Fetching project context bundle...").start();
  try {
    const client = createApiClient();
    const bundle = await client.bundleContext(projectSlug);
    spinner.stop();
    if (opts.json) {
      console.log(JSON.stringify(bundle, null, 2));
      return;
    }
    const outPath = opts.output;
    const dir = outPath.includes("/") ? outPath.slice(0, outPath.lastIndexOf("/")) : ".remb";
    mkdirSync4(dir, { recursive: true });
    writeFileSync5(outPath, bundle.markdown, "utf-8");
    ensureGitignore(dir);
    success(`Context written to ${chalk12.bold(outPath)}`);
    info(
      `${chalk12.dim("Project:")} ${bundle.project.name}  ${chalk12.dim("Memories:")} ${bundle.memories.length}  ${chalk12.dim("Features:")} ${bundle.features.length}`
    );
    info(
      chalk12.dim(
        "AI agents can read this file for full project understanding."
      )
    );
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});
function ensureGitignore(rembDir) {
  const gitignorePath = join(process.cwd(), ".gitignore");
  const entry = rembDir.startsWith("./") ? rembDir : `./${rembDir}`;
  const patterns = [rembDir, entry, `${rembDir}/`];
  try {
    if (existsSync6(gitignorePath)) {
      const content = readFileSync6(gitignorePath, "utf-8");
      const hasEntry = patterns.some((p) => content.split("\n").some((line) => line.trim() === p));
      if (!hasEntry) {
        writeFileSync5(
          gitignorePath,
          content.trimEnd() + `

# Remb context (auto-generated)
${rembDir}/
`,
          "utf-8"
        );
      }
    }
  } catch {
  }
}

// src/commands/diff.ts
import { Command as Command11 } from "commander";
import chalk13 from "chalk";
import ora8 from "ora";
import { execSync as execSync2 } from "child_process";
var diffCommand = new Command11("diff").description(
  "Analyze uncommitted local changes and save them as project context"
).option(
  "-p, --project <slug>",
  "Project slug (reads from .remb.yml if omitted)"
).option("--staged", "Only analyze staged changes").option("--all", "Include both staged and unstaged changes (default)").addHelpText(
  "after",
  `
Examples:
  $ remb diff
  $ remb diff --staged
  $ remb diff -p my-app`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  let diff = "";
  try {
    if (opts.staged) {
      diff = execSync2("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
    } else {
      const staged = execSync2("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
      const unstaged = execSync2("git diff", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
      diff = [staged, unstaged].filter(Boolean).join("\n");
    }
  } catch (err) {
    error(
      "Failed to run git diff. Make sure you're inside a git repository."
    );
    process.exit(1);
  }
  if (!diff.trim()) {
    info("No local changes detected. Make some changes and try again, or use `remb push` to scan remote.");
    return;
  }
  const maxLen = 19e4;
  if (diff.length > maxLen) {
    info(
      chalk13.yellow(
        `Diff is ${Math.round(diff.length / 1024)}KB \u2014 truncating to ${Math.round(maxLen / 1024)}KB for analysis.`
      )
    );
    diff = diff.slice(0, maxLen);
  }
  const spinner = ora8("Analyzing local changes with AI...").start();
  try {
    const client = createApiClient();
    const result = await client.saveDiff({
      projectSlug,
      diff
    });
    spinner.stop();
    if (result.analyzed === 0) {
      info("No significant feature-level changes detected in the diff.");
      return;
    }
    success(`Analyzed ${chalk13.bold(result.analyzed)} feature-level changes:`);
    console.log();
    for (const change of result.changes) {
      const imp = change.importance >= 8 ? chalk13.red("\u25CF") : change.importance >= 5 ? chalk13.yellow("\u25CF") : chalk13.dim("\u25CF");
      console.log(
        `  ${imp} ${chalk13.bold(change.feature_name)} ${chalk13.dim(`(${change.category})`)}`
      );
      console.log(`    ${change.summary}`);
      if (change.files_changed.length > 0) {
        console.log(
          `    ${chalk13.dim(change.files_changed.slice(0, 5).join(", "))}${change.files_changed.length > 5 ? chalk13.dim(` +${change.files_changed.length - 5} more`) : ""}`
        );
      }
      console.log();
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/push.ts
import { Command as Command12 } from "commander";
import chalk14 from "chalk";
import ora9 from "ora";
import { execSync as execSync3 } from "child_process";
var POLL_TIMEOUT_MS = 15 * 60 * 1e3;
var pushCommand = new Command12("push").description(
  "Push latest changes to Remb \u2014 verifies recent commits and triggers a cloud scan to update project context"
).option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("--force", "Skip git checks and trigger scan immediately", false).option("--no-progress", "Don't poll for scan progress (fire and forget)", false).addHelpText(
  "after",
  `
Examples:
  $ remb push
  $ remb push --force
  $ remb push --no-progress -p my-app`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  if (!opts.force) {
    const gitCheck = checkGitStatus();
    if (!gitCheck.ok) {
      error(gitCheck.message);
      process.exit(1);
    }
    if (gitCheck.warning) {
      warn(gitCheck.warning);
    }
    info(
      `${chalk14.dim("Branch:")} ${gitCheck.branch}  ${chalk14.dim("Latest commit:")} ${gitCheck.shortSha} \u2014 ${gitCheck.commitMessage}`
    );
    console.log();
  }
  const spinner = ora9("Triggering cloud scan...").start();
  try {
    const client = createApiClient();
    const result = await client.triggerScan(projectSlug);
    spinner.stop();
    console.log();
    switch (result.status) {
      case "started":
        success(result.message);
        if (result.scanId) {
          info(`${chalk14.dim("Scan ID:")} ${result.scanId.slice(0, 8)}`);
        }
        if (result.scanId && opts.progress !== false) {
          console.log();
          await pollScanProgress(client, result.scanId);
        } else {
          info(
            chalk14.dim(
              "The scan runs in the cloud \u2014 check the dashboard for progress."
            )
          );
        }
        break;
      case "already_running":
        warn(result.message);
        if (result.scanId && opts.progress !== false) {
          console.log();
          await pollScanProgress(client, result.scanId);
        }
        break;
      case "up_to_date":
        info(result.message);
        break;
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});
async function pollScanProgress(client, scanId) {
  const spinner = ora9({ text: "Waiting for scan to start...", prefixText: "" }).start();
  let lastLogCount = 0;
  const printedFiles = /* @__PURE__ */ new Set();
  const pollStart = Date.now();
  while (true) {
    if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
      spinner.stop();
      warn("Scan appears to have timed out. Check the dashboard for status.");
      break;
    }
    await sleep2(2e3);
    let status;
    try {
      status = await client.getScanStatus(scanId);
    } catch {
      continue;
    }
    if (status.status === "queued") {
      spinner.text = "Scan queued, waiting to start...";
      continue;
    }
    if (status.status === "running") {
      const pct = status.percentage;
      const bar = progressBar(pct, 20);
      spinner.text = `Scanning ${bar} ${chalk14.bold(`${pct}%`)} ${chalk14.dim(`(${status.filesScanned}/${status.filesTotal} files)`)}`;
      if (status.logs.length > lastLogCount) {
        const newLogs = status.logs.slice(lastLogCount);
        for (const log of newLogs) {
          if (printedFiles.has(log.file)) continue;
          printedFiles.add(log.file);
          spinner.stop();
          const icon = log.status === "done" ? chalk14.green("\u2713") : log.status === "skipped" ? chalk14.dim("\u25CB") : log.status === "error" ? chalk14.red("\u2717") : chalk14.yellow("\u280B");
          const feature = log.feature ? chalk14.cyan(` \u2192 ${log.feature}`) : "";
          const msg = log.message && log.status === "error" ? chalk14.red(` (${log.message})`) : "";
          console.log(`  ${icon} ${chalk14.dim(truncatePath(log.file, 50))}${feature}${msg}`);
          spinner.start();
        }
        lastLogCount = status.logs.length;
      }
      continue;
    }
    spinner.stop();
    console.log();
    if (status.status === "done") {
      const dur = status.durationMs > 0 ? formatDuration(status.durationMs) : "";
      success(
        `Scan complete \u2014 ${chalk14.bold(status.featuresCreated)} features from ${chalk14.bold(status.filesScanned)} files` + (dur ? ` ${chalk14.dim(`in ${dur}`)}` : "")
      );
      if (status.errors > 0) {
        warn(`${status.errors} file(s) had errors during scanning.`);
      }
    } else if (status.status === "failed") {
      error("Scan failed. Check the dashboard for details.");
    }
    break;
  }
}
function progressBar(pct, width) {
  const filled = Math.round(pct / 100 * width);
  const empty = width - filled;
  return chalk14.green("\u2588".repeat(filled)) + chalk14.dim("\u2591".repeat(empty));
}
function truncatePath(p, maxLen) {
  if (p.length <= maxLen) return p;
  return "\u2026" + p.slice(-(maxLen - 1));
}
function formatDuration(ms) {
  const secs = Math.round(ms / 1e3);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}
function sleep2(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function checkGitStatus() {
  try {
    execSync3("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
  } catch {
    return {
      ok: false,
      message: "Not inside a git repository. Run this command from your project root.",
      branch: "",
      shortSha: "",
      commitMessage: ""
    };
  }
  let branch;
  try {
    branch = execSync3("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim();
  } catch {
    branch = "unknown";
  }
  let shortSha;
  let commitMessage;
  try {
    shortSha = execSync3("git rev-parse --short HEAD", { stdio: "pipe" }).toString().trim();
    commitMessage = execSync3("git log -1 --format=%s", { stdio: "pipe" }).toString().trim();
  } catch {
    return {
      ok: false,
      message: "No commits found. Make at least one commit before pushing.",
      branch,
      shortSha: "",
      commitMessage: ""
    };
  }
  let warning;
  try {
    const status = execSync3("git status --porcelain", { stdio: "pipe" }).toString().trim();
    if (status) {
      warning = `You have uncommitted changes. Only pushed commits will be scanned.`;
    }
  } catch {
  }
  try {
    const localSha = execSync3("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
    const remoteBranch = `origin/${branch}`;
    const remoteSha = execSync3(`git rev-parse ${remoteBranch}`, { stdio: "pipe" }).toString().trim();
    if (localSha !== remoteSha) {
      warning = `Local branch is ahead of remote. Run ${chalk14.bold("git push")} first so the cloud scanner has your latest code.`;
    }
  } catch {
  }
  return { ok: true, message: "", warning, branch, shortSha, commitMessage };
}

// src/commands/history.ts
import { Command as Command13 } from "commander";
import chalk15 from "chalk";
import ora10 from "ora";
var historyCommand = new Command13("history").description("View conversation history \u2014 what AI discussed and did across sessions").option("-s, --search <query>", "Semantic search across conversation history").option("-d, --date <date>", "Filter by specific date (YYYY-MM-DD)").option("--from <date>", "Start date filter (YYYY-MM-DD)").option("--to <date>", "End date filter (YYYY-MM-DD)").option("-l, --limit <n>", "Max entries to show", "20").option("-p, --project <slug>", "Filter by project slug").option("--format <fmt>", "Output format: timeline (default), markdown, json", "timeline").addHelpText(
  "after",
  `
Examples:
  $ remb history
  $ remb history -d 2025-01-15
  $ remb history --search "authentication flow"
  $ remb history --from 2025-01-01 --to 2025-01-31 --format json`
).action(async (opts) => {
  if (opts.date) validateDateFormat(opts.date, "--date");
  if (opts.from) validateDateFormat(opts.from, "--from");
  if (opts.to) validateDateFormat(opts.to, "--to");
  if (opts.from && opts.to && opts.from > opts.to) {
    console.error(chalk15.red("\u2716") + " --from date cannot be after --to date.");
    process.exit(1);
  }
  const limit = parseInt(opts.limit, 10) || 20;
  validatePositiveInt(limit, "Limit", 200);
  const spinner = ora10("Loading conversation history...").start();
  try {
    const client = createApiClient();
    const projectSlug = opts.project;
    if (opts.search) {
      spinner.text = "Searching conversations...";
      const { results } = await client.searchConversations({
        query: opts.search,
        projectSlug,
        limit
      });
      spinner.stop();
      if (results.length === 0) {
        console.log(chalk15.dim("  No matching conversations found."));
        return;
      }
      if (opts.format === "json") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      console.log();
      console.log(chalk15.bold(`  Search results for "${opts.search}"`));
      console.log(chalk15.dim(`  ${results.length} matches
`));
      for (const r of results) {
        const date = chalk15.dim(r.created_at.slice(0, 10));
        const time = chalk15.dim(r.created_at.slice(11, 16));
        const sim = chalk15.green(`${(r.similarity * 100).toFixed(0)}%`);
        const tags = r.tags?.length ? chalk15.blue(` [${r.tags.join(", ")}]`) : "";
        const proj = r.project_slug ? chalk15.dim(` (${r.project_slug})`) : "";
        console.log(`  ${date} ${time} ${sim}${proj}${tags}`);
        console.log(`    ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`);
        console.log();
      }
      return;
    }
    let startDate;
    let endDate;
    if (opts.date) {
      startDate = `${opts.date}T00:00:00Z`;
      endDate = `${opts.date}T23:59:59Z`;
    } else {
      if (opts.from) startDate = `${opts.from}T00:00:00Z`;
      if (opts.to) endDate = `${opts.to}T23:59:59Z`;
    }
    if (opts.format === "json") {
      const result2 = await client.getConversationHistory({
        projectSlug,
        startDate,
        endDate,
        limit,
        format: "json"
      });
      spinner.stop();
      console.log(JSON.stringify(result2.entries, null, 2));
      return;
    }
    if (opts.format === "markdown") {
      const result2 = await client.getConversationHistory({
        projectSlug,
        startDate,
        endDate,
        limit,
        format: "json"
      });
      spinner.stop();
      printMarkdown(result2.entries);
      return;
    }
    const result = await client.getConversationHistory({
      projectSlug,
      startDate,
      endDate,
      limit,
      format: "json"
    });
    spinner.stop();
    if (result.entries.length === 0) {
      console.log(chalk15.dim("  No conversation history. AI sessions log here automatically via MCP."));
      return;
    }
    console.log();
    console.log(chalk15.bold("  Conversation History"));
    console.log(chalk15.dim(`  ${result.total} entries
`));
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of result.entries) {
      const date = entry.created_at.slice(0, 10);
      const list = grouped.get(date) ?? [];
      list.push(entry);
      grouped.set(date, list);
    }
    for (const [date, entries] of grouped) {
      console.log(chalk15.bold.blue(`  ${date}`));
      for (const e of entries) {
        const time = chalk15.dim(e.created_at.slice(11, 16));
        const icon = e.type === "tool_call" ? chalk15.yellow("\u26A1") : e.type === "milestone" ? chalk15.green("\u25C6") : chalk15.cyan("\u25CF");
        const src = e.source !== "mcp" ? chalk15.dim(` [${e.source}]`) : "";
        console.log(`    ${time} ${icon}${src} ${e.content}`);
      }
      console.log();
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});
function printMarkdown(entries) {
  if (entries.length === 0) {
    console.log("No conversation history. AI sessions log here automatically via MCP.");
    return;
  }
  const chronological = [...entries].reverse();
  const grouped = /* @__PURE__ */ new Map();
  for (const entry of chronological) {
    const date = entry.created_at.slice(0, 10);
    const list = grouped.get(date) ?? [];
    list.push(entry);
    grouped.set(date, list);
  }
  console.log("# Conversation History\n");
  for (const [date, dayEntries] of grouped) {
    console.log(`## ${date}
`);
    for (const e of dayEntries) {
      const time = e.created_at.slice(11, 16);
      const icon = e.type === "tool_call" ? "\u{1F527}" : e.type === "milestone" ? "\u{1F3C1}" : "\u{1F4AC}";
      const src = e.source !== "mcp" ? ` [${e.source}]` : "";
      console.log(`- **${time}** ${icon}${src} ${e.content}`);
    }
    console.log();
  }
}

// src/index.ts
var program = new Command14();
program.name("remb").description(
  "Persistent memory layer for AI coding sessions \u2014 save, retrieve, and visualize project context."
).version("0.1.5", "-v, --version").configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => chalk16.bold(cmd.name())
});
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(initCommand);
program.addCommand(saveCommand);
program.addCommand(getCommand);
program.addCommand(contextCommand);
program.addCommand(diffCommand);
program.addCommand(pushCommand);
program.addCommand(scanCommand);
program.addCommand(linkCommand);
program.addCommand(memoryCommand);
program.addCommand(historyCommand);
program.addCommand(projectsCommand);
program.addCommand(serveCommand);
program.exitOverride();
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err && typeof err === "object" && "exitCode" in err && err.exitCode === 0) {
      process.exit(0);
    }
    if (err instanceof Error && err.message) {
      console.error(`${chalk16.red("\u2716")} ${err.message}`);
    }
    process.exit(1);
  }
}
main();
//# sourceMappingURL=index.js.map