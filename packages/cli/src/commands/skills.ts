import { Command } from "commander";
import chalk from "chalk";
import { resolve, basename } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { findProjectConfig } from "../lib/config.js";
import { success, error, info, warn } from "../lib/output.js";

// ── Constants ────────────────────────────────────────────────────────

const SKILLS_REPO_OWNER = "samie105";
const SKILLS_REPO_NAME = "skills";
const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";

/** All known Remb skills */
const KNOWN_SKILLS = [
  "remb-setup",
  "remb-context",
  "remb-memory",
  "remb-scan",
  "remb-import",
  "remb-cross-project",
] as const;

type SkillName = (typeof KNOWN_SKILLS)[number];

// ── IDE Installation Targets ─────────────────────────────────────────

interface IDETarget {
  ide: string;
  dir: (cwd: string, skillName: string) => string;
  filename: (skillName: string) => string;
  transform?: (content: string, skillName: string) => string;
}

const IDE_TARGETS: IDETarget[] = [
  {
    ide: "claude",
    dir: (cwd, skillName) => resolve(cwd, ".claude", "commands", skillName),
    filename: () => "SKILL.md",
  },
  {
    ide: "vscode",
    dir: (cwd, _skillName) => resolve(cwd, ".github", "copilot-skills"),
    filename: (skillName) => `${skillName}.md`,
    transform: (content) => {
      // VS Code Copilot skills: prepend YAML frontmatter with applyTo
      const yamlEnd = content.indexOf("---", 4);
      if (yamlEnd === -1) return content;
      const frontmatter = content.slice(0, yamlEnd + 3);
      const body = content.slice(yamlEnd + 3);
      return frontmatter.replace("---\n", "---\napplyTo: '**'\n") + body;
    },
  },
  {
    ide: "cursor",
    dir: (cwd, _skillName) => resolve(cwd, ".cursor", "rules"),
    filename: (skillName) => `${skillName}.mdc`,
    transform: (content, skillName) => {
      // Cursor uses .mdc format with its own frontmatter
      const parsed = parseFrontmatter(content);
      return [
        "---",
        `description: ${parsed.description || skillName}`,
        "globs: **",
        "alwaysApply: true",
        "---",
        "",
        parsed.body,
      ].join("\n");
    },
  },
  {
    ide: "windsurf",
    dir: (cwd, _skillName) => resolve(cwd, ".windsurf", "rules"),
    filename: (skillName) => `${skillName}.md`,
  },
];

// ── Frontmatter Parser ───────────────────────────────────────────────

interface Frontmatter {
  name?: string;
  version?: string;
  description?: string;
  body: string;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith("---")) {
    return { body: content };
  }
  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return { body: content };

  const yamlBlock = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 3).trim();
  const result: Frontmatter = { body };

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "name") result.name = value;
    if (key === "version") result.version = value;
    if (key === "description") result.description = value;
  }

  return result;
}

// ── GitHub API ────────────────────────────────────────────────────────

interface SkillInfo {
  name: string;
  description: string;
  version: string;
}

async function fetchSkillsList(): Promise<SkillInfo[]> {
  const url = `${GITHUB_API}/repos/${SKILLS_REPO_OWNER}/${SKILLS_REPO_NAME}/contents`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch skills list: ${res.status} ${res.statusText}`);
  }

  const items = (await res.json()) as Array<{ name: string; type: string }>;
  const dirs = items.filter(
    (i) => i.type === "dir" && i.name.startsWith("remb-")
  );

  const skills: SkillInfo[] = [];
  for (const dir of dirs) {
    try {
      const content = await fetchSkillContent(dir.name);
      const fm = parseFrontmatter(content);
      skills.push({
        name: dir.name,
        description: fm.description || "No description",
        version: fm.version || "unknown",
      });
    } catch {
      skills.push({
        name: dir.name,
        description: "Unable to fetch description",
        version: "unknown",
      });
    }
  }

  return skills;
}

async function fetchSkillContent(skillName: string): Promise<string> {
  const url = `${GITHUB_RAW}/${SKILLS_REPO_OWNER}/${SKILLS_REPO_NAME}/main/${skillName}/SKILL.md`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch skill ${skillName}: ${res.status}`);
  }
  return res.text();
}

// ── IDE Detection ─────────────────────────────────────────────────────

function detectIDEs(cwd: string): string[] {
  const detected: string[] = [];

  // Check environment
  const env = process.env;
  if (env.TERM_PROGRAM === "vscode" || env.VSCODE_PID) detected.push("vscode");
  if (env.TERM_PROGRAM === "cursor") detected.push("cursor");
  if (env.TERM_PROGRAM?.toLowerCase() === "windsurf") detected.push("windsurf");
  if (env.CLAUDE_CODE === "1" || env.TERM_PROGRAM === "claude") detected.push("claude");

  // Check for existing IDE directories
  if (existsSync(resolve(cwd, ".github"))) {
    if (!detected.includes("vscode")) detected.push("vscode");
  }
  if (existsSync(resolve(cwd, ".cursor"))) {
    if (!detected.includes("cursor")) detected.push("cursor");
  }
  if (existsSync(resolve(cwd, ".windsurf")) || existsSync(resolve(cwd, ".windsurfrules"))) {
    if (!detected.includes("windsurf")) detected.push("windsurf");
  }
  if (existsSync(resolve(cwd, "CLAUDE.md")) || existsSync(resolve(cwd, ".claude"))) {
    if (!detected.includes("claude")) detected.push("claude");
  }

  // Fallback: if none detected, install for all
  if (detected.length === 0) {
    return ["vscode", "cursor", "windsurf", "claude"];
  }

  return detected;
}

// ── Config: track installed skills in .remb.yml ──────────────────────

function getInstalledSkills(cwd: string): string[] {
  const config = findProjectConfig(cwd);
  if (!config) return [];

  const configPath = resolve(config.dir, ".remb.yml");
  if (!existsSync(configPath)) return [];

  const raw = readFileSync(configPath, "utf-8");
  // Parse skills line: skills: remb-context, remb-memory, remb-scan
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

function updateInstalledSkills(cwd: string, skills: string[]): void {
  const config = findProjectConfig(cwd);
  if (!config) return;

  const configPath = resolve(config.dir, ".remb.yml");
  if (!existsSync(configPath)) return;

  let raw = readFileSync(configPath, "utf-8");
  const skillsLine = `skills: ${skills.join(", ")}`;

  // Replace existing skills line or append
  const lines = raw.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("skills:"));
  if (idx !== -1) {
    lines[idx] = skillsLine;
  } else {
    // Add after last non-empty line
    lines.push(skillsLine);
  }

  raw = lines.join("\n");
  if (!raw.endsWith("\n")) raw += "\n";
  writeFileSync(configPath, raw, "utf-8");
}

// ── Install/Uninstall Logic ──────────────────────────────────────────

function installSkillForIDE(
  cwd: string,
  skillName: string,
  content: string,
  target: IDETarget
): string | null {
  const dir = target.dir(cwd, skillName);
  const filename = target.filename(skillName);
  const filePath = resolve(dir, filename);

  const finalContent = target.transform
    ? target.transform(content, skillName)
    : content;

  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, finalContent, "utf-8");
  return filePath;
}

function uninstallSkillForIDE(
  cwd: string,
  skillName: string,
  target: IDETarget
): boolean {
  const dir = target.dir(cwd, skillName);
  const filename = target.filename(skillName);
  const filePath = resolve(dir, filename);

  if (existsSync(filePath)) {
    rmSync(filePath);

    // Clean up empty directory (for claude commands)
    try {
      const remaining = readdirSync(dir);
      if (remaining.length === 0) {
        rmSync(dir, { recursive: true });
      }
    } catch {
      // ignore
    }

    return true;
  }
  return false;
}

// ── Commands ─────────────────────────────────────────────────────────

export const skillsCommand = new Command("skills")
  .description("Install and manage Remb skills for your IDE")
  .addHelpText(
    "after",
    `
Examples:
  remb skills list                  List available skills
  remb skills add remb-context      Install a skill
  remb skills add --all             Install all skills
  remb skills remove remb-context   Remove a skill
  remb skills update                Update all installed skills`
  );

// ── skills list ──────────────────────────────────────────────────────

skillsCommand
  .command("list")
  .description("List available Remb skills")
  .action(async () => {
    try {
      info("Fetching skills from GitHub...");
      const skills = await fetchSkillsList();
      const installed = getInstalledSkills(process.cwd());

      console.log();
      console.log(chalk.bold("Available Remb Skills"));
      console.log(chalk.dim("─".repeat(60)));

      for (const skill of skills) {
        const isInstalled = installed.includes(skill.name);
        const status = isInstalled
          ? chalk.green(" [installed]")
          : "";
        console.log(
          `  ${chalk.cyan(skill.name)}${status}  ${chalk.dim(`v${skill.version}`)}`
        );
        console.log(`    ${skill.description}`);
        console.log();
      }

      console.log(
        chalk.dim(`Install a skill: ${chalk.bold("remb skills add <name>")}`)
      );
    } catch (err) {
      error(`Failed to list skills: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── skills add ───────────────────────────────────────────────────────

skillsCommand
  .command("add [name]")
  .description("Install a Remb skill into your IDE")
  .option("--all", "Install all available skills")
  .option("--ide <ide>", "Target specific IDE: vscode, cursor, windsurf, claude")
  .action(async (name: string | undefined, opts: { all?: boolean; ide?: string }) => {
    const cwd = process.cwd();

    if (!name && !opts.all) {
      error("Specify a skill name or use --all to install all skills.");
      console.log(chalk.dim("  Run `remb skills list` to see available skills."));
      process.exit(1);
    }

    const skillNames = opts.all ? [...KNOWN_SKILLS] : [name!];

    // Validate skill names
    for (const sn of skillNames) {
      if (!KNOWN_SKILLS.includes(sn as SkillName)) {
        warn(`Unknown skill: ${sn}. Attempting to fetch anyway...`);
      }
    }

    // Determine target IDEs
    const targetIDEs = opts.ide
      ? IDE_TARGETS.filter((t) => t.ide === opts.ide)
      : IDE_TARGETS.filter((t) => detectIDEs(cwd).includes(t.ide));

    if (targetIDEs.length === 0) {
      error("No target IDEs detected. Use --ide to specify one.");
      process.exit(1);
    }

    const installed = getInstalledSkills(cwd);

    for (const skillName of skillNames) {
      try {
        info(`Downloading ${chalk.cyan(skillName)}...`);
        const content = await fetchSkillContent(skillName);

        for (const target of targetIDEs) {
          const filePath = installSkillForIDE(cwd, skillName, content, target);
          if (filePath) {
            const rel = filePath.replace(cwd + "/", "");
            console.log(`  ${chalk.green("✓")} ${target.ide}: ${chalk.dim(rel)}`);
          }
        }

        if (!installed.includes(skillName)) {
          installed.push(skillName);
        }

        success(`Installed ${skillName}`);
      } catch (err) {
        error(`Failed to install ${skillName}: ${(err as Error).message}`);
      }
    }

    // Update .remb.yml
    updateInstalledSkills(cwd, installed);
    addSkillsToGitignore(cwd);
  });

// ── skills remove ────────────────────────────────────────────────────

skillsCommand
  .command("remove <name>")
  .description("Remove an installed Remb skill")
  .action(async (name: string) => {
    const cwd = process.cwd();
    let removed = false;

    for (const target of IDE_TARGETS) {
      if (uninstallSkillForIDE(cwd, name, target)) {
        console.log(`  ${chalk.green("✓")} Removed from ${target.ide}`);
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

// ── skills update ────────────────────────────────────────────────────

skillsCommand
  .command("update")
  .description("Update all installed skills to their latest versions")
  .action(async () => {
    const cwd = process.cwd();
    const installed = getInstalledSkills(cwd);

    if (installed.length === 0) {
      info("No skills installed. Run `remb skills add <name>` to install one.");
      return;
    }

    info(`Updating ${installed.length} skill(s)...`);

    const targetIDEs = IDE_TARGETS.filter((t) =>
      detectIDEs(cwd).includes(t.ide)
    );

    for (const skillName of installed) {
      try {
        const content = await fetchSkillContent(skillName);
        for (const target of targetIDEs) {
          installSkillForIDE(cwd, skillName, content, target);
        }
        success(`Updated ${skillName}`);
      } catch (err) {
        error(`Failed to update ${skillName}: ${(err as Error).message}`);
      }
    }
  });

// ── Gitignore helper ─────────────────────────────────────────────────

function addSkillsToGitignore(cwd: string): void {
  const gitignorePath = resolve(cwd, ".gitignore");
  const entries = [
    "# Remb skills (managed by remb skills add)",
    ".github/copilot-skills/",
    ".claude/commands/remb-*/",
  ];

  if (!existsSync(gitignorePath)) return;

  const existing = readFileSync(gitignorePath, "utf-8");

  // Check if already present
  if (existing.includes(".github/copilot-skills/")) return;

  const addition = "\n" + entries.join("\n") + "\n";
  writeFileSync(gitignorePath, existing + addition, "utf-8");
}

// ── Init integration ─────────────────────────────────────────────────

const RECOMMENDED_SKILLS: SkillName[] = ["remb-context", "remb-memory", "remb-scan"];

/**
 * Called from `remb init` to install recommended skills after project setup.
 */
export async function installSkillsAfterInit(cwd: string, ide: string): Promise<void> {
  const detectedIDEs = ide === "all"
    ? ["vscode", "cursor", "windsurf", "claude"]
    : [ide];

  const targetIDEs = IDE_TARGETS.filter((t) => detectedIDEs.includes(t.ide));
  if (targetIDEs.length === 0) return;

  const installed: string[] = [];

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
