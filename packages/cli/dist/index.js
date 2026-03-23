#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
var init_credentials = __esm({
  "src/lib/credentials.ts"() {
    "use strict";
  }
});

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
var init_output = __esm({
  "src/lib/output.ts"() {
    "use strict";
  }
});

// src/lib/config.ts
import { resolve as resolve2, dirname as dirname2 } from "path";
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
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
function writeProjectConfig(dir, config4) {
  const filePath = resolve2(dir, CONFIG_FILENAME);
  const lines = [
    "# Remb project configuration",
    `# Generated by remb init`,
    "",
    `project: ${config4.project}`,
    `api_url: ${config4.api_url}`
  ];
  if (config4.ide) lines.push(`ide: ${config4.ide}`);
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
var CONFIG_FILENAME, DEFAULT_API_URL;
var init_config = __esm({
  "src/lib/config.ts"() {
    "use strict";
    CONFIG_FILENAME = ".remb.yml";
    DEFAULT_API_URL = "https://www.useremb.com";
  }
});

// src/lib/api-client.ts
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
  const baseUrl = (opts.apiUrl ?? projectConfig?.config.api_url ?? "https://www.useremb.com").replace(/\/+$/, "");
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
      const BATCH_SIZE2 = 5;
      const results = [];
      const run = async () => {
        for (let i = 0; i < entries.length; i += BATCH_SIZE2) {
          const chunk = entries.slice(i, i + BATCH_SIZE2);
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
    },
    /** POST /api/cli/conversations/smart — smart conversation logging with raw IDE events */
    logSmartConversation(params) {
      return request("POST", "/api/cli/conversations/smart", params);
    },
    /** GET /api/cli/plans — get active plans with phases */
    getPlans(projectSlug) {
      return request("GET", "/api/cli/plans", void 0, { projectSlug });
    },
    /** POST /api/cli/plans — update a phase status */
    updatePlanPhase(params) {
      return request("POST", "/api/cli/plans", params);
    }
  };
}
var ApiError, MAX_RETRIES, REQUEST_TIMEOUT_MS, RETRY_BACKOFF;
var init_api_client = __esm({
  "src/lib/api-client.ts"() {
    "use strict";
    init_credentials();
    init_config();
    ApiError = class extends Error {
      constructor(statusCode, message, body) {
        super(message);
        this.statusCode = statusCode;
        this.body = body;
        this.name = "ApiError";
      }
    };
    MAX_RETRIES = 3;
    REQUEST_TIMEOUT_MS = 3e4;
    RETRY_BACKOFF = [1e3, 2e3, 4e3];
  }
});

// src/lib/shared.ts
import chalk2 from "chalk";
function resolveProject(flag) {
  if (flag) return flag;
  const config4 = findProjectConfig();
  if (config4?.config.project) return config4.config.project;
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
var init_shared = __esm({
  "src/lib/shared.ts"() {
    "use strict";
    init_config();
    init_api_client();
    init_output();
  }
});

// src/commands/skills.ts
var skills_exports = {};
__export(skills_exports, {
  installSkillsAfterInit: () => installSkillsAfterInit,
  skillsCommand: () => skillsCommand
});
import { Command as Command2 } from "commander";
import chalk4 from "chalk";
import { resolve as resolve3 } from "path";
import {
  existsSync as existsSync3,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync3,
  writeFileSync as writeFileSync3,
  rmSync,
  readdirSync
} from "fs";
function parseFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { body: content };
  }
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return { body: content };
  const yamlBlock = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 3).trim();
  const result = { body };
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key === "name") result.name = value;
    if (key === "version") result.version = value;
    if (key === "description") result.description = value;
  }
  return result;
}
async function fetchSkillsList() {
  const url = `${GITHUB_API}/repos/${SKILLS_REPO_OWNER}/${SKILLS_REPO_NAME}/contents`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills list: ${res.status} ${res.statusText}`);
  }
  const items = await res.json();
  const dirs = items.filter(
    (i) => i.type === "dir" && i.name.startsWith("remb-")
  );
  const skills = [];
  for (const dir of dirs) {
    try {
      const content = await fetchSkillContent(dir.name);
      const fm = parseFrontmatter(content);
      skills.push({
        name: dir.name,
        description: fm.description || "No description",
        version: fm.version || "unknown"
      });
    } catch {
      skills.push({
        name: dir.name,
        description: "Unable to fetch description",
        version: "unknown"
      });
    }
  }
  return skills;
}
async function fetchSkillContent(skillName) {
  const url = `${GITHUB_RAW}/${SKILLS_REPO_OWNER}/${SKILLS_REPO_NAME}/main/${skillName}/SKILL.md`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skill ${skillName}: ${res.status}`);
  }
  return res.text();
}
function detectIDEs(cwd) {
  const detected = [];
  const env = process.env;
  if (env.TERM_PROGRAM === "vscode" || env.VSCODE_PID) detected.push("vscode");
  if (env.TERM_PROGRAM === "cursor") detected.push("cursor");
  if (env.TERM_PROGRAM?.toLowerCase() === "windsurf") detected.push("windsurf");
  if (env.CLAUDE_CODE === "1" || env.TERM_PROGRAM === "claude") detected.push("claude");
  if (existsSync3(resolve3(cwd, ".github"))) {
    if (!detected.includes("vscode")) detected.push("vscode");
  }
  if (existsSync3(resolve3(cwd, ".cursor"))) {
    if (!detected.includes("cursor")) detected.push("cursor");
  }
  if (existsSync3(resolve3(cwd, ".windsurf")) || existsSync3(resolve3(cwd, ".windsurfrules"))) {
    if (!detected.includes("windsurf")) detected.push("windsurf");
  }
  if (existsSync3(resolve3(cwd, "CLAUDE.md")) || existsSync3(resolve3(cwd, ".claude"))) {
    if (!detected.includes("claude")) detected.push("claude");
  }
  if (detected.length === 0) {
    return ["vscode", "cursor", "windsurf", "claude"];
  }
  return detected;
}
function getInstalledSkills(cwd) {
  const config4 = findProjectConfig(cwd);
  if (!config4) return [];
  const configPath = resolve3(config4.dir, ".remb.yml");
  if (!existsSync3(configPath)) return [];
  const raw = readFileSync3(configPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("skills:")) {
      const value = trimmed.slice("skills:".length).trim();
      if (!value) return [];
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
function updateInstalledSkills(cwd, skills) {
  const config4 = findProjectConfig(cwd);
  if (!config4) return;
  const configPath = resolve3(config4.dir, ".remb.yml");
  if (!existsSync3(configPath)) return;
  let raw = readFileSync3(configPath, "utf-8");
  const skillsLine = `skills: ${skills.join(", ")}`;
  const lines = raw.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("skills:"));
  if (idx !== -1) {
    lines[idx] = skillsLine;
  } else {
    lines.push(skillsLine);
  }
  raw = lines.join("\n");
  if (!raw.endsWith("\n")) raw += "\n";
  writeFileSync3(configPath, raw, "utf-8");
}
function installSkillForIDE(cwd, skillName, content, target) {
  const dir = target.dir(cwd, skillName);
  const filename = target.filename(skillName);
  const filePath = resolve3(dir, filename);
  const finalContent = target.transform ? target.transform(content, skillName) : content;
  mkdirSync3(dir, { recursive: true });
  writeFileSync3(filePath, finalContent, "utf-8");
  return filePath;
}
function uninstallSkillForIDE(cwd, skillName, target) {
  const dir = target.dir(cwd, skillName);
  const filename = target.filename(skillName);
  const filePath = resolve3(dir, filename);
  if (existsSync3(filePath)) {
    rmSync(filePath);
    try {
      const remaining = readdirSync(dir);
      if (remaining.length === 0) {
        rmSync(dir, { recursive: true });
      }
    } catch {
    }
    return true;
  }
  return false;
}
function addSkillsToGitignore(cwd) {
  const gitignorePath = resolve3(cwd, ".gitignore");
  const entries = [
    "# Remb skills (managed by remb skills add)",
    ".github/copilot-skills/",
    ".claude/commands/remb-*/"
  ];
  if (!existsSync3(gitignorePath)) return;
  const existing = readFileSync3(gitignorePath, "utf-8");
  if (existing.includes(".github/copilot-skills/")) return;
  const addition = "\n" + entries.join("\n") + "\n";
  writeFileSync3(gitignorePath, existing + addition, "utf-8");
}
async function installSkillsAfterInit(cwd, ide) {
  const detectedIDEs = ide === "all" ? ["vscode", "cursor", "windsurf", "claude"] : [ide];
  const targetIDEs = IDE_TARGETS.filter((t) => detectedIDEs.includes(t.ide));
  if (targetIDEs.length === 0) return;
  const installed = [];
  for (const skillName of RECOMMENDED_SKILLS) {
    try {
      const content = await fetchSkillContent(skillName);
      for (const target of targetIDEs) {
        installSkillForIDE(cwd, skillName, content, target);
      }
      installed.push(skillName);
      success(`Installed skill: ${skillName}`);
    } catch {
      warn(`Could not install skill: ${skillName}`);
    }
  }
  if (installed.length > 0) {
    updateInstalledSkills(cwd, installed);
    addSkillsToGitignore(cwd);
  }
}
var SKILLS_REPO_OWNER, SKILLS_REPO_NAME, GITHUB_API, GITHUB_RAW, KNOWN_SKILLS, IDE_TARGETS, skillsCommand, RECOMMENDED_SKILLS;
var init_skills = __esm({
  "src/commands/skills.ts"() {
    "use strict";
    init_config();
    init_output();
    SKILLS_REPO_OWNER = "samie105";
    SKILLS_REPO_NAME = "skills";
    GITHUB_API = "https://api.github.com";
    GITHUB_RAW = "https://raw.githubusercontent.com";
    KNOWN_SKILLS = [
      "remb-setup",
      "remb-context",
      "remb-memory",
      "remb-scan",
      "remb-import",
      "remb-cross-project"
    ];
    IDE_TARGETS = [
      {
        ide: "claude",
        dir: (cwd, skillName) => resolve3(cwd, ".claude", "commands", skillName),
        filename: () => "SKILL.md"
      },
      {
        ide: "vscode",
        dir: (cwd, _skillName) => resolve3(cwd, ".github", "copilot-skills"),
        filename: (skillName) => `${skillName}.md`,
        transform: (content) => {
          const yamlEnd = content.indexOf("---", 4);
          if (yamlEnd === -1) return content;
          const frontmatter = content.slice(0, yamlEnd + 3);
          const body = content.slice(yamlEnd + 3);
          return frontmatter.replace("---\n", "---\napplyTo: '**'\n") + body;
        }
      },
      {
        ide: "cursor",
        dir: (cwd, _skillName) => resolve3(cwd, ".cursor", "rules"),
        filename: (skillName) => `${skillName}.mdc`,
        transform: (content, skillName) => {
          const parsed = parseFrontmatter(content);
          return [
            "---",
            `description: ${parsed.description || skillName}`,
            "globs: **",
            "alwaysApply: true",
            "---",
            "",
            parsed.body
          ].join("\n");
        }
      },
      {
        ide: "windsurf",
        dir: (cwd, _skillName) => resolve3(cwd, ".windsurf", "rules"),
        filename: (skillName) => `${skillName}.md`
      }
    ];
    skillsCommand = new Command2("skills").description("Install and manage Remb skills for your IDE").addHelpText(
      "after",
      `
Examples:
  remb skills list                  List available skills
  remb skills add remb-context      Install a skill
  remb skills add --all             Install all skills
  remb skills remove remb-context   Remove a skill
  remb skills update                Update all installed skills`
    );
    skillsCommand.command("list").description("List available Remb skills").action(async () => {
      try {
        info("Fetching skills from GitHub...");
        const skills = await fetchSkillsList();
        const installed = getInstalledSkills(process.cwd());
        console.log();
        console.log(chalk4.bold("Available Remb Skills"));
        console.log(chalk4.dim("\u2500".repeat(60)));
        for (const skill of skills) {
          const isInstalled = installed.includes(skill.name);
          const status = isInstalled ? chalk4.green(" [installed]") : "";
          console.log(
            `  ${chalk4.cyan(skill.name)}${status}  ${chalk4.dim(`v${skill.version}`)}`
          );
          console.log(`    ${skill.description}`);
          console.log();
        }
        console.log(
          chalk4.dim(`Install a skill: ${chalk4.bold("remb skills add <name>")}`)
        );
      } catch (err) {
        error2(`Failed to list skills: ${err.message}`);
        process.exit(1);
      }
    });
    skillsCommand.command("add [name]").description("Install a Remb skill into your IDE").option("--all", "Install all available skills").option("--ide <ide>", "Target specific IDE: vscode, cursor, windsurf, claude").action(async (name, opts) => {
      const cwd = process.cwd();
      if (!name && !opts.all) {
        error2("Specify a skill name or use --all to install all skills.");
        console.log(chalk4.dim("  Run `remb skills list` to see available skills."));
        process.exit(1);
      }
      const skillNames = opts.all ? [...KNOWN_SKILLS] : [name];
      for (const sn of skillNames) {
        if (!KNOWN_SKILLS.includes(sn)) {
          warn(`Unknown skill: ${sn}. Attempting to fetch anyway...`);
        }
      }
      const targetIDEs = opts.ide ? IDE_TARGETS.filter((t) => t.ide === opts.ide) : IDE_TARGETS.filter((t) => detectIDEs(cwd).includes(t.ide));
      if (targetIDEs.length === 0) {
        error2("No target IDEs detected. Use --ide to specify one.");
        process.exit(1);
      }
      const installed = getInstalledSkills(cwd);
      for (const skillName of skillNames) {
        try {
          info(`Downloading ${chalk4.cyan(skillName)}...`);
          const content = await fetchSkillContent(skillName);
          for (const target of targetIDEs) {
            const filePath = installSkillForIDE(cwd, skillName, content, target);
            if (filePath) {
              const rel = filePath.replace(cwd + "/", "");
              console.log(`  ${chalk4.green("\u2713")} ${target.ide}: ${chalk4.dim(rel)}`);
            }
          }
          if (!installed.includes(skillName)) {
            installed.push(skillName);
          }
          success(`Installed ${skillName}`);
        } catch (err) {
          error2(`Failed to install ${skillName}: ${err.message}`);
        }
      }
      updateInstalledSkills(cwd, installed);
      addSkillsToGitignore(cwd);
    });
    skillsCommand.command("remove <name>").description("Remove an installed Remb skill").action(async (name) => {
      const cwd = process.cwd();
      let removed = false;
      for (const target of IDE_TARGETS) {
        if (uninstallSkillForIDE(cwd, name, target)) {
          console.log(`  ${chalk4.green("\u2713")} Removed from ${target.ide}`);
          removed = true;
        }
      }
      if (removed) {
        const installed = getInstalledSkills(cwd).filter((s) => s !== name);
        updateInstalledSkills(cwd, installed);
        success(`Removed ${name}`);
      } else {
        warn(`Skill ${name} was not found in any IDE directory.`);
      }
    });
    skillsCommand.command("update").description("Update all installed skills to their latest versions").action(async () => {
      const cwd = process.cwd();
      const installed = getInstalledSkills(cwd);
      if (installed.length === 0) {
        info("No skills installed. Run `remb skills add <name>` to install one.");
        return;
      }
      info(`Updating ${installed.length} skill(s)...`);
      const targetIDEs = IDE_TARGETS.filter(
        (t) => detectIDEs(cwd).includes(t.ide)
      );
      for (const skillName of installed) {
        try {
          const content = await fetchSkillContent(skillName);
          for (const target of targetIDEs) {
            installSkillForIDE(cwd, skillName, content, target);
          }
          success(`Updated ${skillName}`);
        } catch (err) {
          error2(`Failed to update ${skillName}: ${err.message}`);
        }
      }
    });
    RECOMMENDED_SKILLS = ["remb-context", "remb-memory", "remb-scan"];
  }
});

// src/lib/scanner.ts
import { readFileSync as readFileSync5, statSync, existsSync as existsSync5 } from "fs";
import { resolve as resolve5, extname, basename as basename3, dirname as dirname3 } from "path";
import { glob } from "glob";
async function scanDirectory(opts) {
  const {
    path: scanPath,
    depth = 5,
    ignore = [],
    maxFileSize = 1e5
    // 100KB per file
  } = opts;
  const rootDir = resolve5(scanPath);
  if (!existsSync5(rootDir) || !statSync(rootDir).isDirectory()) {
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
    const fullPath = resolve5(rootDir, file);
    const stat = statSync(fullPath);
    if (stat.size > maxFileSize || stat.size === 0) continue;
    const raw = readFileSync5(fullPath, "utf-8");
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
    const featureName = dir === "." ? basename3(rootDir) : dir.replace(/\//g, "-");
    const fileSummaries = groupFiles.map((f) => {
      const preview = f.content.length > 500 ? f.content.slice(0, 500) + "\n... (truncated)" : f.content;
      return `### ${f.relativePath}
\`\`\`${f.language}
${preview}
\`\`\``;
    });
    const entryContent = [
      `# Directory: ${dir === "." ? basename3(rootDir) : dir}`,
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
var DEFAULT_IGNORE, SOURCE_EXTENSIONS;
var init_scanner = __esm({
  "src/lib/scanner.ts"() {
    "use strict";
    DEFAULT_IGNORE = [
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
    SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
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
  }
});

// src/commands/scan.ts
var scan_exports = {};
__export(scan_exports, {
  scanCommand: () => scanCommand
});
import { Command as Command6 } from "commander";
import chalk8 from "chalk";
import ora3 from "ora";
import { execSync as execSync2 } from "child_process";
async function runServerScan(opts) {
  const projectSlug = resolveProject(opts.project);
  const client = createApiClient();
  if (!opts.force) {
    const git = checkGitStatus();
    if (git.ok) {
      info(
        `${chalk8.dim("Branch:")} ${git.branch}  ${chalk8.dim("Latest commit:")} ${git.shortSha} \u2014 ${git.commitMessage}`
      );
      if (git.warning) warn(git.warning);
      console.log();
    }
  }
  const spinner = ora3(`Checking ${chalk8.bold(projectSlug)} for changes...`).start();
  try {
    const result = await client.triggerScan(projectSlug);
    if (result.status === "up_to_date") {
      spinner.succeed(chalk8.green("Already up to date \u2014 no new commits since last scan."));
      return;
    }
    if (result.status === "already_running") {
      spinner.info("A scan is already running for this project.");
      if (result.scanId && opts.poll) {
        await pollScan(client, result.scanId);
      }
      return;
    }
    if (!result.scanId) {
      spinner.fail("Failed to start scan \u2014 no scan ID returned.");
      return;
    }
    spinner.succeed(`Scan started for ${chalk8.bold(projectSlug)}`);
    if (!opts.poll) {
      info(`Scan ID: ${chalk8.dim(result.scanId)}`);
      info(`Run ${chalk8.bold(`remb scan -p ${projectSlug}`)} to check progress.`);
      return;
    }
    await pollScan(client, result.scanId);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
}
async function pollScan(client, scanId) {
  console.log();
  const spinner = ora3("Initializing...").start();
  const seenFiles = /* @__PURE__ */ new Set();
  let lastFeature = "";
  let shownMachineInfo = false;
  while (true) {
    try {
      const status = await client.getScanStatus(scanId);
      if (!shownMachineInfo && status.machine) {
        spinner.stop();
        info(`Worker: ${chalk8.bold(status.machine)}${status.estimatedFiles ? ` (${status.estimatedFiles} files` + (status.estimatedSizeKB ? `, ~${status.estimatedSizeKB >= 1024 ? (status.estimatedSizeKB / 1024).toFixed(1) + "MB" : status.estimatedSizeKB + "KB"}` : "}") + ")" : ""}`);
        spinner.start();
        shownMachineInfo = true;
      }
      if (status.status === "done") {
        spinner.stop();
        printScanSummary(status);
        return;
      }
      if (status.status === "failed") {
        spinner.fail(chalk8.red("Scan failed."));
        const logs = status.logs ?? [];
        const errorLogs = logs.filter((l) => l.status === "error");
        if (errorLogs.length > 0) {
          for (const log of errorLogs.slice(-3)) {
            console.log(`  ${chalk8.red("\u2717")} ${log.file} \u2014 ${log.message ?? "unknown error"}`);
          }
        }
        process.exit(1);
      }
      const pct = status.percentage ?? 0;
      const bar = renderProgressBar(pct, 24);
      const fileInfo = status.filesScanned != null && status.filesTotal ? `${status.filesScanned}/${status.filesTotal} files` : "";
      const newLogs = (status.logs ?? []).filter(
        (l) => l.status === "done" && l.file && !seenFiles.has(l.file)
      );
      for (const log of newLogs) {
        seenFiles.add(log.file);
        if (log.feature) lastFeature = log.feature;
      }
      const featureStr = lastFeature ? ` ${chalk8.dim("\u2192")} ${chalk8.cyan(lastFeature)}` : "";
      spinner.text = `${bar} ${fileInfo}${featureStr}`;
    } catch {
    }
    await sleep2(3e3);
  }
}
function renderProgressBar(pct, width) {
  const filled = Math.round(pct / 100 * width);
  const empty = width - filled;
  return `${chalk8.green("\u2588".repeat(filled))}${chalk8.dim("\u2591".repeat(empty))} ${chalk8.bold(`${pct}%`)}`;
}
function printScanSummary(status) {
  console.log();
  success("Scan complete!");
  console.log();
  keyValue("  Files scanned", `${status.filesScanned}/${status.filesTotal}`);
  keyValue("  Features found", String(status.featuresCreated));
  if (status.errors > 0) {
    keyValue("  Errors", chalk8.yellow(String(status.errors)));
  }
  keyValue("  Duration", formatDuration(status.durationMs));
  if (status.machine) {
    keyValue("  Worker", status.machine);
  }
  const features = /* @__PURE__ */ new Set();
  for (const log of status.logs ?? []) {
    if (log.feature && log.status === "done") features.add(log.feature);
  }
  if (features.size > 0) {
    console.log();
    info("Features discovered:");
    for (const f of features) {
      console.log(`  ${chalk8.cyan("\u25CF")} ${f}`);
    }
  }
  console.log();
}
function formatDuration(ms) {
  if (ms < 1e3) return `${ms}ms`;
  const seconds = Math.round(ms / 1e3);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
function sleep2(ms) {
  return new Promise((resolve7) => setTimeout(resolve7, ms));
}
async function runLocalScan(opts) {
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
        `Found ${chalk8.bold(files.length)} files \u2014 consider using ${chalk8.bold("--ignore")} to exclude test directories.`
      );
    }
    console.log();
    info(`Found ${chalk8.bold(files.length)} source files across ${chalk8.bold(results.length)} directories.`);
    console.log();
    for (const result of results) {
      console.log(
        `  ${chalk8.cyan("\u25CF")} ${chalk8.bold(result.featureName)} \u2014 ${result.tags.filter((t) => t !== "auto-scan").join(", ")} \u2014 ${(result.content.length / 1e3).toFixed(1)}KB`
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
      uploadSpinner.text = `Saving context entries... ${chalk8.bold(`${done}/${total}`)}`;
    });
    uploadSpinner.stop();
    console.log();
    success(
      `Uploaded ${chalk8.bold(saved.length)} context entries to ${chalk8.bold(projectSlug)}`
    );
    for (const entry of saved) {
      keyValue("  " + entry.featureName, entry.id.slice(0, 8));
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
}
function checkGitStatus() {
  try {
    execSync2("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
  } catch {
    return { ok: false, branch: "", shortSha: "", commitMessage: "" };
  }
  let branch;
  try {
    branch = execSync2("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" }).toString().trim();
  } catch {
    branch = "unknown";
  }
  let shortSha;
  let commitMessage;
  try {
    shortSha = execSync2("git rev-parse --short HEAD", { stdio: "pipe" }).toString().trim();
    commitMessage = execSync2("git log -1 --format=%s", { stdio: "pipe" }).toString().trim();
  } catch {
    return { ok: false, branch, shortSha: "", commitMessage: "" };
  }
  let warning;
  try {
    const status = execSync2("git status --porcelain", { stdio: "pipe" }).toString().trim();
    if (status) {
      warning = "You have uncommitted changes. Only pushed commits will be scanned.";
    }
  } catch {
  }
  try {
    const localSha = execSync2("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
    const remoteSha = execSync2(`git rev-parse origin/${branch}`, { stdio: "pipe" }).toString().trim();
    if (localSha !== remoteSha) {
      warning = `Local branch is ahead of remote. Run ${chalk8.bold("git push")} first so the cloud scanner has your latest code.`;
    }
  } catch {
  }
  return { ok: true, branch, shortSha, commitMessage, warning };
}
var scanCommand;
var init_scan = __esm({
  "src/commands/scan.ts"() {
    "use strict";
    init_api_client();
    init_scanner();
    init_output();
    init_shared();
    scanCommand = new Command6("scan").description("Scan your project to extract features and context").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("--local", "Scan local files instead of GitHub repository", false).option("--path <directory>", "Directory path for local scan", ".").option("-d, --depth <n>", "Max recursion depth for local scan", "5").option("--ignore <patterns>", "Comma-separated glob patterns to ignore", "").option("--dry-run", "Preview what would be scanned without saving", false).option("--no-poll", "Trigger scan without waiting for completion", false).option("--force", "Skip git checks and trigger scan immediately", false).addHelpText(
      "after",
      `
Examples:
  $ remb scan                        # Smart scan via GitHub (recommended)
  $ remb scan --local                # Scan local files
  $ remb scan --local --path src     # Scan specific directory
  $ remb scan --no-poll              # Start scan and exit immediately
  $ remb scan --force                # Skip git pre-flight checks
  $ remb scan --local --dry-run      # Preview without saving`
    ).action(async (opts) => {
      if (opts.local) {
        await runLocalScan(opts);
      } else {
        await runServerScan(opts);
      }
    });
  }
});

// src/index.ts
import { Command as Command17 } from "commander";
import chalk19 from "chalk";

// src/commands/login.ts
init_credentials();
init_output();
init_config();
init_shared();
import { Command } from "commander";
import chalk3 from "chalk";
var DEFAULT_API_URL2 = "https://www.useremb.com";
function getBaseUrl() {
  const projectConfig = findProjectConfig();
  return (projectConfig?.config.api_url ?? DEFAULT_API_URL2).replace(/\/+$/, "");
}
async function openBrowser(url) {
  const { exec } = await import("child_process");
  const { platform: platform7 } = await import("os");
  const os = platform7();
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
  const existingKey = getApiKey();
  if (existingKey) {
    const isValid = await verifyExistingKey(existingKey);
    if (isValid) {
      console.log();
      success(`Already authenticated!`);
      keyValue("Key", `remb_...${existingKey.slice(-4)}`);
      keyValue("Credentials", getCredentialsFilePath());
      console.log();
      process.stdout.write(`  ${chalk3.bold("Re-authenticate anyway?")} ${chalk3.dim("[y/N]")}: `);
      const answer = await readLine();
      if (answer.toLowerCase() !== "y") {
        return;
      }
      console.log();
    }
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
    const ora12 = (await import("ora")).default;
    const spinner = ora12("Waiting for browser authentication...").start();
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
async function verifyExistingKey(apiKey) {
  try {
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}/api/cli/projects?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "remb-cli/0.1.0" },
      signal: AbortSignal.timeout(5e3)
    });
    return res.ok;
  } catch {
    return false;
  }
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
  const config4 = findProjectConfig();
  if (config4?.config?.project) {
    keyValue("Project", config4.config.project);
  }
  if (config4?.config?.api_url) {
    keyValue("API URL", config4.config.api_url);
  }
  if (!config4?.config?.project) {
    console.log(chalk3.dim("  No project configured. Run `remb init` to set up."));
  }
});

// src/commands/init.ts
init_config();
init_api_client();
init_credentials();
init_output();
import { Command as Command3 } from "commander";
import { resolve as resolve4, basename as basename2 } from "path";
import { existsSync as existsSync4, writeFileSync as writeFileSync4, mkdirSync as mkdirSync4, readFileSync as readFileSync4 } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";
import chalk5 from "chalk";
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

### remb scan
Trigger a cloud scan to extract features, code symbols, and architecture from your codebase. Uses a 5-phase AI pipeline (Scout \u2192 Analyze \u2192 Architect \u2192 Review \u2192 Finalize). Shows live progress in the terminal.

\`\`\`sh
remb scan                      # Cloud scan via GitHub (recommended)
remb scan --local              # Scan local files (no GitHub needed)
remb scan --local --path src/  # Scan specific subdirectory locally
remb scan -p <slug>            # Scan specific project
remb scan --force              # Skip git pre-flight checks
remb scan --no-poll            # Fire and forget (don't wait for results)
\`\`\`

**Pre-flight checks** (cloud scan): Verifies you're in a git repo, warns about uncommitted changes, checks if local is ahead of remote.

**Local scan** (\`--local\`): Reads files directly from disk, groups them by directory into context entries, and uploads the results. No GitHub access needed \u2014 works for offline repos, monorepos, and any directory structure.

**Live progress**: After triggering, polls for scan status and displays progress. During high load, scans queue; the status shows \`queued\` before \`running\`.

**Returns**: \`started\` | \`already_running\` | \`up_to_date\` | \`queued\`

**When to use cloud vs local**:
| Scenario | Use |
|---|---|
| Normal workflow (committed code) | \`remb scan\` |
| No GitHub remote / first setup | \`remb scan --local\` |
| Monorepo sub-project | \`remb scan --local --path packages/my-pkg\` |
| GitHub rate-limited or inaccessible | \`remb scan --local\` |

### remb push
Deprecated alias for \`remb scan\`. Kept for backward compatibility \u2014 use \`remb scan\` instead.

\`\`\`sh
remb push        # Same as: remb scan
\`\`\`

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

Remb exposes **42 MCP tools** via \`remb serve\` (or the hosted endpoint). Below is the complete list:

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
- \`remb__conversation_log\` \u2014 record what was discussed or accomplished
- \`remb__conversation_history\` \u2014 load recent conversation history

**Project & Context:**
- \`remb__projects_list\` \u2014 list all projects with feature counts
- \`remb__project_get\` \u2014 get project details, features, and latest scan
- \`remb__context_save\` \u2014 save a context entry for a feature
- \`remb__context_get\` \u2014 retrieve context entries (optional feature filter)
- \`remb__context_bundle\` \u2014 full project context as markdown

**Scanning & Analysis:**
- \`remb__scan_trigger\` \u2014 trigger a multi-agent cloud scan
- \`remb__scan_status\` \u2014 check scan progress
- \`remb__scan_on_push\` \u2014 trigger scan on git push
- \`remb__diff_analyze\` \u2014 analyze a git diff and save extracted changes

**Code Graph & Architecture:**
- \`remb__explore_code_graph\` \u2014 explore the code graph: functions, classes, layers, edges
- \`remb__search_code_symbols\` \u2014 semantic search across code symbols
- \`remb__graph_query\` \u2014 query the knowledge graph by entity or feature
- \`remb__graph_related\` \u2014 find related entities by name or context

**Plans & Workflow:**
- \`remb__plan_list\` \u2014 list development plans
- \`remb__plan_get\` \u2014 get plan details with phases
- \`remb__plan_create_phase\` \u2014 add a phase to a plan
- \`remb__plan_update_phase\` \u2014 update phase status (auto-completes plan when all done)
- \`remb__plan_complete\` \u2014 mark a plan as complete
- \`remb__plan_phases\` \u2014 list all phases for a plan

**Cross-Project:**
- \`remb__cross_project_search\` \u2014 search across ALL projects for features, context, and memories
- \`remb__cross_project_patterns\` \u2014 find patterns used across projects
- \`remb__context_bundle\` \u2014 also works with other project slugs to load another project's context

**Session & Protocol:**
- \`remb__session_start\` \u2014 signal session start; loads context automatically

### Cloud Scan Pipeline

When you run \`remb push\`, the server runs a 5-phase multi-agent pipeline:

1. **Scout** \u2014 Fetches file tree, downloads tarball, builds import graph, deduplicates against previous scans
2. **Analyze** \u2014 Parallel AI extraction (5 concurrent calls per tier): extracts features, code symbols (functions, classes, hooks, components), and edges (calls, imports, data flows)
3. **Architect** \u2014 LLM analyzes aggregated file summaries to produce semantic architecture layers (api, service, data, ui, auth, config, etc.)
4. **Review** \u2014 Resolves code edges to actual symbol IDs, validates graph integrity, optionally runs LLM for structural diagnostics
5. **Finalize** \u2014 Marks scan complete, schedules continuation if more files remain (max 10 passes)

The result is a rich knowledge graph stored across 4 tables: \`features\`, \`code_nodes\`, \`code_edges\`, \`project_layers\`.

### Code Graph

After scanning, your project has a queryable code graph:

- **code_nodes** \u2014 individual functions, classes, components, hooks with their parameters, return types, line numbers, complexity scores, and architecture layer
- **code_edges** \u2014 call/import/data-flow relationships between symbols
- **project_layers** \u2014 semantic architecture zones with auto-detected file patterns

The AI can explore this graph with \`explore_code_graph\` (filter by file, type, layer) and \`search_code_symbols\` (semantic search across all symbols).

### Plans

The AI can create and manage development plans:

\`\`\`
remb__plan_list           \u2192 see all plans for the project
remb__plan_get <id>       \u2192 phases, status, per-phase details
remb__plan_create_phase   \u2192 add a new phase to a plan
remb__plan_update_phase   \u2192 mark phase complete (auto-completes plan when all phases done)
\`\`\`

### Cross-Project Intelligence

Search memories and patterns across ALL your projects:

\`\`\`
remb__cross_project_search("authentication pattern")
\u2192 Returns memories, features, and context entries from every project that matches
\`\`\`

Load another project's full context to apply its patterns:

\`\`\`
remb__context_bundle("other-project-slug")
\u2192 Returns complete markdown context for that project
\`\`\`

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
var initCommand = new Command3("init").description("Initialize a project with remb tracking").argument("[project-name]", "Project name (defaults to directory name)").option("--api-url <url>", "API server URL", "https://www.useremb.com").option("--force", "Overwrite existing configuration", false).option(
  "--ide <ide>",
  "IDE to configure (vscode, cursor, windsurf, cline, jetbrains, claude, aider, all)"
).action(async (projectName, opts) => {
  const cwd = process.cwd();
  const name = projectName ?? basename2(cwd);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    error2("Invalid project name \u2014 must contain at least one alphanumeric character.");
    process.exit(1);
  }
  const existing = findProjectConfig(cwd);
  if (existing && !opts.force) {
    warn(`Already initialized at ${chalk5.dim(existing.dir + "/.remb.yml")}`);
    info(`Use ${chalk5.bold("--force")} to overwrite.`);
    return;
  }
  const ide = await resolveIde(opts.ide, existing?.config.ide);
  const filePath = writeProjectConfig(cwd, {
    project: slug,
    api_url: opts.apiUrl,
    ide
  });
  const agentMdPath = resolve4(cwd, "REMB.md");
  writeFileSync4(agentMdPath, generateAgentMd(slug, opts.apiUrl), "utf-8");
  console.log();
  success(`Project ${chalk5.bold(slug)} initialized!`);
  keyValue("Config", filePath);
  keyValue("Agent docs", agentMdPath);
  keyValue("Project", slug);
  keyValue("API URL", opts.apiUrl);
  keyValue("IDE", ide);
  console.log();
  let apiKey = getApiKey();
  if (!apiKey && process.stdout.isTTY) {
    console.log(
      chalk5.dim("  You're not signed in \u2014 signing in lets Remb register your project and sync context.")
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
      success(`Project registered on Remb ${chalk5.dim(`(${project.slug})`)}`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        info(`Project ${chalk5.bold(slug)} already exists on server \u2014 linked.`);
      } else {
        warn(`Could not register project on server: ${err instanceof Error ? err.message : "unknown error"}`);
        info(`You can register it later from the dashboard.`);
      }
    }
  } else if (!getApiKey()) {
    info(`Run ${chalk5.bold("remb login")} to register this project on the server.`);
  }
  const gitignorePath = resolve4(cwd, ".gitignore");
  if (existsSync4(gitignorePath)) {
    info(
      `${chalk5.dim("Tip:")} .remb.yml and REMB.md are safe to commit \u2014 they contain no secrets.`
    );
  }
  const injected = injectIntoIDEContextFiles(cwd, slug, opts.apiUrl, ide);
  if (injected.length > 0) {
    info(`AI context injected into: ${injected.map((p) => chalk5.dim(p)).join(", ")}`);
  }
  info(
    `${chalk5.bold("REMB.md")} generated \u2014 your IDE's AI agent can read it to learn all Remb commands.`
  );
  try {
    const installSkills = await promptYesNo(
      "Install recommended AI skills (remb-context, remb-memory, remb-scan)?"
    );
    if (installSkills) {
      info("Installing skills...");
      const { installSkillsAfterInit: installSkillsAfterInit2 } = await Promise.resolve().then(() => (init_skills(), skills_exports));
      await installSkillsAfterInit2(cwd, ide);
    }
  } catch {
  }
});
function injectIntoIDEContextFiles(cwd, slug, apiUrl, ide) {
  const START_MARKER = "<!-- remb:start -->";
  const END_MARKER = "<!-- remb:end -->";
  const all = ide === "all";
  const is = (name) => all || ide === name;
  const targets = [
    {
      path: resolve4(cwd, ".cursor", "rules", "remb.mdc"),
      label: ".cursor/rules/remb.mdc",
      content: generateCursorRules(slug, apiUrl),
      enabled: is("cursor")
    },
    {
      path: resolve4(cwd, ".windsurfrules"),
      label: ".windsurfrules",
      content: generateWindsurfRules(slug, apiUrl),
      enabled: is("windsurf")
    },
    {
      path: resolve4(cwd, ".clinerules"),
      label: ".clinerules",
      content: generateClineRules(slug, apiUrl),
      enabled: is("cline")
    },
    {
      path: resolve4(cwd, ".junie", "guidelines.md"),
      label: ".junie/guidelines.md",
      content: generateJetBrainsPrompt(slug, apiUrl),
      enabled: is("jetbrains")
    },
    {
      path: resolve4(cwd, "CLAUDE.md"),
      label: "CLAUDE.md",
      content: generateClaudeMd(slug, apiUrl),
      enabled: is("claude")
    },
    {
      path: resolve4(cwd, ".aider.conf.yml"),
      label: ".aider.conf.yml",
      content: generateAiderConfig(slug, apiUrl),
      enabled: is("aider")
    },
    {
      path: resolve4(cwd, ".github", "instructions", "remb-session.instructions.md"),
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
      const dir = resolve4(target.path, "..");
      if (!existsSync4(dir)) {
        mkdirSync4(dir, { recursive: true });
      }
      const block = `${START_MARKER}
${target.content}
${END_MARKER}`;
      const header = target.fileHeader ? target.fileHeader + "\n\n" : "";
      if (existsSync4(target.path)) {
        const existing = readFileSync4(target.path, "utf-8");
        const startIdx = existing.indexOf(START_MARKER);
        const endIdx = existing.indexOf(END_MARKER);
        if (startIdx !== -1 && endIdx !== -1) {
          const updated = existing.slice(0, startIdx) + block + existing.slice(endIdx + END_MARKER.length);
          writeFileSync4(target.path, updated);
        } else if (target.fileHeader) {
          writeFileSync4(target.path, header + block + "\n");
        } else {
          writeFileSync4(target.path, existing.trimEnd() + "\n\n" + block + "\n");
        }
      } else {
        writeFileSync4(target.path, header + block + "\n");
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
    const vscMcp = resolve4(cwd, ".vscode", "mcp.json");
    if (!existsSync4(vscMcp)) {
      try {
        mkdirSync4(resolve4(cwd, ".vscode"), { recursive: true });
        writeFileSync4(vscMcp, mcpConfig + "\n");
        injected.push(".vscode/mcp.json");
      } catch {
      }
    }
  }
  if (is("cursor")) {
    const cursorMcp = resolve4(cwd, ".cursor", "mcp.json");
    if (!existsSync4(cursorMcp)) {
      try {
        mkdirSync4(resolve4(cwd, ".cursor"), { recursive: true });
        writeFileSync4(cursorMcp, mcpConfig + "\n");
        injected.push(".cursor/mcp.json");
      } catch {
      }
    }
  }
  return injected;
}
async function promptYesNo(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve7) => {
    rl.question(`${message} ${chalk5.dim("[Y/n]")}: `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve7(a === "" || a === "y" || a === "yes");
    });
  });
}
async function openBrowser2(url) {
  const { exec } = await import("child_process");
  const { platform: platform7 } = await import("os");
  const os = platform7();
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
    console.log(chalk5.dim(`  If the browser doesn't open, visit:`));
    console.log(chalk5.dim(`  ${authUrl}`));
    await openBrowser2(authUrl);
    const ora12 = (await import("ora")).default;
    const spinner = ora12("Waiting for browser authentication...").start();
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
          success(`Authenticated${data.login ? ` as ${chalk5.bold(data.login)}` : ""}!`);
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
    info(`Detected IDE: ${chalk5.bold(IDE_LABELS[detected])}`);
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
  console.log(chalk5.bold("  Which IDE are you using?"));
  console.log();
  for (const c of choices) {
    console.log(`    ${chalk5.dim(c.key + ".")} ${c.label}`);
  }
  console.log();
  return new Promise((resolve7) => {
    rl.question(chalk5.bold("  Enter number: "), (answer) => {
      rl.close();
      const found = choices.find((c) => c.key === answer.trim());
      if (!found) {
        console.log(chalk5.dim("  No selection \u2014 using: all"));
        resolve7("all");
      } else {
        console.log(chalk5.dim(`  Selected: ${found.label}`));
        resolve7(found.value);
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

## Cross-Project Referencing

When the user says "do it like I did in project X" or references another project:

1. Call \`remb__projects_list\` to find available projects
2. Call \`remb__cross_project_search\` with the concept to find matching patterns across all projects
3. Call \`remb__context_bundle\` with the other project's slug to load its full context
4. Apply the patterns from that project to the current work

**Global preferences** \u2014 memories created without a project_id apply to ALL projects. Use \`remb__memory_create\` with category "preference" and no project_id to save cross-project coding standards.

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
init_api_client();
init_output();
init_shared();
import { Command as Command4 } from "commander";
import chalk6 from "chalk";
import ora from "ora";
var VALID_ENTRY_TYPES = ["manual", "scan", "link", "decision", "note"];
var saveCommand = new Command4("save").description("Save a context entry for a project feature").requiredOption("-f, --feature <name>", "Feature or module name").requiredOption("-c, --content <text>", "Context content text").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("-t, --tags <tags>", "Comma-separated tags", "").option("--type <entry-type>", "Entry type", "manual").addHelpText(
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
    console.error(chalk6.red("\u2716") + " Too many tags (max 20).");
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
    success(`Context saved for ${chalk6.bold(opts.feature)}`);
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
init_api_client();
init_output();
init_shared();
import { Command as Command5 } from "commander";
import chalk7 from "chalk";
import ora2 from "ora";
var VALID_FORMATS = ["json", "table", "markdown"];
var getCommand = new Command5("get").description("Retrieve context entries with optional filtering").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").option("-f, --feature <name>", "Filter by feature name").option("-l, --limit <n>", "Max entries to return", "10").option("--format <format>", "Output format: json, table, markdown", "table").addHelpText(
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
        opts.feature ? `No entries found for feature ${chalk7.bold(opts.feature)} in ${chalk7.bold(projectSlug)}.` : `No entries found for project ${chalk7.bold(projectSlug)}.`
      );
      return;
    }
    console.log(formatEntries(result.entries, format));
    if (format !== "json") {
      console.log();
      info(
        chalk7.dim(`Showing ${result.total} entries.`) + (result.total >= limit ? chalk7.dim(` Use --limit to see more.`) : "")
      );
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/index.ts
init_scan();

// src/commands/link.ts
init_api_client();
init_output();
init_shared();
import { Command as Command7 } from "commander";
import chalk9 from "chalk";
import ora4 from "ora";
var linkCommand = new Command7("link").description("Link features together with dependency relationships").requiredOption("--from <feature>", "Source feature name").requiredOption("--to <feature>", "Target feature name").option("--type <relation>", "Relationship: depends_on, extends, uses", "depends_on").option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)").addHelpText(
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
    success(`Linked ${chalk9.bold(opts.from)} \u2192 ${chalk9.cyan(opts.type)} \u2192 ${chalk9.bold(opts.to)}`);
    keyValue("ID", result.id);
    keyValue("Project", projectSlug);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/serve.ts
init_api_client();
init_config();
init_output();
import { Command as Command8 } from "commander";
import chalk10 from "chalk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
var serveCommand = new Command8("serve").description("Start the MCP server for AI tool integration").option("--project <slug>", "Default project slug").action(async (opts) => {
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
    version: "0.3.1"
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
    info(`Default project: ${chalk10.bold(projectSlug)}`);
  }
  await server.connect(transport);
  success("MCP server running (stdio transport)");
});

// src/commands/memory.ts
init_api_client();
init_output();
init_shared();
import { Command as Command9 } from "commander";
import chalk11 from "chalk";
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
var memoryCommand = new Command9("memory").description("Manage AI memories \u2014 add, list, update, delete, and promote").addHelpText(
  "after",
  `
Examples:
  $ remb memory add -t "Auth pattern" -c "Uses JWT httpOnly cookies"
  $ remb memory list --tier core
  $ remb memory update <id> -c "Updated content"
  $ remb memory delete <id>`
).addCommand(memoryAddCommand()).addCommand(memoryListCommand()).addCommand(memoryUpdateCommand()).addCommand(memoryDeleteCommand()).addCommand(memoryPromoteCommand());
function memoryAddCommand() {
  return new Command9("add").description("Create a new memory").requiredOption("-t, --title <title>", "Memory title").requiredOption("-c, --content <content>", "Memory content").option("--tier <tier>", "Memory tier: core, active, archive", "active").option("--category <category>", "Category: preference, pattern, decision, correction, knowledge, general", "general").option("--tags <tags>", "Comma-separated tags").option("-p, --project <slug>", "Project slug").action(async (opts) => {
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
  return new Command9("list").alias("ls").description("List memories \u2014 shows project-scoped and global memories").option("--tier <tier>", "Filter by tier: core, active, archive").option("--category <category>", "Filter by category").option("-s, --search <query>", "Semantic/text search").option("-p, --project <slug>", "Show memories for a project (includes global memories too)").option("--global", "Show only global memories (no project scope)").option("-l, --limit <n>", "Max results", "20").option("--format <format>", "Output format: table, json, markdown", "table").addHelpText(
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
        core: chalk11.yellow,
        active: chalk11.cyan,
        archive: chalk11.dim
      };
      for (const m of memories) {
        const tierFn = tierColors[m.tier] ?? chalk11.white;
        const scope = m.project_id ? chalk11.blue("[project]".padEnd(10)) : chalk11.magenta("[global]".padEnd(10));
        console.log(
          `${scope} ${tierFn(`[${m.tier}]`.padEnd(10))} ${chalk11.bold(m.title.slice(0, 45).padEnd(47))} ${chalk11.dim(m.category.padEnd(12))} ${chalk11.dim(`${m.token_count}t`)}`
        );
        if (m.tags.length) {
          console.log(`                     ${chalk11.dim(m.tags.map((t) => `#${t}`).join(" "))}`);
        }
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}
function memoryUpdateCommand() {
  return new Command9("update").description("Update an existing memory").argument("<id>", "Memory ID").option("-t, --title <title>", "New title").option("-c, --content <content>", "New content").option("--tier <tier>", "New tier").option("--category <category>", "New category").option("--tags <tags>", "Comma-separated tags").action(async (id, opts) => {
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
  return new Command9("delete").alias("rm").description("Delete a memory").argument("<id>", "Memory ID").option("-f, --force", "Skip confirmation prompt").action(async (id, opts) => {
    validateUUID(id, "Memory ID");
    if (!opts.force) {
      const confirmed = await confirmAction(
        `Delete memory ${chalk11.bold(id.slice(0, 8))}...?`
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
  return new Command9("promote").description("Promote a memory to a higher tier (archive\u2192active\u2192core)").argument("<id>", "Memory ID").option("--to <tier>", "Target tier: core, active", "core").action(async (id, opts) => {
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
init_api_client();
init_config();
init_output();
init_shared();
import { Command as Command10 } from "commander";
import chalk12 from "chalk";
import ora6 from "ora";
import { resolve as resolve6 } from "path";
import { writeFileSync as writeFileSync5 } from "fs";
var projectsCommand = new Command10("projects").description("Manage projects \u2014 list, switch active project").addCommand(projectsListCommand()).addCommand(projectsUseCommand());
function projectsUseCommand() {
  return new Command10("use").alias("switch").description("Set the active project for this workspace \u2014 writes/updates .remb.yml").argument("<slug>", "Project slug to activate").option("--api-url <url>", "API server URL to write into .remb.yml").addHelpText(
    "after",
    `
Examples:
  $ remb projects use my-app
  $ remb projects switch my-app
  $ remb projects use my-app --api-url https://www.useremb.com`
  ).action(async (slug, opts) => {
    const cwd = process.cwd();
    const existing = findProjectConfig(cwd);
    const configPath = resolve6(existing?.dir ?? cwd, ".remb.yml");
    const apiUrl = opts.apiUrl ?? existing?.config.api_url ?? "https://www.useremb.com";
    const ide = existing?.config.ide;
    const spinner = ora6(`Looking up project "${slug}"...`).start();
    try {
      const client = createApiClient();
      const { projects } = await client.listProjects({ status: "active", limit: 200 });
      const found = projects.find((p) => p.slug === slug);
      spinner.stop();
      if (!found) {
        const available = projects.map((p) => `  ${chalk12.cyan(p.slug)} \u2014 ${p.name}`).join("\n");
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
      writeFileSync5(configPath, lines.join("\n"), "utf-8");
      success(`Active project set to ${chalk12.bold(found.name)} (${chalk12.cyan(slug)})`);
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
  return new Command10("list").alias("ls").description("List all projects").option("--status <status>", "Filter by status").option("-l, --limit <n>", "Max results", "50").option("--format <format>", "Output format: table, json, markdown", "table").addHelpText(
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
        active: chalk12.green,
        archived: chalk12.dim,
        draft: chalk12.yellow
      };
      for (const p of projects) {
        const statusFn = statusColors[p.status] ?? chalk12.white;
        const lang = p.language ? chalk12.dim(`[${p.language}]`) : "";
        console.log(
          `${statusFn(p.status.padEnd(10))} ${chalk12.bold(p.name.slice(0, 30).padEnd(32))} ${chalk12.dim(p.slug.padEnd(25))} ${lang}`
        );
        console.log(
          `           ${chalk12.dim(`${p.feature_count} features, ${p.entry_count} entries`)}${p.repo_name ? chalk12.dim(` \xB7 ${p.repo_name}`) : ""}`
        );
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
}

// src/commands/context.ts
init_api_client();
init_output();
init_shared();
import { Command as Command11 } from "commander";
import chalk13 from "chalk";
import ora7 from "ora";
import { writeFileSync as writeFileSync7, mkdirSync as mkdirSync6 } from "fs";
import { join as join2 } from "path";

// src/lib/vault-generator.ts
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync6, existsSync as existsSync7, readFileSync as readFileSync7, appendFileSync } from "fs";
import { join } from "path";
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function generateVault(dir, data) {
  let filesWritten = 0;
  for (const sub of ["", ".obsidian", "features", "memories"]) {
    mkdirSync5(join(dir, sub), { recursive: true });
  }
  writeFileSync6(
    join(dir, ".obsidian/app.json"),
    JSON.stringify({
      showFrontmatter: true,
      livePreview: true,
      readableLineLength: true
    }, null, 2)
  );
  filesWritten++;
  writeFileSync6(
    join(dir, ".obsidian/graph.json"),
    JSON.stringify({
      collapse_filter: false,
      search: "",
      showTags: true,
      showAttachments: false,
      hideUnresolved: false,
      showOrphans: true,
      collapse_color: false,
      colorGroups: [
        { query: "path:features", color: { a: 1, rgb: 14073170 } },
        // amber
        { query: "path:memories", color: { a: 1, rgb: 5025616 } },
        // teal
        { query: "tag:#core", color: { a: 1, rgb: 16750848 } }
        // orange
      ],
      collapse_display: false,
      showArrow: true,
      textFadeMultiplier: 0,
      nodeSizeMultiplier: 1,
      lineSizeMultiplier: 1,
      collapse_forces: true,
      centerStrength: 0.5,
      repelStrength: 10,
      linkStrength: 1,
      linkDistance: 250
    }, null, 2)
  );
  filesWritten++;
  const featureLinks = [];
  for (const feature of data.features) {
    const slug = slugify(feature.name);
    const filename = `features/${slug}.md`;
    const tags = [`feature/${slugify(feature.category)}`, `importance/${feature.importance}`];
    if (feature.importance >= 8) tags.push("core");
    let content = "---\n";
    content += `name: "${feature.name}"
`;
    content += `category: ${feature.category}
`;
    content += `importance: ${feature.importance}
`;
    content += `tags:
`;
    for (const tag of tags) content += `  - ${tag}
`;
    content += `files: ${feature.files.length}
`;
    content += "---\n\n";
    content += `# ${feature.name}

`;
    if (feature.description) content += `${feature.description}

`;
    if (feature.files.length > 0) {
      content += "## Files\n\n";
      for (const file of feature.files) {
        content += `- \`${file}\`
`;
      }
      content += "\n";
    }
    const related = data.features.filter(
      (f) => f.name !== feature.name && (f.category === feature.category || f.files.some((file) => feature.files.includes(file)))
    );
    if (related.length > 0) {
      content += "## Related Features\n\n";
      for (const r of related) {
        content += `- [[${slugify(r.name)}|${r.name}]]
`;
      }
      content += "\n";
    }
    writeFileSync6(join(dir, filename), content);
    filesWritten++;
    featureLinks.push(`- [[${slug}|${feature.name}]] \u2014 ${feature.description?.slice(0, 80) ?? feature.category}`);
  }
  const memoryLinks = [];
  for (const memory of data.memories) {
    const slug = slugify(memory.title);
    const filename = `memories/${slug}.md`;
    let content = "---\n";
    content += `title: "${memory.title}"
`;
    content += `tier: ${memory.tier}
`;
    content += `category: ${memory.category}
`;
    content += `tags:
  - memory/${memory.category}
  - ${memory.tier}
`;
    content += "---\n\n";
    content += `# ${memory.title}

`;
    content += memory.content + "\n";
    writeFileSync6(join(dir, filename), content);
    filesWritten++;
    memoryLinks.push(`- [[${slug}|${memory.title}]] (${memory.tier}/${memory.category})`);
  }
  let readme = "---\ntags:\n  - moc\n---\n\n";
  readme += `# ${data.project.name}

`;
  if (data.project.description) readme += `> ${data.project.description}

`;
  if (data.project.techStack.length > 0) {
    readme += `**Tech Stack:** ${data.project.techStack.join(", ")}

`;
  }
  if (Object.keys(data.project.languages).length > 0) {
    readme += `**Languages:** ${Object.entries(data.project.languages).map(([k, v]) => `${k} (${v})`).join(", ")}

`;
  }
  readme += "---\n\n";
  readme += `## Features (${data.features.length})

`;
  readme += featureLinks.join("\n") + "\n\n";
  if (memoryLinks.length > 0) {
    readme += `## Memories (${data.memories.length})

`;
    readme += memoryLinks.join("\n") + "\n\n";
  }
  readme += "---\n\n";
  readme += "*Generated by [Remb](https://useremb.com) \u2014 AI context management*\n";
  writeFileSync6(join(dir, "README.md"), readme);
  filesWritten++;
  writeFileSync6(join(dir, "context.md"), data.markdown);
  filesWritten++;
  if (data.plans) {
    writeFileSync6(join(dir, "plan.md"), data.plans);
    filesWritten++;
  }
  mkdirSync5(join(dir, ".vscode"), { recursive: true });
  writeFileSync6(
    join(dir, ".vscode/settings.json"),
    JSON.stringify({
      "foam.edit.linkReferenceDefinitions": "withExtensions",
      "foam.openDailyNote.directory": "memories",
      "foam.graph.style": { "node": { "note": "#d4a574" } }
    }, null, 2)
  );
  filesWritten++;
  const continueCtx = {
    name: "remb-context",
    description: `Project context for ${data.project.name}`,
    contextProviders: [{
      name: "file",
      params: { path: ".remb/context.md" }
    }]
  };
  mkdirSync5(join(dir, ".continue"), { recursive: true });
  writeFileSync6(join(dir, ".continue/config.json"), JSON.stringify(continueCtx, null, 2));
  filesWritten++;
  let cursorRule = `---
description: Auto-generated project context from Remb scan
globs: "**"
---

`;
  cursorRule += `# ${data.project.name} \u2014 Project Context

`;
  cursorRule += `Tech: ${data.project.techStack.join(", ")}

`;
  cursorRule += `## Features

`;
  for (const f of data.features) {
    cursorRule += `- **${f.name}** (${f.category}, importance ${f.importance}): ${f.description?.slice(0, 100) ?? ""}`;
    if (f.files.length > 0) cursorRule += ` \u2014 files: ${f.files.slice(0, 5).join(", ")}`;
    cursorRule += "\n";
  }
  if (data.memories.length > 0) {
    cursorRule += `
## Key Memories

`;
    for (const m of data.memories.filter((m2) => m2.tier === "core").slice(0, 10)) {
      cursorRule += `- **${m.title}** (${m.category}): ${m.content.slice(0, 120)}
`;
    }
  }
  writeFileSync6(join(dir, "cursor-rules.mdc"), cursorRule);
  filesWritten++;
  return { filesWritten };
}
function ensureGitignore(rootDir = ".") {
  const gitignorePath = join(rootDir, ".gitignore");
  if (existsSync7(gitignorePath)) {
    const content = readFileSync7(gitignorePath, "utf-8");
    if (!content.includes(".remb/") && !content.includes(".remb")) {
      appendFileSync(gitignorePath, "\n# Remb vault (local AI context)\n.remb/\n");
    }
  } else {
    writeFileSync6(gitignorePath, "# Remb vault (local AI context)\n.remb/\n");
  }
}

// src/commands/context.ts
var contextCommand = new Command11("context").description(
  "Download project context and generate an Obsidian-compatible .remb/ vault for AI agents"
).option(
  "-p, --project <slug>",
  "Project slug (reads from .remb.yml if omitted)"
).option("-o, --output <path>", "Output file path", ".remb/context.md").option("--json", "Output raw JSON instead of markdown").option("--vault", "Generate full Obsidian vault with feature notes and wikilinks", true).option("--no-vault", "Only write context.md without vault structure").addHelpText(
  "after",
  `
Examples:
  $ remb context                     # Full Obsidian vault (default)
  $ remb context --no-vault           # Just context.md
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
    const dir = ".remb";
    let plansMd;
    try {
      const { plans } = await client.getPlans(projectSlug);
      if (plans.length > 0) {
        plansMd = "# Active Plans\n\n";
        plansMd += "> Use `remb__plan_update_phase` to mark phases completed, `remb__plan_create_phase` to add new phases, and `remb__plan_complete` to finish a plan.\n\n";
        for (const plan of plans) {
          plansMd += `## ${plan.title}
`;
          if (plan.description) plansMd += `${plan.description}
`;
          plansMd += "\n";
          if (plan.phases.length > 0) {
            plansMd += "### Phases\n";
            for (const phase of plan.phases) {
              const icon = phase.status === "completed" ? "\u2705" : phase.status === "in_progress" ? "\u{1F504}" : "\u2B1C";
              const desc = phase.description ? ` \u2014 ${phase.description}` : "";
              plansMd += `- ${icon} **${phase.title}** (id: \`${phase.id}\`)${desc}
`;
            }
            plansMd += "\n";
          }
        }
      }
    } catch {
    }
    if (opts.vault) {
      const { filesWritten } = generateVault(dir, {
        project: bundle.project,
        features: bundle.features,
        memories: bundle.memories,
        markdown: bundle.markdown,
        plans: plansMd
      });
      ensureGitignore();
      success(`Generated Obsidian vault at ${chalk13.bold(".remb/")} (${filesWritten} files)`);
      info(`Features: ${chalk13.bold(String(bundle.features.length))}  Memories: ${chalk13.bold(String(bundle.memories.length))}`);
      console.log();
      info(`Open ${chalk13.bold(".remb/")} as a vault in Obsidian to explore the knowledge graph.`);
    } else {
      const outPath = opts.output;
      const outDir = outPath.includes("/") ? outPath.slice(0, outPath.lastIndexOf("/")) : dir;
      mkdirSync6(outDir, { recursive: true });
      writeFileSync7(outPath, bundle.markdown, "utf-8");
      if (plansMd) {
        writeFileSync7(join2(outDir, "plan.md"), plansMd, "utf-8");
      }
      ensureGitignore();
      success(`Context saved to ${chalk13.bold(outPath)}`);
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/commands/diff.ts
init_api_client();
init_output();
init_shared();
import { Command as Command12 } from "commander";
import chalk14 from "chalk";
import ora8 from "ora";
import { execSync as execSync3 } from "child_process";
var diffCommand = new Command12("diff").description(
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
      diff = execSync3("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
    } else {
      const staged = execSync3("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
      const unstaged = execSync3("git diff", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
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
      chalk14.yellow(
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
    success(`Analyzed ${chalk14.bold(result.analyzed)} feature-level changes:`);
    console.log();
    for (const change of result.changes) {
      const imp = change.importance >= 8 ? chalk14.red("\u25CF") : change.importance >= 5 ? chalk14.yellow("\u25CF") : chalk14.dim("\u25CF");
      console.log(
        `  ${imp} ${chalk14.bold(change.feature_name)} ${chalk14.dim(`(${change.category})`)}`
      );
      console.log(`    ${change.summary}`);
      if (change.files_changed.length > 0) {
        console.log(
          `    ${chalk14.dim(change.files_changed.slice(0, 5).join(", "))}${change.files_changed.length > 5 ? chalk14.dim(` +${change.files_changed.length - 5} more`) : ""}`
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
import { Command as Command13 } from "commander";
import chalk15 from "chalk";
var pushCommand = new Command13("push").description("(Deprecated \u2014 use 'remb scan') Trigger a cloud scan").option("-p, --project <slug>", "Project slug").option("--force", "Skip git checks", false).option("--no-progress", "Fire and forget", false).action(async (opts) => {
  console.log(
    chalk15.yellow("\u26A0"),
    chalk15.dim("'remb push' is deprecated \u2014 use"),
    chalk15.bold("remb scan"),
    chalk15.dim("instead.\n")
  );
  const { scanCommand: scanCommand2 } = await Promise.resolve().then(() => (init_scan(), scan_exports));
  const args = [];
  if (opts.project) {
    args.push("-p", opts.project);
  }
  if (opts.force) args.push("--force");
  if (opts.progress === false) args.push("--no-poll");
  await scanCommand2.parseAsync(args, { from: "user" });
});

// src/commands/history.ts
init_api_client();
init_shared();
import { Command as Command14 } from "commander";
import chalk16 from "chalk";
import ora9 from "ora";
var historyCommand = new Command14("history").description("View conversation history \u2014 what AI discussed and did across sessions").option("-s, --search <query>", "Semantic search across conversation history").option("-d, --date <date>", "Filter by specific date (YYYY-MM-DD)").option("--from <date>", "Start date filter (YYYY-MM-DD)").option("--to <date>", "End date filter (YYYY-MM-DD)").option("-l, --limit <n>", "Max entries to show", "20").option("-p, --project <slug>", "Filter by project slug").option("--format <fmt>", "Output format: timeline (default), markdown, json", "timeline").addHelpText(
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
    console.error(chalk16.red("\u2716") + " --from date cannot be after --to date.");
    process.exit(1);
  }
  const limit = parseInt(opts.limit, 10) || 20;
  validatePositiveInt(limit, "Limit", 200);
  const spinner = ora9("Loading conversation history...").start();
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
        console.log(chalk16.dim("  No matching conversations found."));
        return;
      }
      if (opts.format === "json") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }
      console.log();
      console.log(chalk16.bold(`  Search results for "${opts.search}"`));
      console.log(chalk16.dim(`  ${results.length} matches
`));
      for (const r of results) {
        const date = chalk16.dim(r.created_at.slice(0, 10));
        const time = chalk16.dim(r.created_at.slice(11, 16));
        const sim = chalk16.green(`${(r.similarity * 100).toFixed(0)}%`);
        const tags = r.tags?.length ? chalk16.blue(` [${r.tags.join(", ")}]`) : "";
        const proj = r.project_slug ? chalk16.dim(` (${r.project_slug})`) : "";
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
      console.log(chalk16.dim("  No conversation history. AI sessions log here automatically via MCP."));
      return;
    }
    console.log();
    console.log(chalk16.bold("  Conversation History"));
    console.log(chalk16.dim(`  ${result.total} entries
`));
    const grouped = /* @__PURE__ */ new Map();
    for (const entry of result.entries) {
      const date = entry.created_at.slice(0, 10);
      const list = grouped.get(date) ?? [];
      list.push(entry);
      grouped.set(date, list);
    }
    for (const [date, entries] of grouped) {
      console.log(chalk16.bold.blue(`  ${date}`));
      for (const e of entries) {
        const time = chalk16.dim(e.created_at.slice(11, 16));
        const icon = e.type === "tool_call" ? chalk16.yellow("\u26A1") : e.type === "milestone" ? chalk16.green("\u25C6") : chalk16.cyan("\u25CF");
        const src = e.source !== "mcp" ? chalk16.dim(` [${e.source}]`) : "";
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

// src/commands/import.ts
init_api_client();
init_shared();
import { Command as Command15 } from "commander";
import chalk17 from "chalk";
import ora10 from "ora";

// src/lib/ide-parsers/vscdb-base.ts
import { readFileSync as readFileSync8, existsSync as existsSync8, readdirSync as readdirSync2, statSync as statSync2 } from "fs";
import { join as join3, basename as basename5 } from "path";
import { homedir as homedir2, platform } from "os";
function getWorkspaceStoragePath(appName) {
  const home = homedir2();
  const os = platform();
  switch (os) {
    case "darwin":
      return join3(home, "Library", "Application Support", appName, "User", "workspaceStorage");
    case "win32":
      return join3(process.env.APPDATA ?? join3(home, "AppData", "Roaming"), appName, "User", "workspaceStorage");
    case "linux":
      return join3(home, ".config", appName, "User", "workspaceStorage");
    default:
      return join3(home, ".config", appName, "User", "workspaceStorage");
  }
}
function detectWorkspaceStorage(appName) {
  const storagePath = getWorkspaceStoragePath(appName);
  return existsSync8(storagePath);
}
function listWorkspaceProjects(appName) {
  const storagePath = getWorkspaceStoragePath(appName);
  if (!existsSync8(storagePath)) return [];
  const projects = [];
  const entries = readdirSync2(storagePath);
  for (const entry of entries) {
    const fullPath = join3(storagePath, entry);
    try {
      const stat = statSync2(fullPath);
      if (!stat.isDirectory()) continue;
      const wsFile = join3(fullPath, "workspace.json");
      let name = entry;
      let workspacePath;
      if (existsSync8(wsFile)) {
        try {
          const wsData = JSON.parse(readFileSync8(wsFile, "utf-8"));
          const folder = wsData.folder ?? wsData.workspace;
          if (typeof folder === "string") {
            const decoded = folder.replace(/^file:\/\//, "");
            workspacePath = decodeURIComponent(decoded);
            name = basename5(workspacePath);
          }
        } catch {
        }
      }
      const vscdbPath = join3(fullPath, "state.vscdb");
      if (!existsSync8(vscdbPath)) continue;
      projects.push({
        id: entry,
        name,
        storagePath: fullPath,
        workspacePath,
        lastModified: stat.mtime
      });
    } catch {
    }
  }
  return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}
async function queryVscdb(dbPath, key) {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync8(dbPath);
  const db = new SQL.Database(fileBuffer);
  try {
    const results = db.exec(`SELECT value FROM ItemTable WHERE key = '${key.replace(/'/g, "''")}'`);
    if (results.length === 0 || results[0].values.length === 0) return null;
    const value = results[0].values[0][0];
    return typeof value === "string" ? value : null;
  } finally {
    db.close();
  }
}
async function queryVscdbLike(dbPath, keyPattern) {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync8(dbPath);
  const db = new SQL.Database(fileBuffer);
  try {
    const results = db.exec(`SELECT key, value FROM ItemTable WHERE key LIKE '${keyPattern.replace(/'/g, "''")}'`);
    if (results.length === 0) return [];
    return results[0].values.filter((row) => typeof row[0] === "string" && typeof row[1] === "string").map((row) => ({ key: row[0], value: row[1] }));
  } finally {
    db.close();
  }
}

// src/lib/ide-parsers/cursor.ts
import { join as join4 } from "path";
var APP_NAME = "Cursor";
var CHAT_KEY = "workbench.panel.aichat.view.aichat.chatdata";
var CursorParser = class {
  id = "cursor";
  displayName = "Cursor";
  async detect() {
    return detectWorkspaceStorage(APP_NAME);
  }
  async listProjects() {
    return listWorkspaceProjects(APP_NAME);
  }
  async parseConversations(projectId) {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const dbPath = join4(project.storagePath, "state.vscdb");
    const raw = await queryVscdb(dbPath, CHAT_KEY);
    if (!raw) return [];
    try {
      const chatData = JSON.parse(raw);
      return parseCursorChatData(chatData);
    } catch {
      return [];
    }
  }
};
function parseCursorChatData(data) {
  if (!data || typeof data !== "object") return [];
  const conversations = [];
  const tabs = Array.isArray(data) ? data : Array.isArray(data.tabs) ? data.tabs : [];
  for (const tab of tabs) {
    if (!tab || typeof tab !== "object") continue;
    const t = tab;
    const bubbles = Array.isArray(t.bubbles) ? t.bubbles : [];
    if (bubbles.length === 0) continue;
    const messages = bubbles.filter((b) => b !== null && typeof b === "object").map((b) => ({
      role: b.type === "user" || b.type === 1 ? "user" : "assistant",
      text: String(b.text ?? b.rawText ?? b.content ?? "").trim(),
      timestamp: typeof b.timestamp === "number" ? b.timestamp : void 0
    })).filter((m) => m.text.length > 0);
    if (messages.length === 0) continue;
    conversations.push({
      id: String(t.id ?? t.chatId ?? crypto.randomUUID()),
      messages,
      title: typeof t.title === "string" ? t.title : messages[0]?.text.slice(0, 100),
      startedAt: messages[0]?.timestamp ? new Date(messages[0].timestamp) : void 0,
      endedAt: messages.at(-1)?.timestamp ? new Date(messages.at(-1).timestamp) : void 0
    });
  }
  return conversations;
}

// src/lib/ide-parsers/vscode-copilot.ts
import { join as join5 } from "path";
var APP_NAME2 = "Code";
var CHAT_KEY2 = "github.copilot.chat.history";
var VSCodeCopilotParser = class {
  id = "vscode";
  displayName = "VS Code (Copilot)";
  async detect() {
    return detectWorkspaceStorage(APP_NAME2);
  }
  async listProjects() {
    return listWorkspaceProjects(APP_NAME2);
  }
  async parseConversations(projectId) {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const dbPath = join5(project.storagePath, "state.vscdb");
    const raw = await queryVscdb(dbPath, CHAT_KEY2);
    if (!raw) return [];
    try {
      const chatData = JSON.parse(raw);
      return parseCopilotHistory(chatData);
    } catch {
      return [];
    }
  }
};
function parseCopilotHistory(data) {
  if (!data || typeof data !== "object") return [];
  const conversations = [];
  const d = data;
  const sessions = Array.isArray(data) ? data : Array.isArray(d.sessions) ? d.sessions : [];
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const s = session;
    const messages = [];
    const turns = Array.isArray(s.turns) ? s.turns : [];
    for (const turn of turns) {
      if (!turn || typeof turn !== "object") continue;
      const t = turn;
      const req = t.request;
      const res = t.response;
      if (req?.message && typeof req.message === "string") {
        messages.push({ role: "user", text: req.message.trim() });
      }
      if (res?.message && typeof res.message === "string") {
        messages.push({ role: "assistant", text: res.message.trim() });
      }
    }
    const exchanges = Array.isArray(s.exchanges) ? s.exchanges : [];
    for (const ex of exchanges) {
      if (!ex || typeof ex !== "object") continue;
      const e = ex;
      if (e.prompt && typeof e.prompt === "string") {
        messages.push({ role: "user", text: e.prompt.trim() });
      }
      if (e.response && typeof e.response === "string") {
        messages.push({ role: "assistant", text: e.response.trim() });
      }
    }
    if (messages.length === 0) continue;
    conversations.push({
      id: String(s.id ?? s.sessionId ?? crypto.randomUUID()),
      messages,
      title: typeof s.title === "string" ? s.title : messages[0]?.text.slice(0, 100)
    });
  }
  return conversations;
}

// src/lib/ide-parsers/windsurf.ts
import { join as join6 } from "path";
var APP_NAME3 = "Windsurf";
var CHAT_KEYS = ["windsurf.chat.history", "codeium"];
var WindsurfParser = class {
  id = "windsurf";
  displayName = "Windsurf (Codeium)";
  async detect() {
    return detectWorkspaceStorage(APP_NAME3);
  }
  async listProjects() {
    return listWorkspaceProjects(APP_NAME3);
  }
  async parseConversations(projectId) {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const dbPath = join6(project.storagePath, "state.vscdb");
    const conversations = [];
    for (const key of CHAT_KEYS) {
      const raw = await queryVscdb(dbPath, key);
      if (raw) {
        try {
          const parsed = parseWindsurfData(JSON.parse(raw));
          conversations.push(...parsed);
        } catch {
        }
      }
    }
    if (conversations.length === 0) {
      const kvPairs = await queryVscdbLike(dbPath, "%codeium%chat%");
      for (const { value } of kvPairs) {
        try {
          const parsed = parseWindsurfData(JSON.parse(value));
          conversations.push(...parsed);
        } catch {
        }
      }
    }
    return conversations;
  }
};
function parseWindsurfData(data) {
  if (!data || typeof data !== "object") return [];
  const conversations = [];
  const d = data;
  const items = Array.isArray(data) ? data : Array.isArray(d.tabs) ? d.tabs : Array.isArray(d.conversations) ? d.conversations : Array.isArray(d.sessions) ? d.sessions : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const chat = item;
    const rawMessages = Array.isArray(chat.messages) ? chat.messages : Array.isArray(chat.bubbles) ? chat.bubbles : Array.isArray(chat.turns) ? chat.turns : [];
    const messages = rawMessages.filter((m) => m !== null && typeof m === "object").map((m) => ({
      role: normalizeRole(m.role ?? m.type),
      text: String(m.content ?? m.text ?? m.message ?? "").trim(),
      timestamp: typeof m.timestamp === "number" ? m.timestamp : void 0
    })).filter((m) => m.text.length > 0);
    if (messages.length === 0) continue;
    conversations.push({
      id: String(chat.id ?? crypto.randomUUID()),
      messages,
      title: typeof chat.title === "string" ? chat.title : messages[0]?.text.slice(0, 100)
    });
  }
  return conversations;
}
function normalizeRole(role) {
  if (typeof role !== "string" && typeof role !== "number") return "user";
  const r = String(role).toLowerCase();
  if (r === "user" || r === "human" || r === "1") return "user";
  if (r === "tool" || r === "function" || r === "system") return "tool";
  return "assistant";
}

// src/lib/ide-parsers/visual-studio.ts
import { existsSync as existsSync9, readdirSync as readdirSync3, statSync as statSync3, readFileSync as readFileSync9 } from "fs";
import { join as join7, basename as basename6 } from "path";
import { homedir as homedir3, platform as platform2 } from "os";
var VisualStudioParser = class {
  id = "visual-studio";
  displayName = "Visual Studio";
  getBasePath() {
    const home = homedir3();
    if (platform2() === "win32") {
      return join7(
        process.env.LOCALAPPDATA ?? join7(home, "AppData", "Local"),
        "Microsoft",
        "VisualStudio"
      );
    }
    return join7(home, ".visual-studio-not-supported");
  }
  async detect() {
    if (platform2() !== "win32") return false;
    const basePath = this.getBasePath();
    if (!existsSync9(basePath)) return false;
    try {
      const versions = readdirSync3(basePath);
      return versions.some((v) => {
        const histPath = join7(basePath, v, "ConversationHistory");
        return existsSync9(histPath);
      });
    } catch {
      return false;
    }
  }
  async listProjects() {
    const basePath = this.getBasePath();
    if (!existsSync9(basePath)) return [];
    const projects = [];
    try {
      const versions = readdirSync3(basePath);
      for (const version of versions) {
        const histPath = join7(basePath, version, "ConversationHistory");
        if (!existsSync9(histPath)) continue;
        const stat = statSync3(histPath);
        projects.push({
          id: version,
          name: `Visual Studio ${version}`,
          storagePath: histPath,
          lastModified: stat.mtime
        });
      }
    } catch {
    }
    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }
  async parseConversations(projectId) {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const conversations = [];
    const sqliteFiles = findFiles(project.storagePath, ".db");
    for (const dbFile of sqliteFiles) {
      try {
        const parsed = await parseSqliteConversationHistory(dbFile);
        conversations.push(...parsed);
      } catch {
      }
    }
    const jsonFiles = findFiles(project.storagePath, ".json");
    for (const jsonFile of jsonFiles) {
      try {
        const raw = readFileSync9(jsonFile, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data.messages)) {
          conversations.push({
            id: basename6(jsonFile, ".json"),
            messages: data.messages.filter((m) => m.content || m.text).map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              text: String(m.content ?? m.text ?? "").trim()
            })),
            title: data.title ?? void 0
          });
        }
      } catch {
      }
    }
    return conversations;
  }
};
async function parseSqliteConversationHistory(dbPath) {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync9(dbPath);
  const db = new SQL.Database(fileBuffer);
  try {
    for (const table of ["Message", "Messages", "ConversationMessage"]) {
      try {
        const results = db.exec(`SELECT * FROM ${table} ORDER BY rowid`);
        if (results.length === 0) continue;
        const cols = results[0].columns;
        const roleIdx = cols.findIndex((c) => /role/i.test(c));
        const contentIdx = cols.findIndex((c) => /content|text|message/i.test(c));
        const sessionIdx = cols.findIndex((c) => /session|conversation/i.test(c));
        if (contentIdx === -1) continue;
        const grouped = /* @__PURE__ */ new Map();
        for (const row of results[0].values) {
          const sessionId = sessionIdx >= 0 ? String(row[sessionIdx] ?? "default") : "default";
          const role = roleIdx >= 0 && String(row[roleIdx]).toLowerCase() === "user" ? "user" : "assistant";
          const text = String(row[contentIdx] ?? "").trim();
          if (!text) continue;
          if (!grouped.has(sessionId)) {
            grouped.set(sessionId, { id: sessionId, messages: [] });
          }
          grouped.get(sessionId).messages.push({ role, text });
        }
        return [...grouped.values()].filter((c) => c.messages.length > 0);
      } catch {
      }
    }
    return [];
  } finally {
    db.close();
  }
}
function findFiles(dir, ext) {
  const files = [];
  try {
    const entries = readdirSync3(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join7(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch {
  }
  return files;
}

// src/lib/ide-parsers/claude-code.ts
import { existsSync as existsSync10, readdirSync as readdirSync4, readFileSync as readFileSync10, statSync as statSync4 } from "fs";
import { join as join8, basename as basename7 } from "path";
import { homedir as homedir4, platform as platform3 } from "os";
var ClaudeCodeParser = class {
  id = "claude-code";
  displayName = "Claude Code";
  getBasePath() {
    const home = homedir4();
    if (platform3() === "win32") {
      return join8(home, ".claude", "projects");
    }
    return join8(home, ".claude", "projects");
  }
  async detect() {
    return existsSync10(this.getBasePath());
  }
  async listProjects() {
    const basePath = this.getBasePath();
    if (!existsSync10(basePath)) return [];
    const projects = [];
    try {
      const entries = readdirSync4(basePath);
      for (const entry of entries) {
        const fullPath = join8(basePath, entry);
        try {
          const stat = statSync4(fullPath);
          if (!stat.isDirectory()) continue;
          const decodedPath = entry.replace(/-/g, "/");
          const files = readdirSync4(fullPath).filter((f) => f.endsWith(".jsonl"));
          if (files.length === 0) continue;
          projects.push({
            id: entry,
            name: basename7(decodedPath) || entry,
            storagePath: fullPath,
            workspacePath: decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`,
            lastModified: stat.mtime
          });
        } catch {
        }
      }
    } catch {
    }
    return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }
  async parseConversations(projectId) {
    const projects = await this.listProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    const conversations = [];
    try {
      const files = readdirSync4(project.storagePath).filter((f) => f.endsWith(".jsonl")).sort();
      for (const file of files) {
        const filePath = join8(project.storagePath, file);
        try {
          const content = readFileSync10(filePath, "utf-8");
          const parsed = parseClaudeJsonl(content, basename7(file, ".jsonl"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch {
        }
      }
    } catch {
    }
    return conversations;
  }
};
function parseClaudeJsonl(content, fileId) {
  const lines = content.split("\n").filter((l) => l.trim());
  const messages = [];
  let firstTimestamp;
  let lastTimestamp;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      const role = normalizeRole2(msg.role ?? msg.type);
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
      } else if (typeof msg.message === "string") {
        text = msg.message;
      }
      text = text.trim();
      if (!text) continue;
      const ts = typeof msg.timestamp === "number" ? msg.timestamp : typeof msg.createdAt === "string" ? new Date(msg.createdAt).getTime() : void 0;
      if (ts) {
        if (!firstTimestamp) firstTimestamp = ts;
        lastTimestamp = ts;
      }
      messages.push({ role, text, timestamp: ts });
    } catch {
    }
  }
  if (messages.length === 0) return null;
  return {
    id: fileId,
    messages,
    startedAt: firstTimestamp ? new Date(firstTimestamp) : void 0,
    endedAt: lastTimestamp ? new Date(lastTimestamp) : void 0,
    title: messages.find((m) => m.role === "user")?.text.slice(0, 100)
  };
}
function normalizeRole2(role) {
  if (typeof role !== "string") return "user";
  const r = role.toLowerCase();
  if (r === "user" || r === "human") return "user";
  if (r === "tool_use" || r === "tool_result" || r === "tool" || r === "system") return "tool";
  return "assistant";
}

// src/lib/ide-parsers/zed.ts
import { existsSync as existsSync11, readdirSync as readdirSync5, readFileSync as readFileSync11, statSync as statSync5 } from "fs";
import { join as join9, basename as basename8 } from "path";
import { homedir as homedir5, platform as platform4 } from "os";
var ZedParser = class {
  id = "zed";
  displayName = "Zed";
  getBasePath() {
    const home = homedir5();
    const os = platform4();
    if (os === "darwin") {
      return join9(home, ".local", "share", "zed", "conversations");
    }
    if (os === "linux") {
      return join9(home, ".local", "share", "zed", "conversations");
    }
    return join9(home, ".local", "share", "zed", "conversations");
  }
  async detect() {
    return existsSync11(this.getBasePath());
  }
  async listProjects() {
    const basePath = this.getBasePath();
    if (!existsSync11(basePath)) return [];
    try {
      const files = readdirSync5(basePath).filter((f) => f.endsWith(".json"));
      if (files.length === 0) return [];
      const stat = statSync5(basePath);
      return [{
        id: "zed-conversations",
        name: "Zed Conversations",
        storagePath: basePath,
        lastModified: stat.mtime
      }];
    } catch {
      return [];
    }
  }
  async parseConversations(_projectId) {
    const basePath = this.getBasePath();
    if (!existsSync11(basePath)) return [];
    const conversations = [];
    try {
      const files = readdirSync5(basePath).filter((f) => f.endsWith(".json")).sort();
      for (const file of files) {
        const filePath = join9(basePath, file);
        try {
          const content = readFileSync11(filePath, "utf-8");
          const data = JSON.parse(content);
          const parsed = parseZedConversation(data, basename8(file, ".json"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch {
        }
      }
    } catch {
    }
    return conversations;
  }
};
function parseZedConversation(data, fileId) {
  if (!data || typeof data !== "object") return null;
  const d = data;
  const messages = [];
  const rawMessages = Array.isArray(d.messages) ? d.messages : Array.isArray(d.turns) ? d.turns : [];
  for (const msg of rawMessages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg;
    const role = String(m.role ?? "").toLowerCase() === "user" ? "user" : "assistant";
    const text = String(m.content ?? m.body ?? m.text ?? "").trim();
    if (!text) continue;
    messages.push({ role, text });
  }
  if (messages.length === 0) return null;
  const dateMatch = fileId.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const startedAt = dateMatch ? /* @__PURE__ */ new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`) : void 0;
  return {
    id: fileId,
    messages,
    startedAt,
    title: typeof d.title === "string" ? d.title : messages[0]?.text.slice(0, 100)
  };
}

// src/lib/ide-parsers/sublime-text.ts
import { existsSync as existsSync12, readdirSync as readdirSync6, readFileSync as readFileSync12, statSync as statSync6 } from "fs";
import { join as join10, basename as basename9 } from "path";
import { homedir as homedir6, platform as platform5 } from "os";
var SublimeTextParser = class {
  id = "sublime-text";
  displayName = "Sublime Text (LSP-Copilot)";
  getBasePath() {
    const home = homedir6();
    const os = platform5();
    if (os === "darwin") {
      return join10(home, "Library", "Application Support", "Sublime Text", "Packages", "User", "LSP-copilot-history");
    }
    if (os === "win32") {
      return join10(process.env.APPDATA ?? join10(home, "AppData", "Roaming"), "Sublime Text", "Packages", "User", "LSP-copilot-history");
    }
    return join10(home, ".config", "sublime-text", "Packages", "User", "LSP-copilot-history");
  }
  async detect() {
    return existsSync12(this.getBasePath());
  }
  async listProjects() {
    const basePath = this.getBasePath();
    if (!existsSync12(basePath)) return [];
    try {
      const files = readdirSync6(basePath).filter((f) => f.endsWith(".json") || f.endsWith(".md"));
      if (files.length === 0) return [];
      const stat = statSync6(basePath);
      return [{
        id: "sublime-text-history",
        name: "Sublime Text Chat History",
        storagePath: basePath,
        lastModified: stat.mtime
      }];
    } catch {
      return [];
    }
  }
  async parseConversations(_projectId) {
    const basePath = this.getBasePath();
    if (!existsSync12(basePath)) return [];
    const conversations = [];
    try {
      const files = readdirSync6(basePath).filter((f) => f.endsWith(".json")).sort();
      for (const file of files) {
        const filePath = join10(basePath, file);
        try {
          const content = readFileSync12(filePath, "utf-8");
          const data = JSON.parse(content);
          const parsed = parseSublimeChat(data, basename9(file, ".json"));
          if (parsed && parsed.messages.length > 0) {
            conversations.push(parsed);
          }
        } catch {
        }
      }
    } catch {
    }
    return conversations;
  }
};
function parseSublimeChat(data, fileId) {
  if (!data || typeof data !== "object") return null;
  const d = data;
  const messages = [];
  const rawMessages = Array.isArray(data) ? data : Array.isArray(d.messages) ? d.messages : Array.isArray(d.history) ? d.history : [];
  for (const msg of rawMessages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg;
    const role = String(m.role ?? "").toLowerCase() === "user" ? "user" : "assistant";
    const text = String(m.content ?? m.text ?? m.message ?? "").trim();
    if (!text) continue;
    messages.push({ role, text });
  }
  if (messages.length === 0) return null;
  return {
    id: fileId,
    messages,
    title: typeof d.title === "string" ? d.title : messages[0]?.text.slice(0, 100)
  };
}

// src/lib/ide-parsers/jetbrains-base.ts
import { existsSync as existsSync13, readdirSync as readdirSync7, readFileSync as readFileSync13, statSync as statSync7 } from "fs";
import { join as join11 } from "path";
import { homedir as homedir7, platform as platform6 } from "os";
var JETBRAINS_CONFIGS = {
  intellij: {
    id: "intellij",
    displayName: "IntelliJ IDEA",
    folderPatterns: ["IntelliJIdea"],
    subPath: "workspace",
    xmlTags: ["ChatSessionState", "AiAssistant"]
  },
  pycharm: {
    id: "pycharm",
    displayName: "PyCharm",
    folderPatterns: ["PyCharm"],
    subPath: "options",
    xmlTags: ["ChatSessionState", "AiAssistant"]
  },
  "android-studio": {
    id: "android-studio",
    displayName: "Android Studio",
    folderPatterns: ["AndroidStudio"],
    subPath: "workspace",
    xmlTags: ["GeminiChat", "StudioBot", "ChatSessionState"]
  }
};
function getJetBrainsRoot(vendorDir) {
  const home = homedir7();
  const os = platform6();
  if (os === "darwin") {
    return join11(home, "Library", "Application Support", vendorDir);
  }
  if (os === "win32") {
    return join11(process.env.APPDATA ?? join11(home, "AppData", "Roaming"), vendorDir);
  }
  return join11(home, `.config/${vendorDir}`);
}
function findVersionDirs(config4) {
  const vendor = config4.id === "android-studio" ? "Google" : "JetBrains";
  const root = getJetBrainsRoot(vendor);
  if (!existsSync13(root)) return [];
  try {
    return readdirSync7(root).filter((name) => config4.folderPatterns.some((p) => name.startsWith(p))).map((name) => join11(root, name)).filter((p) => existsSync13(p) && statSync7(p).isDirectory());
  } catch {
    return [];
  }
}
function detectJetBrains(config4) {
  return findVersionDirs(config4).length > 0;
}
function listJetBrainsProjects(config4) {
  const projects = [];
  const versionDirs = findVersionDirs(config4);
  for (const versionDir of versionDirs) {
    const xmlDir = join11(versionDir, config4.subPath);
    if (!existsSync13(xmlDir)) {
      if (config4.id === "pycharm") {
        const optDir = join11(versionDir, "options");
        const aiFile = join11(optDir, "ai_assistant.xml");
        if (existsSync13(aiFile)) {
          const stat = statSync7(aiFile);
          projects.push({
            id: `${versionDir.split("/").pop()}-ai_assistant`,
            name: `${config4.displayName} (${versionDir.split("/").pop()})`,
            storagePath: optDir,
            lastModified: stat.mtime
          });
        }
      }
      continue;
    }
    try {
      const xmlFiles = readdirSync7(xmlDir).filter((f) => f.endsWith(".xml"));
      if (xmlFiles.length === 0) continue;
      const stat = statSync7(xmlDir);
      projects.push({
        id: versionDir.split("/").pop() ?? versionDir,
        name: `${config4.displayName} (${versionDir.split("/").pop()})`,
        storagePath: xmlDir,
        lastModified: stat.mtime
      });
    } catch {
    }
  }
  return projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}
function parseJetBrainsConversations(config4, projectId) {
  const projects = listJetBrainsProjects(config4);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return [];
  const conversations = [];
  try {
    const files = readdirSync7(project.storagePath).filter((f) => f.endsWith(".xml"));
    for (const file of files) {
      const filePath = join11(project.storagePath, file);
      try {
        const content = readFileSync13(filePath, "utf-8");
        const parsed = extractConversationsFromXml(content, config4.xmlTags);
        conversations.push(...parsed);
      } catch {
      }
    }
  } catch {
  }
  return conversations;
}
function extractConversationsFromXml(xml, tagNames) {
  const conversations = [];
  for (const tag of tagNames) {
    const tagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    let match;
    while ((match = tagRegex.exec(xml)) !== null) {
      const inner = match[1];
      const messages = extractMessagesFromXmlBlock(inner);
      if (messages.length === 0) continue;
      const idMatch = match[0].match(/(?:id|sessionId|name)="([^"]+)"/);
      const id = idMatch ? idMatch[1] : crypto.randomUUID();
      conversations.push({
        id,
        messages,
        title: messages.find((m) => m.role === "user")?.text.slice(0, 100)
      });
    }
  }
  if (conversations.length === 0) {
    const contentBlocks = xml.match(/<content>([\s\S]*?)<\/content>/gi);
    if (contentBlocks) {
      for (const block of contentBlocks) {
        const text = block.replace(/<\/?content>/gi, "").trim();
        if (!text) continue;
        const messages = splitConversationText(text);
        if (messages.length > 0) {
          conversations.push({
            id: crypto.randomUUID(),
            messages
          });
        }
      }
    }
  }
  return conversations;
}
function extractMessagesFromXmlBlock(xml) {
  const messages = [];
  const msgRegex = /<(?:message|entry|item)[^>]*role="(user|assistant|ai|human|bot)"[^>]*>([\s\S]*?)<\/(?:message|entry|item)>/gi;
  let match;
  while ((match = msgRegex.exec(xml)) !== null) {
    const role = match[1].toLowerCase();
    const text = decodeXmlEntities(match[2].replace(/<[^>]+>/g, "").trim());
    if (!text) continue;
    messages.push({
      role: role === "user" || role === "human" ? "user" : "assistant",
      text
    });
  }
  if (messages.length === 0) {
    const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
    while ((match = cdataRegex.exec(xml)) !== null) {
      const text = match[1].trim();
      if (text.length > 5) {
        messages.push({ role: messages.length % 2 === 0 ? "user" : "assistant", text });
      }
    }
  }
  return messages;
}
function splitConversationText(text) {
  const messages = [];
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  for (let i = 0; i < paragraphs.length; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      text: paragraphs[i].trim()
    });
  }
  return messages;
}
function decodeXmlEntities(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// src/lib/ide-parsers/intellij.ts
var config = JETBRAINS_CONFIGS.intellij;
var IntelliJParser = class {
  id = "intellij";
  displayName = config.displayName;
  async detect() {
    return detectJetBrains(config);
  }
  async listProjects() {
    return listJetBrainsProjects(config);
  }
  async parseConversations(projectId) {
    return parseJetBrainsConversations(config, projectId);
  }
};

// src/lib/ide-parsers/pycharm.ts
var config2 = JETBRAINS_CONFIGS.pycharm;
var PyCharmParser = class {
  id = "pycharm";
  displayName = config2.displayName;
  async detect() {
    return detectJetBrains(config2);
  }
  async listProjects() {
    return listJetBrainsProjects(config2);
  }
  async parseConversations(projectId) {
    return parseJetBrainsConversations(config2, projectId);
  }
};

// src/lib/ide-parsers/android-studio.ts
var config3 = JETBRAINS_CONFIGS["android-studio"];
var AndroidStudioParser = class {
  id = "android-studio";
  displayName = config3.displayName;
  async detect() {
    return detectJetBrains(config3);
  }
  async listProjects() {
    return listJetBrainsProjects(config3);
  }
  async parseConversations(projectId) {
    return parseJetBrainsConversations(config3, projectId);
  }
};

// src/lib/ide-parsers/index.ts
var ALL_PARSERS = [
  new CursorParser(),
  new ClaudeCodeParser(),
  new VSCodeCopilotParser(),
  new WindsurfParser(),
  new IntelliJParser(),
  new PyCharmParser(),
  new AndroidStudioParser(),
  new VisualStudioParser(),
  new ZedParser(),
  new SublimeTextParser()
];
function getParser(id) {
  return ALL_PARSERS.find((p) => p.id === id);
}
async function detectAvailableIDEs() {
  const results = await Promise.all(
    ALL_PARSERS.map(async (parser) => {
      try {
        const available = await parser.detect();
        return available ? parser : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((p) => p !== null);
}
function conversationToEvents(conversation) {
  const events = [];
  for (const msg of conversation.messages) {
    if (msg.role === "user") {
      events.push({
        type: "user_message",
        text: msg.text.slice(0, 2e3),
        // Cap individual messages for LLM summarization
        timestamp: msg.timestamp
      });
    } else if (msg.role === "assistant") {
      events.push({
        type: "ai_response",
        text: msg.text.slice(0, 4e3),
        timestamp: msg.timestamp
      });
    } else if (msg.role === "tool") {
      events.push({
        type: "tool_call",
        text: msg.text.slice(0, 500),
        name: msg.toolName,
        timestamp: msg.timestamp
      });
    }
  }
  return events;
}

// src/commands/import.ts
var BATCH_SIZE = 20;
var MAX_EVENTS_PER_REQUEST = 100;
var importCommand = new Command15("import").description("Import AI chat history from local IDE storage into Remb").option("--ide <name>", "Import from a specific IDE only (e.g., cursor, claude-code, vscode)").option("--project <id>", "Import a specific project/workspace by its storage ID").option("--remb-project <slug>", "Associate imported conversations with this Remb project").option("--all", "Import all conversations from all detected IDEs without prompting").option("--dry-run", "Show what would be imported without actually sending data").option("--since <date>", "Only import conversations after this date (YYYY-MM-DD)").option("--list", "List detected IDEs and available projects, then exit").option("-l, --limit <n>", "Max conversations to import per project", "100").addHelpText(
  "after",
  `
Supported IDEs:
  cursor          Cursor (VS Code fork)
  claude-code     Claude Code CLI
  vscode          VS Code (GitHub Copilot)
  windsurf        Windsurf (Codeium)
  intellij        IntelliJ IDEA
  pycharm         PyCharm
  android-studio  Android Studio
  visual-studio   Visual Studio (Windows)
  zed             Zed
  sublime-text    Sublime Text (LSP-Copilot)

Examples:
  $ remb import                          # Auto-detect and import interactively
  $ remb import --list                   # List all detected IDEs and projects
  $ remb import --ide cursor             # Import from Cursor only
  $ remb import --ide cursor --project abc123  # Import specific workspace
  $ remb import --all --dry-run          # Preview what would be imported
  $ remb import --since 2025-01-01       # Only import recent conversations
  $ remb import --ide claude-code --remb-project my-app  # Associate with Remb project`
).action(async (opts) => {
  try {
    await runImport(opts);
  } catch (err) {
    handleError(err);
  }
});
async function runImport(opts) {
  if (opts.since) validateDateFormat(opts.since, "--since");
  const limit = Math.min(parseInt(opts.limit ?? "100", 10) || 100, 500);
  const sinceDate = opts.since ? /* @__PURE__ */ new Date(`${opts.since}T00:00:00Z`) : void 0;
  const spinner = ora10("Detecting installed IDEs...").start();
  let parsers;
  if (opts.ide) {
    const parser = getParser(opts.ide);
    if (!parser) {
      spinner.fail(`Unknown IDE: ${opts.ide}`);
      console.log(chalk17.dim(`  Supported: ${ALL_PARSERS.map((p) => p.id).join(", ")}`));
      process.exit(1);
    }
    const available = await parser.detect();
    if (!available) {
      spinner.fail(`${parser.displayName} storage not found on this machine`);
      process.exit(1);
    }
    parsers = [parser];
  } else {
    parsers = await detectAvailableIDEs();
  }
  if (parsers.length === 0) {
    spinner.fail("No supported IDEs detected on this machine");
    process.exit(1);
  }
  spinner.succeed(`Found ${parsers.length} IDE${parsers.length > 1 ? "s" : ""}: ${parsers.map((p) => p.displayName).join(", ")}`);
  const allProjects = [];
  for (const parser of parsers) {
    const projectSpinner = ora10(`  Scanning ${parser.displayName} workspaces...`).start();
    try {
      const projects = await parser.listProjects();
      if (opts.project) {
        const match = projects.find((p) => p.id === opts.project);
        if (match) {
          allProjects.push({ parser, project: match });
        }
      } else {
        for (const project of projects) {
          allProjects.push({ parser, project });
        }
      }
      projectSpinner.succeed(
        `  ${parser.displayName}: ${projects.length} project${projects.length !== 1 ? "s" : ""} found`
      );
    } catch {
      projectSpinner.warn(`  ${parser.displayName}: failed to scan`);
    }
  }
  if (allProjects.length === 0) {
    console.log(chalk17.yellow("\n  No projects with chat history found."));
    process.exit(0);
  }
  if (opts.list) {
    console.log();
    console.log(chalk17.bold("  Available IDE Chat History"));
    console.log();
    let lastIde = "";
    for (const { parser, project } of allProjects) {
      if (parser.id !== lastIde) {
        console.log(chalk17.blue(`  ${parser.displayName}`));
        lastIde = parser.id;
      }
      const date = chalk17.dim(project.lastModified.toISOString().slice(0, 10));
      const ws = project.workspacePath ? chalk17.dim(` \u2192 ${project.workspacePath}`) : "";
      console.log(`    ${chalk17.green(project.id.slice(0, 12))} ${project.name} ${date}${ws}`);
    }
    console.log();
    console.log(chalk17.dim(`  ${allProjects.length} total project(s) across ${parsers.length} IDE(s)`));
    return;
  }
  console.log();
  let totalConversations = 0;
  let totalMessages = 0;
  const importQueue = [];
  for (const { parser, project } of allProjects) {
    const parseSpinner = ora10(`  Parsing ${parser.displayName} / ${project.name}...`).start();
    try {
      let conversations = await parser.parseConversations(project.id);
      if (sinceDate) {
        conversations = conversations.filter((c) => {
          if (c.startedAt) return c.startedAt >= sinceDate;
          if (c.endedAt) return c.endedAt >= sinceDate;
          return true;
        });
      }
      conversations = conversations.slice(0, limit);
      for (const conv of conversations) {
        importQueue.push({ parser, project, conversation: conv });
        totalMessages += conv.messages.length;
      }
      totalConversations += conversations.length;
      parseSpinner.succeed(
        `  ${parser.displayName} / ${project.name}: ${conversations.length} conversation${conversations.length !== 1 ? "s" : ""} (${conversations.reduce((sum, c) => sum + c.messages.length, 0)} messages)`
      );
    } catch {
      parseSpinner.warn(`  ${parser.displayName} / ${project.name}: failed to parse`);
    }
  }
  if (importQueue.length === 0) {
    console.log(chalk17.yellow("\n  No conversations to import."));
    return;
  }
  console.log();
  console.log(chalk17.bold("  Import Summary"));
  console.log(`  ${chalk17.green(String(totalConversations))} conversations, ${chalk17.green(String(totalMessages))} messages`);
  console.log(`  Each conversation will be AI-summarized and stored with embeddings`);
  if (opts.rembProject) {
    console.log(`  Target project: ${chalk17.blue(opts.rembProject)}`);
  }
  if (opts.dryRun) {
    console.log();
    console.log(chalk17.yellow("  Dry run \u2014 no data sent. Remove --dry-run to import."));
    const preview = importQueue.slice(0, 5);
    console.log();
    for (const { parser, conversation } of preview) {
      const title = conversation.title ?? conversation.messages[0]?.text.slice(0, 80);
      const date = conversation.startedAt?.toISOString().slice(0, 10) ?? "unknown";
      console.log(`  ${chalk17.dim(date)} ${chalk17.cyan(parser.displayName)} ${title}`);
    }
    if (importQueue.length > 5) {
      console.log(chalk17.dim(`  ... and ${importQueue.length - 5} more`));
    }
    return;
  }
  if (!opts.all) {
    console.log();
    console.log(chalk17.dim("  Use --all to skip confirmation, or --dry-run to preview."));
  }
  const client = createApiClient();
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const importSpinner = ora10(`  Importing 0/${importQueue.length}...`).start();
  for (let i = 0; i < importQueue.length; i += BATCH_SIZE) {
    const batch = importQueue.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ parser, project, conversation }) => {
        const events = conversationToEvents(conversation);
        if (events.length === 0) return "skipped";
        const cappedEvents = events.slice(0, MAX_EVENTS_PER_REQUEST);
        const result = await client.logSmartConversation({
          events: cappedEvents,
          projectSlug: opts.rembProject ?? void 0,
          ideSource: parser.id,
          metadata: {
            import_source: parser.id,
            import_project_name: project.name,
            import_workspace_path: project.workspacePath,
            conversation_id: conversation.id,
            conversation_title: conversation.title,
            started_at: conversation.startedAt?.toISOString(),
            message_count: conversation.messages.length
          }
        });
        return result.deduplicated ? "deduplicated" : "imported";
      })
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        if (result.value === "skipped" || result.value === "deduplicated") {
          skipped++;
        } else {
          imported++;
        }
      } else {
        failed++;
      }
    }
    importSpinner.text = `  Importing ${Math.min(i + BATCH_SIZE, importQueue.length)}/${importQueue.length}... (${imported} new, ${skipped} skipped)`;
  }
  importSpinner.succeed(
    `  Import complete: ${chalk17.green(String(imported))} imported, ${chalk17.yellow(String(skipped))} skipped/deduplicated, ${failed > 0 ? chalk17.red(String(failed)) : "0"} failed`
  );
  if (imported > 0) {
    console.log();
    console.log(chalk17.dim("  View imported history: remb history"));
    if (!opts.rembProject) {
      console.log(chalk17.dim("  Tip: Use --remb-project <slug> to associate imports with a project"));
    }
  }
}

// src/commands/plan.ts
init_api_client();
init_output();
init_shared();
import { Command as Command16 } from "commander";
import chalk18 from "chalk";
import ora11 from "ora";
var planCommand = new Command16("plan").description("View and manage active plans for a project").option(
  "-p, --project <slug>",
  "Project slug (reads from .remb.yml if omitted)"
).option("--json", "Output raw JSON instead of formatted text").addHelpText(
  "after",
  `
Examples:
  $ remb plan
  $ remb plan -p my-app
  $ remb plan --json`
).action(async (opts) => {
  const projectSlug = resolveProject(opts.project);
  const spinner = ora11("Fetching plans...").start();
  try {
    const client = createApiClient();
    const { plans } = await client.getPlans(projectSlug);
    spinner.stop();
    if (opts.json) {
      console.log(JSON.stringify(plans, null, 2));
      return;
    }
    if (plans.length === 0) {
      info("No active plans for this project.");
      info(
        chalk18.dim(
          "Create a plan at: https://www.useremb.com/dashboard/" + projectSlug + "/plan"
        )
      );
      return;
    }
    for (const plan of plans) {
      console.log("");
      console.log(
        chalk18.bold(`\u{1F4CB} ${plan.title}`) + chalk18.dim(` (${plan.status})`)
      );
      if (plan.description) {
        console.log(chalk18.dim(`   ${plan.description}`));
      }
      if (plan.phases.length > 0) {
        console.log("");
        for (const phase of plan.phases) {
          const icon = phase.status === "completed" ? chalk18.green("\u2705") : phase.status === "in_progress" ? chalk18.yellow("\u{1F504}") : chalk18.dim("\u2B1C");
          const title = phase.status === "completed" ? chalk18.strikethrough(phase.title) : phase.title;
          const desc = phase.description ? chalk18.dim(` \u2014 ${phase.description}`) : "";
          console.log(`   ${icon} ${title}${desc}`);
        }
      }
      const completed = plan.phases.filter(
        (p) => p.status === "completed"
      ).length;
      const total = plan.phases.length;
      if (total > 0) {
        console.log("");
        info(
          `   Progress: ${completed}/${total} phases completed`
        );
      }
    }
    console.log("");
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});
planCommand.command("complete <phase-id>").description("Mark a plan phase as completed").option("-p, --project <slug>", "Project slug").option("--plan <id>", "Plan ID").action(async (phaseId, opts) => {
  const projectSlug = resolveProject(opts.project);
  const spinner = ora11("Completing phase...").start();
  try {
    const client = createApiClient();
    let planId = opts.plan;
    if (!planId) {
      const { plans } = await client.getPlans(projectSlug);
      if (plans.length === 0) throw new Error("No active plans found");
      const plan = plans.find(
        (p) => p.phases.some((ph) => ph.id === phaseId)
      );
      if (!plan) throw new Error("Phase not found in any active plan");
      planId = plan.id;
    }
    const { updated } = await client.updatePlanPhase({
      projectSlug,
      planId,
      phaseId,
      action: "complete"
    });
    spinner.stop();
    success(`Phase "${updated.title}" marked as ${updated.status}`);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
});

// src/index.ts
init_skills();
var program = new Command17();
program.name("remb").description(
  "Persistent memory layer for AI coding sessions \u2014 save, retrieve, and visualize project context."
).version("0.3.1", "-v, --version").configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => chalk19.bold(cmd.name())
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
program.addCommand(importCommand);
program.addCommand(projectsCommand);
program.addCommand(planCommand);
program.addCommand(skillsCommand);
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
      console.error(`${chalk19.red("\u2716")} ${err.message}`);
    }
    process.exit(1);
  }
}
main();
//# sourceMappingURL=index.js.map