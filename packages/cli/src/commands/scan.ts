import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { scanDirectory } from "../lib/scanner.js";
import { success, info, warn, keyValue } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const scanCommand = new Command("scan")
  .description("Auto-scan a directory to generate context entries")
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .option("--path <directory>", "Directory path to scan", ".")
  .option("-d, --depth <n>", "Max recursion depth", "5")
  .option("--ignore <patterns>", "Comma-separated glob patterns to ignore", "")
  .option("--dry-run", "Preview what would be scanned without saving", false)
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb scan\n  $ remb scan --path src --depth 3\n  $ remb scan --ignore "tests/**,docs/**" --dry-run`,
  )
  .action(async (opts) => {
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
          `Found ${chalk.bold(files.length)} files — this is a large scan. Consider using ${chalk.bold("--ignore")} to exclude test or vendor directories.`,
        );
      }

      console.log();
      info(`Found ${chalk.bold(files.length)} source files across ${chalk.bold(results.length)} directories.`);
      console.log();

      // Preview
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
  });

