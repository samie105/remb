import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { success, keyValue } from "../lib/output.js";
import {
  resolveProject,
  handleError,
  validateContentSize,
  validateStringLength,
  validateEnum,
} from "../lib/shared.js";

const VALID_ENTRY_TYPES = ["manual", "scan", "link", "decision", "note"];

export const saveCommand = new Command("save")
  .description("Save a context entry for a project feature")
  .requiredOption("-f, --feature <name>", "Feature or module name")
  .requiredOption("-c, --content <text>", "Context content text")
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .option("-t, --tags <tags>", "Comma-separated tags", "")
  .option("--type <entry-type>", "Entry type", "manual")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb save -f auth -c "JWT tokens stored in httpOnly cookies"\n  $ remb save -f payments -c "Uses Stripe checkout" -t "billing,stripe"\n  $ remb save -f db-schema -c "Users table has soft deletes" --type decision`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);

    // Input validation
    validateStringLength(opts.feature, "Feature name", 200);
    validateContentSize(opts.content, 50);
    validateEnum(opts.type, "entry type", VALID_ENTRY_TYPES);

    const tags = opts.tags
      ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : undefined;

    if (tags && tags.length > 20) {
      console.error(chalk.red("\u2716") + " Too many tags (max 20).");
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
        tags,
      });

      spinner.stop();
      console.log();
      success(`Context saved for ${chalk.bold(opts.feature)}`);
      keyValue("ID", result.id);
      keyValue("Project", projectSlug);
      keyValue("Feature", result.featureName);
      keyValue("Created", result.created_at);
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
