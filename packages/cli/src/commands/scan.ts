import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { scanDirectory } from "../lib/scanner.js";
import { success, info, warn, error as logError, keyValue } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const scanCommand = new Command("scan")
  .description("Scan your project to extract features and context")
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .option("--local", "Scan local files instead of GitHub repository", false)
  .option("--path <directory>", "Directory path for local scan", ".")
  .option("-d, --depth <n>", "Max recursion depth for local scan", "5")
  .option("--ignore <patterns>", "Comma-separated glob patterns to ignore", "")
  .option("--dry-run", "Preview what would be scanned without saving", false)
  .option("--no-poll", "Trigger scan without waiting for completion", false)
  .addHelpText(
    "after",
    `
Examples:
  $ remb scan                        # Smart scan via GitHub (recommended)
  $ remb scan --local                # Scan local files
  $ remb scan --local --path src     # Scan specific directory
  $ remb scan --no-poll              # Start scan and exit immediately
  $ remb scan --local --dry-run      # Preview without saving`,
  )
  .action(async (opts) => {
    if (opts.local) {
      await runLocalScan(opts);
    } else {
      await runServerScan(opts);
    }
  });

/* ── Server-side GitHub scan with live polling ──────────────────── */

async function runServerScan(opts: { project?: string; poll: boolean }) {
  const projectSlug = resolveProject(opts.project);
  const client = createApiClient();

  const spinner = ora(`Checking ${chalk.bold(projectSlug)} for changes...`).start();

  try {
    const result = await client.triggerScan(projectSlug);

    if (result.status === "up_to_date") {
      spinner.succeed(chalk.green("Already up to date — no new commits since last scan."));
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
      spinner.fail("Failed to start scan — no scan ID returned.");
      return;
    }

    spinner.succeed(`Scan started for ${chalk.bold(projectSlug)}`);

    if (!opts.poll) {
      info(`Scan ID: ${chalk.dim(result.scanId)}`);
      info(`Run ${chalk.bold(`remb scan -p ${projectSlug}`)} to check progress.`);
      return;
    }

    await pollScan(client, result.scanId);
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
}

async function pollScan(
  client: ReturnType<typeof createApiClient>,
  scanId: string,
) {
  console.log();
  const spinner = ora("Initializing...").start();

  const seenFiles = new Set<string>();
  let lastFeature = "";
  let shownMachineInfo = false;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const status = await client.getScanStatus(scanId);

      // Show machine/sizing info once
      if (!shownMachineInfo && status.machine) {
        spinner.stop();
        info(`Worker: ${chalk.bold(status.machine)}${status.estimatedFiles ? ` (${status.estimatedFiles} files` + (status.estimatedSizeKB ? `, ~${status.estimatedSizeKB >= 1024 ? (status.estimatedSizeKB / 1024).toFixed(1) + "MB" : status.estimatedSizeKB + "KB"}` : "}") + ")" : ""}`);
        spinner.start();
        shownMachineInfo = true;
      }

      if (status.status === "done") {
        spinner.stop();
        printScanSummary(status);
        return;
      }

      if (status.status === "failed") {
        spinner.fail(chalk.red("Scan failed."));
        const logs = status.logs ?? [];
        const errorLogs = logs.filter((l) => l.status === "error");
        if (errorLogs.length > 0) {
          for (const log of errorLogs.slice(-3)) {
            console.log(`  ${chalk.red("✗")} ${log.file} — ${log.message ?? "unknown error"}`);
          }
        }
        process.exit(1);
      }

      // Update progress
      const pct = status.percentage ?? 0;
      const bar = renderProgressBar(pct, 24);
      const fileInfo =
        status.filesScanned != null && status.filesTotal
          ? `${status.filesScanned}/${status.filesTotal} files`
          : "";

      // Show latest features being found
      const newLogs = (status.logs ?? []).filter(
        (l) => l.status === "done" && l.file && !seenFiles.has(l.file),
      );
      for (const log of newLogs) {
        seenFiles.add(log.file);
        if (log.feature) lastFeature = log.feature;
      }

      const featureStr = lastFeature
        ? ` ${chalk.dim("→")} ${chalk.cyan(lastFeature)}`
        : "";
      spinner.text = `${bar} ${fileInfo}${featureStr}`;
    } catch {
      // Network hiccup — retry silently
    }

    await sleep(3000);
  }
}

function renderProgressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return `${chalk.green("█".repeat(filled))}${chalk.dim("░".repeat(empty))} ${chalk.bold(`${pct}%`)}`;
}

function printScanSummary(status: {
  filesScanned: number;
  filesTotal: number;
  featuresCreated: number;
  errors: number;
  durationMs: number;
  machine?: string | null;
  logs?: Array<{ file: string; status: string; feature?: string }>;
}) {
  console.log();
  success("Scan complete!");
  console.log();
  keyValue("  Files scanned", `${status.filesScanned}/${status.filesTotal}`);
  keyValue("  Features found", String(status.featuresCreated));
  if (status.errors > 0) {
    keyValue("  Errors", chalk.yellow(String(status.errors)));
  }
  keyValue("  Duration", formatDuration(status.durationMs));
  if (status.machine) {
    keyValue("  Worker", status.machine);
  }

  // Show features discovered
  const features = new Set<string>();
  for (const log of status.logs ?? []) {
    if (log.feature && log.status === "done") features.add(log.feature);
  }
  if (features.size > 0) {
    console.log();
    info("Features discovered:");
    for (const f of features) {
      console.log(`  ${chalk.cyan("●")} ${f}`);
    }
  }
  console.log();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Local directory scan (legacy) ──────────────────────────────── */

async function runLocalScan(opts: {
  project?: string;
  path: string;
  depth: string;
  ignore: string;
  dryRun: boolean;
}) {
  const projectSlug = resolveProject(opts.project);
  const depth = parseInt(opts.depth, 10) || 5;
  const ignore = opts.ignore
    ? opts.ignore.split(",").map((p: string) => p.trim()).filter(Boolean)
    : [];

  const spinner = ora("Scanning directory...").start();

  try {
    const { files, results } = await scanDirectory({
      path: opts.path,
      depth,
      ignore,
    });

    spinner.stop();

    if (files.length === 0) {
      warn("No source files found in the target directory.");
      return;
    }

    if (files.length > 500) {
      warn(
        `Found ${chalk.bold(files.length)} files — consider using ${chalk.bold("--ignore")} to exclude test directories.`,
      );
    }

    console.log();
    info(`Found ${chalk.bold(files.length)} source files across ${chalk.bold(results.length)} directories.`);
    console.log();

    for (const result of results) {
      console.log(
        `  ${chalk.cyan("●")} ${chalk.bold(result.featureName)} — ${
          result.tags.filter((t) => t !== "auto-scan").join(", ")
        } — ${(result.content.length / 1000).toFixed(1)}KB`
      );
    }
    console.log();

    if (opts.dryRun) {
      info("Dry run — nothing was saved.");
      return;
    }

    const uploadSpinner = ora(
      `Saving ${results.length} context entries...`
    ).start();

    const client = createApiClient();
    const saved = await client.saveBatch(projectSlug, results, (done, total) => {
      uploadSpinner.text = `Saving context entries... ${chalk.bold(`${done}/${total}`)}`;
    });

    uploadSpinner.stop();
    console.log();
    success(
      `Uploaded ${chalk.bold(saved.length)} context entries to ${chalk.bold(projectSlug)}`
    );

    for (const entry of saved) {
      keyValue("  " + entry.featureName, entry.id.slice(0, 8));
    }
  } catch (err) {
    spinner.stop();
    handleError(err);
  }
}

