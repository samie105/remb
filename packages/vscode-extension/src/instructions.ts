import * as vscode from "vscode";
import type { WorkspaceDetector } from "./workspace";
import type { AuthManager } from "./auth";
import type { ApiClient } from "./api-client";
import type { ConversationCapture } from "./conversation-capture";

const VERSION_MARKER = "<!-- remb-instructions:v2 -->";
const DYNAMIC_MARKER = "<!-- remb-dynamic-context -->";

/** How often to refresh dynamic context files (ms). Uses config or default. */
function getDynamicRefreshInterval(): number {
  const config = vscode.workspace.getConfiguration("remb");
  return (config.get<number>("contextRefreshIntervalMinutes") ?? 2) * 60_000;
}

interface InstructionTarget {
  dir: string;
  file: string;
  /** If true, the file uses YAML frontmatter (VS Code instruction files). */
  frontmatter: boolean;
}

/**
 * Instruction file paths for each IDE:
 *
 * - **VS Code Copilot**: `.github/instructions/*.instructions.md`
 *   Automatically injected into every Copilot prompt via `applyTo` YAML frontmatter.
 *   See: https://code.visualstudio.com/docs/copilot/copilot-customization
 *
 * - **Cursor**: `.cursor/rules/*.mdc`
 *   Loaded as project-level rules. Cursor reads `.mdc` files from `.cursor/rules/`.
 *   See: https://docs.cursor.com/context/rules-for-ai
 *
 * - **Windsurf**: `.windsurf/rules/*.md`
 *   Project-level rules for Windsurf (Codeium).
 *
 * - **Claude Code**: `CLAUDE.md` in project root.
 *   Read automatically at session start.
 */
const TARGETS: InstructionTarget[] = [
  { dir: ".github/instructions", file: "remb.instructions.md", frontmatter: true },
  { dir: ".cursor/rules", file: "remb.mdc", frontmatter: true },
  { dir: ".windsurf/rules", file: "remb.md", frontmatter: false },
];

/** Dynamic context files — separate from static tool instructions, gitignored. */
const DYNAMIC_TARGETS: InstructionTarget[] = [
  { dir: ".github/instructions", file: "remb-context.instructions.md", frontmatter: true },
  { dir: ".cursor/rules", file: "remb-context.mdc", frontmatter: true },
  { dir: ".windsurf/rules", file: "remb-context.md", frontmatter: false },
  // Claude Code reads CLAUDE.md from project root
  { dir: ".", file: "CLAUDE.md", frontmatter: false },
];

/** Paths to add to .gitignore for dynamic context files. */
const DYNAMIC_GITIGNORE_ENTRIES = [
  ".github/instructions/remb-context.instructions.md",
  ".cursor/rules/remb-context.mdc",
  ".windsurf/rules/remb-context.md",
  "CLAUDE.md",
  ".remb/",
];

/**
 * Auto-generates AI instruction files in the workspace so IDE-integrated
 * AI agents (Copilot, Cursor, Windsurf) automatically know how to use
 * Remb tools without the user having to configure anything.
 *
 * Two file types:
 * 1. **Static** — tool reference + session protocol (committed, version-checked)
 * 2. **Dynamic** — actual project context data injected into every prompt (gitignored, refreshed periodically)
 */
export class InstructionsManager {
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private capture: ConversationCapture | undefined;
  private isSyncingDynamic = false;

  constructor(
    private workspace: WorkspaceDetector,
    private auth: AuthManager,
    private api: ApiClient
  ) {
    this.disposables.push(
      workspace.onDidChangeProject(() => {
        this.sync();
        this.syncDynamic();
      }),
      auth.onDidChangeAuth(() => {
        this.sync();
        this.syncDynamic();
      })
    );

    // Periodically refresh dynamic context so it stays current
    this.refreshTimer = setInterval(() => this.syncDynamic(), getDynamicRefreshInterval());
  }

  /** Set the capture instance so dynamic context can include session activity. */
  setCapture(capture: ConversationCapture): void {
    this.capture = capture;
  }

  /** Create or update the static instructions files if a project is active. */
  async sync(): Promise<void> {
    const slug = this.workspace.projectSlug;
    const isAuth = await this.auth.isAuthenticated();
    if (!slug || !isAuth) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return;

    const root = workspaceFolders[0].uri;
    let updated = false;

    for (const target of TARGETS) {
      const dirUri = vscode.Uri.joinPath(root, target.dir);
      const fileUri = vscode.Uri.joinPath(dirUri, target.file);

      // Check if file exists and is current version
      try {
        const existing = Buffer.from(
          await vscode.workspace.fs.readFile(fileUri)
        ).toString("utf-8");
        if (existing.includes(VERSION_MARKER)) continue; // Already up to date
      } catch {
        // File doesn't exist — create it
      }

      // Ensure directory exists
      try {
        await vscode.workspace.fs.createDirectory(dirUri);
      } catch { /* already exists */ }

      const content = target.frontmatter
        ? generateWithFrontmatter(slug)
        : generatePlain(slug);

      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));
      updated = true;
    }

    if (updated) {
      vscode.window.showInformationMessage(
        `Remb: Updated AI instruction files for project "${slug}". Your IDE's AI will now use Remb tools automatically.`
      );
    }
  }

  /**
   * Fetch real project context from the API and write dynamic instruction
   * files that get injected into every IDE prompt automatically.
   *
   * This is the key mechanism: instead of hoping the model calls tools,
   * the actual context data is embedded directly in the instruction file.
   */
  async syncDynamic(): Promise<void> {
    if (this.isSyncingDynamic) return;
    this.isSyncingDynamic = true;

    try {
    const slug = this.workspace.projectSlug;
    const isAuth = await this.auth.isAuthenticated();
    if (!slug || !isAuth) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return;

    const root = workspaceFolders[0].uri;

    // Fetch context, history, and memories in parallel
    const [bundle, history, memories] = await Promise.all([
      this.api.bundleContext(slug).catch(() => null),
      this.api
        .getConversationHistory({ projectSlug: slug, limit: 8, format: "markdown" })
        .catch(() => null),
      this.api
        .listMemories({ tier: "core", limit: 10 })
        .catch(() => null),
    ]);

    // Nothing to write if all fetches failed
    if (!bundle && !history && !memories) return;

    // Build compact sections
    let contextSection = "";
    if (bundle?.markdown) {
      contextSection = truncateAtSectionBoundary(bundle.markdown, 4000);
    }

    let historySection = "";
    if (history?.entries?.length) {
      historySection =
        "## Recent Session History\n\n" +
        history.entries
          .map(
            (e) =>
              `- **[${e.created_at.slice(0, 16)}]** (${e.type}) ${e.content.slice(0, 200)}`
          )
          .join("\n");
    }

    let memoriesSection = "";
    if (memories?.memories?.length) {
      // Use a total budget (2000 chars) instead of per-entry truncation
      const memoryBudget = 2000;
      let used = 0;
      const blocks: string[] = [];
      for (const m of memories.memories) {
        const block = `### ${m.title} (${m.category})\n${m.content}`;
        if (used + block.length > memoryBudget && blocks.length > 0) {
          blocks.push(`\n_...${memories.memories.length - blocks.length} more memories — call \`remb_loadProjectContext\` for all_`);
          break;
        }
        blocks.push(block);
        used += block.length;
      }
      memoriesSection = "## Core Memories\n\n" + blocks.join("\n\n");
    }

    // Build session activity section from capture (real-time, no API call)
    let activitySection = "";
    const activityLines = this.capture?.getRecentActivity(20);
    if (activityLines?.length) {
      activitySection =
        "## Current Session Activity\n\n" + activityLines.join("\n");
    }

    // Read installed skills from .remb.yml
    let skillsSection = "";
    try {
      const configUri = vscode.Uri.joinPath(root, ".remb.yml");
      const configRaw = Buffer.from(
        await vscode.workspace.fs.readFile(configUri)
      ).toString("utf-8");
      const skillsMatch = configRaw.match(/^skills:\s*(.+)$/m);
      if (skillsMatch?.[1]) {
        const skills = skillsMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
        if (skills.length > 0) {
          skillsSection = "## Installed Remb Skills\n\n" +
            `The following Remb skills are installed in this project: ${skills.join(", ")}.\n` +
            "These skills provide detailed instructions for specific Remb workflows. " +
            "Check the skill files in your IDE's rules/commands directory for full details.\n" +
            `Manage skills: \`remb skills list\`, \`remb skills add <name>\`, \`remb skills update\``;
        }
      }
    } catch { /* no config or no skills line */ }

    const dynamicBody = generateDynamicBody(
      slug,
      contextSection,
      historySection,
      memoriesSection,
      activitySection,
      skillsSection,
    );

    // Write dynamic files for each IDE
    for (const target of DYNAMIC_TARGETS) {
      const dirUri = vscode.Uri.joinPath(root, target.dir);
      const fileUri = vscode.Uri.joinPath(dirUri, target.file);

      try {
        await vscode.workspace.fs.createDirectory(dirUri);
      } catch { /* already exists */ }

      let content = target.frontmatter
        ? `---\napplyTo: "**"\n---\n${dynamicBody}`
        : dynamicBody;

      // Preserve CLI-generated static sections (<!-- remb:start --> / <!-- remb:end -->)
      try {
        const existing = Buffer.from(
          await vscode.workspace.fs.readFile(fileUri)
        ).toString("utf-8");
        const markerStart = existing.indexOf("<!-- remb:start -->");
        const markerEnd = existing.indexOf("<!-- remb:end -->");
        if (markerStart !== -1 && markerEnd !== -1) {
          const staticBlock = existing.slice(markerStart, markerEnd + "<!-- remb:end -->".length);
          content += `\n\n${staticBlock}\n`;
        }
      } catch { /* file doesn't exist yet — no static block to preserve */ }

      await vscode.workspace.fs.writeFile(
        fileUri,
        Buffer.from(content, "utf-8")
      );
    }

    // Ensure dynamic files are gitignored
    await this.ensureGitignore(root);
    } finally {
      this.isSyncingDynamic = false;
    }
  }

  /** Add dynamic context file paths to .gitignore if not already present. */
  private async ensureGitignore(root: vscode.Uri): Promise<void> {
    const gitignoreUri = vscode.Uri.joinPath(root, ".gitignore");

    let existing = "";
    try {
      existing = Buffer.from(
        await vscode.workspace.fs.readFile(gitignoreUri)
      ).toString("utf-8");
    } catch {
      // No .gitignore — we'll create one
    }

    const missing = DYNAMIC_GITIGNORE_ENTRIES.filter(
      (entry) => {
        // Check line-by-line to avoid false matches in comments
        const lines = existing.split("\n").map((l) => l.trim());
        return !lines.includes(entry);
      }
    );
    if (missing.length === 0) return;

    // Ensure file ends with a newline before appending
    const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    const additions =
      separator +
      "\n# Remb dynamic context (auto-generated, do not commit)\n" +
      missing.join("\n") +
      "\n";

    await vscode.workspace.fs.writeFile(
      gitignoreUri,
      Buffer.from(existing + additions, "utf-8")
    );
  }

  dispose() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Truncate markdown at the nearest section boundary (## heading) within the budget. */
function truncateAtSectionBoundary(md: string, maxChars: number): string {
  if (md.length <= maxChars) return md;

  // Find the last ## heading that starts before maxChars
  const sections = md.split(/(?=^## )/m);
  let result = "";
  for (const section of sections) {
    if (result.length + section.length > maxChars && result.length > 0) break;
    result += section;
  }

  // If we couldn't even fit the first section, hard-cut at maxChars
  if (result.length === 0) {
    result = md.slice(0, maxChars);
  }

  return result + "\n\n_(truncated — call `remb_loadProjectContext` for full context)_";
}

function generateBody(slug: string): string {
  return `${VERSION_MARKER}
# Remb — AI Context Management

You have access to Remb tools for persistent memory and context across coding sessions.
Current project: **${slug}**

## MANDATORY Session Protocol

Follow this protocol in EVERY session. Skipping causes knowledge loss.

### Session Start (do FIRST, before any other work):
1. Call \`remb_loadProjectContext\` — loads the full project context bundle (memories, features, tech stack). Without this, you have NO context about this project.
2. Call \`remb_conversationHistory\` — loads what was discussed and accomplished in prior sessions so you can pick up where the user left off.

### During Work:
3. Call \`remb_conversationLog\` after completing any significant task, bug fix, or feature — records what was done for future sessions.
4. Call \`remb_createMemory\` when you discover important patterns, architectural decisions, or gotchas worth preserving.

### Session End (do LAST, before the conversation ends):
5. Call \`remb_conversationLog\` with a summary of: what was asked, what was done, key decisions made.

## Available Tools

| Tool | Purpose | When to Call |
|------|---------|--------------|
| \`remb_loadProjectContext\` | Full project context bundle — memories, features, tech stack | **Session start** (mandatory) |
| \`remb_conversationHistory\` | Prior session history — what was done before | **Session start** (mandatory) |
| \`remb_conversationLog\` | Record work done in this session | After completing tasks, and at session end |
| \`remb_saveContext\` | Save feature-specific context or decisions | When you learn something about a specific feature |
| \`remb_getContext\` | Retrieve context for a specific feature | When you need details about a feature |
| \`remb_listMemories\` | Browse persistent memories | When searching for past decisions or patterns |
| \`remb_createMemory\` | Save a new persistent memory | When discovering patterns, decisions, gotchas |
| \`remb_triggerScan\` | Re-scan the codebase from GitHub or locally | After significant code changes |
| \`remb_scanStatus\` | Check scan progress | After triggering a scan |

## Decision Matrix

| Situation | Action |
|-----------|--------|
| Starting any session | \`remb_loadProjectContext\` + \`remb_conversationHistory\` |
| Completing a task | \`remb_conversationLog\` with what was accomplished |
| Found a reusable pattern | \`remb_createMemory\` with category "pattern" |
| Made an architectural decision | \`remb_createMemory\` with category "decision" |
| Discovered a gotcha or bug | \`remb_createMemory\` with category "gotcha" |
| Need info about a feature | \`remb_getContext\` filtered by feature name |
| User says "remember this" | \`remb_createMemory\` with appropriate tier |
| Code changed significantly | \`remb_triggerScan\` to refresh context |
| Ending the session | \`remb_conversationLog\` with session summary |
`;
}

function generateWithFrontmatter(slug: string): string {
  return `---
applyTo: "**"
---
${generateBody(slug)}`;
}

function generatePlain(slug: string): string {
  return generateBody(slug);
}

/**
 * Generates the dynamic context body with actual project data.
 * This is the content that gets injected into every IDE prompt.
 */
function generateDynamicBody(
  slug: string,
  context: string,
  history: string,
  memories: string,
  activity: string,
  skills?: string,
): string {
  const timestamp = new Date().toISOString().slice(0, 16);
  const sections = [
    `${DYNAMIC_MARKER}`,
    `# Remb — Live Project Context`,
    ``,
    `> **Project**: ${slug} | **Refreshed**: ${timestamp}`,
    `> This file is auto-generated and gitignored. It injects real project context into every prompt.`,
    `> For the full context bundle, call \`remb_loadProjectContext\`.`,
    ``,
  ];

  if (skills) {
    sections.push(skills, "");
  }

  if (memories) {
    sections.push(memories, "");
  }

  if (activity) {
    sections.push(activity, "");
  }

  if (history) {
    sections.push(history, "");
  }

  if (context) {
    sections.push("## Project Context Summary", "", context, "");
  }

  sections.push(
    "---",
    "",
    "_You already have the above context. Use `remb_conversationLog` to record what you accomplish in this session. Use `remb_createMemory` for important discoveries._",
    ""
  );

  return sections.join("\n");
}
