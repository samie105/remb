import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";
import { createApiClient } from "../lib/api-client.js";
import { success, info, warn, error } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export const pushCommand = new Command("push")
  .description(
    "Push latest changes to Remb — verifies recent commits and triggers a cloud scan to update project context",
  )
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .option("--force", "Skip git checks and trigger scan immediately", false)
  .option("--no-progress", "Don't poll for scan progress (fire and forget)", false)
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb push\n  $ remb push --force\n  $ remb push --no-progress -p my-app`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);

    // Pre-flight: check git status
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
        `${chalk.dim("Branch:")} ${gitCheck.branch}  ` +
          `${chalk.dim("Latest commit:")} ${gitCheck.shortSha} — ${gitCheck.commitMessage}`,
      );
      console.log();
    }

    const spinner = ora("Triggering cloud scan...").start();

    try {
      const client = createApiClient();
      const result = await client.triggerScan(projectSlug);

      spinner.stop();
      console.log();

      switch (result.status) {
        case "started":
          success(result.message);
          if (result.scanId) {
            info(`${chalk.dim("Scan ID:")} ${result.scanId.slice(0, 8)}`);
          }
          // Poll for progress if we have a scan ID
          if (result.scanId && opts.progress !== false) {
            console.log();
            await pollScanProgress(client, result.scanId);
          } else {
            info(
              chalk.dim(
                "The scan runs in the cloud — check the dashboard for progress.",
              ),
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

async function pollScanProgress(client: ReturnType<typeof createApiClient>, scanId: string) {
  const spinner = ora({ text: "Waiting for scan to start...", prefixText: "" }).start();
  let lastLogCount = 0;
  const printedFiles = new Set<string>();
  const pollStart = Date.now();

  while (true) {
    // Timeout guard — exit after 15 minutes
    if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
      spinner.stop();
      warn("Scan appears to have timed out. Check the dashboard for status.");
      break;
    }

    await sleep(2000);

    let status;
    try {
      status = await client.getScanStatus(scanId);
    } catch {
      // Network blip — keep trying
      continue;
    }

    if (status.status === "queued") {
      spinner.text = "Scan queued, waiting to start...";
      continue;
    }

    if (status.status === "running") {
      const pct = status.percentage;
      const bar = progressBar(pct, 20);
      spinner.text = `Scanning ${bar} ${chalk.bold(`${pct}%`)} ${chalk.dim(`(${status.filesScanned}/${status.filesTotal} files)`)}`;

      // Print new log entries
      if (status.logs.length > lastLogCount) {
        const newLogs = status.logs.slice(lastLogCount);
        for (const log of newLogs) {
          if (printedFiles.has(log.file)) continue;
          printedFiles.add(log.file);
          spinner.stop();
          const icon = log.status === "done" ? chalk.green("✓")
            : log.status === "skipped" ? chalk.dim("○")
            : log.status === "error" ? chalk.red("✗")
            : chalk.yellow("⠋");
          const feature = log.feature ? chalk.cyan(` → ${log.feature}`) : "";
          const msg = log.message && log.status === "error" ? chalk.red(` (${log.message})`) : "";
          console.log(`  ${icon} ${chalk.dim(truncatePath(log.file, 50))}${feature}${msg}`);
          spinner.start();
        }
        lastLogCount = status.logs.length;
      }
      continue;
    }

    // Terminal states: done or failed
    spinner.stop();
    console.log();

    if (status.status === "done") {
      const dur = status.durationMs > 0 ? formatDuration(status.durationMs) : "";
      success(
        `Scan complete — ${chalk.bold(status.featuresCreated)} features from ${chalk.bold(status.filesScanned)} files` +
        (dur ? ` ${chalk.dim(`in ${dur}`)}` : ""),
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

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty));
}

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  return "…" + p.slice(-(maxLen - 1));
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


interface GitCheckResult {
  ok: boolean;
  message: string;
  warning?: string;
  branch: string;
  shortSha: string;
  commitMessage: string;
}

function checkGitStatus(): GitCheckResult {
  try {
    execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
  } catch {
    return {
      ok: false,
      message: "Not inside a git repository. Run this command from your project root.",
      branch: "",
      shortSha: "",
      commitMessage: "",
    };
  }

  // Get current branch
  let branch: string;
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    branch = "unknown";
  }

  // Get latest commit
  let shortSha: string;
  let commitMessage: string;
  try {
    shortSha = execSync("git rev-parse --short HEAD", { stdio: "pipe" })
      .toString()
      .trim();
    commitMessage = execSync("git log -1 --format=%s", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return {
      ok: false,
      message: "No commits found. Make at least one commit before pushing.",
      branch,
      shortSha: "",
      commitMessage: "",
    };
  }

  // Check for uncommitted changes
  let warning: string | undefined;
  try {
    const status = execSync("git status --porcelain", { stdio: "pipe" })
      .toString()
      .trim();
    if (status) {
      warning = `You have uncommitted changes. Only pushed commits will be scanned.`;
    }
  } catch {
    // Ignore
  }

  // Check if local HEAD has been pushed to remote
  try {
    const localSha = execSync("git rev-parse HEAD", { stdio: "pipe" }).toString().trim();
    const remoteBranch = `origin/${branch}`;
    const remoteSha = execSync(`git rev-parse ${remoteBranch}`, { stdio: "pipe" })
      .toString()
      .trim();

    if (localSha !== remoteSha) {
      warning = `Local branch is ahead of remote. Run ${chalk.bold("git push")} first so the cloud scanner has your latest code.`;
    }
  } catch {
    // Remote branch might not exist yet — fine, we'll still let the scan proceed
  }

  return { ok: true, message: "", warning, branch, shortSha, commitMessage };
}

