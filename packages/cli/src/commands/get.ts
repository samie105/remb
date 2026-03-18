import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import {
  formatEntries,
  info,
  type OutputFormat,
} from "../lib/output.js";
import {
  resolveProject,
  handleError,
  validateEnum,
  validatePositiveInt,
} from "../lib/shared.js";

const VALID_FORMATS = ["json", "table", "markdown"];

export const getCommand = new Command("get")
  .description("Retrieve context entries with optional filtering")
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .option("-f, --feature <name>", "Filter by feature name")
  .option("-l, --limit <n>", "Max entries to return", "10")
  .option("--format <format>", "Output format: json, table, markdown", "table")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb get -f auth\n  $ remb get -p my-app --format json\n  $ remb get -l 50 --format markdown`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);
    const limit = parseInt(opts.limit, 10) || 10;
    validatePositiveInt(limit, "Limit", 200);
    validateEnum(opts.format, "format", VALID_FORMATS);
    const format = opts.format as OutputFormat;

    const spinner = ora("Fetching context...").start();

    try {
      const client = createApiClient();
      const result = await client.getContext({
        projectSlug,
        featureName: opts.feature,
        limit,
      });

      spinner.stop();

      if (result.entries.length === 0) {
        info(
          opts.feature
            ? `No entries found for feature ${chalk.bold(opts.feature)} in ${chalk.bold(projectSlug)}.`
            : `No entries found for project ${chalk.bold(projectSlug)}.`
        );
        return;
      }

      console.log(formatEntries(result.entries, format));

      if (format !== "json") {
        console.log();
        info(
          chalk.dim(`Showing ${result.total} entries.`) +
            (result.total >= limit
              ? chalk.dim(` Use --limit to see more.`)
              : "")
        );
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
