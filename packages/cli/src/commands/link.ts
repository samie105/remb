import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { success, keyValue } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const linkCommand = new Command("link")
  .description("Link features together with dependency relationships")
  .requiredOption("--from <feature>", "Source feature name")
  .requiredOption("--to <feature>", "Target feature name")
  .option("--type <relation>", "Relationship: depends_on, extends, uses", "depends_on")
  .option("-p, --project <slug>", "Project slug (reads from .remb.yml if omitted)")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb link --from auth --to users\n  $ remb link --from payments --to auth --type depends_on\n  $ remb link --from api --to database --type uses`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);
    const validTypes = ["depends_on", "extends", "uses"];

    if (!validTypes.includes(opts.type)) {
      error(
        `Invalid relationship type "${opts.type}". Choose: ${validTypes.join(", ")}`
      );
      process.exit(1);
    }

    const spinner = ora("Creating feature link...").start();

    try {
      const client = createApiClient();

      // Create the link via a generic save entry that documents the relationship
      // In a future version this can hit a dedicated /api/cli/link endpoint
      const content = `Feature relationship: ${opts.from} → ${opts.type} → ${opts.to}`;

      const result = await client.saveContext({
        projectSlug,
        featureName: opts.from,
        content,
        entryType: "link",
        tags: ["relationship", opts.type, opts.to],
      });

      spinner.stop();
      console.log();
      success(`Linked ${chalk.bold(opts.from)} → ${chalk.cyan(opts.type)} → ${chalk.bold(opts.to)}`);
      keyValue("ID", result.id);
      keyValue("Project", projectSlug);
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });


