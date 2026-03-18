import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { execSync } from "node:child_process";
import { createApiClient } from "../lib/api-client.js";
import { info, success } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const diffCommand = new Command("diff")
  .description(
    "Analyze uncommitted local changes and save them as project context",
  )
  .option(
    "-p, --project <slug>",
    "Project slug (reads from .remb.yml if omitted)",
  )
  .option("--staged", "Only analyze staged changes")
  .option("--all", "Include both staged and unstaged changes (default)")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb diff\n  $ remb diff --staged\n  $ remb diff -p my-app`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);

    // Collect git diff from local repo
    let diff = "";
    try {
      if (opts.staged) {
        diff = execSync("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
      } else {
        const staged = execSync("git diff --staged", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        const unstaged = execSync("git diff", { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        diff = [staged, unstaged].filter(Boolean).join("\n");
      }
    } catch (err) {
      error(
        "Failed to run git diff. Make sure you're inside a git repository.",
      );
      process.exit(1);
    }

    if (!diff.trim()) {
      info("No local changes detected. Make some changes and try again, or use `remb push` to scan remote.");
      return;
    }

    // Truncate if too large (API limit is 200KB)
    const maxLen = 190_000;
    if (diff.length > maxLen) {
      info(
        chalk.yellow(
          `Diff is ${Math.round(diff.length / 1024)}KB — truncating to ${Math.round(maxLen / 1024)}KB for analysis.`,
        ),
      );
      diff = diff.slice(0, maxLen);
    }

    const spinner = ora("Analyzing local changes with AI...").start();

    try {
      const client = createApiClient();
      const result = await client.saveDiff({
        projectSlug,
        diff,
      });

      spinner.stop();

      if (result.analyzed === 0) {
        info("No significant feature-level changes detected in the diff.");
        return;
      }

      success(`Analyzed ${chalk.bold(result.analyzed)} feature-level changes:`);
      console.log();

      for (const change of result.changes) {
        const imp = change.importance >= 8 ? chalk.red("●") : change.importance >= 5 ? chalk.yellow("●") : chalk.dim("●");
        console.log(
          `  ${imp} ${chalk.bold(change.feature_name)} ${chalk.dim(`(${change.category})`)}`,
        );
        console.log(`    ${change.summary}`);
        if (change.files_changed.length > 0) {
          console.log(
            `    ${chalk.dim(change.files_changed.slice(0, 5).join(", "))}${change.files_changed.length > 5 ? chalk.dim(` +${change.files_changed.length - 5} more`) : ""}`,
          );
        }
        console.log();
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });

