import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createApiClient } from "../lib/api-client.js";
import { info, success } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const contextCommand = new Command("context")
  .description(
    "Download the full project context bundle as a .remb/context.md file for AI agents",
  )
  .option(
    "-p, --project <slug>",
    "Project slug (reads from .remb.yml if omitted)",
  )
  .option("-o, --output <path>", "Output file path", ".remb/context.md")
  .option("--json", "Output raw JSON instead of markdown")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb context\n  $ remb context -p my-app --json\n  $ remb context -o docs/context.md`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);
    const spinner = ora("Fetching project context bundle...").start();

    try {
      const client = createApiClient();
      const bundle = await client.bundleContext(projectSlug);

      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(bundle, null, 2));
        return;
      }

      // Write markdown file
      const outPath = opts.output as string;
      const dir = outPath.includes("/")
        ? outPath.slice(0, outPath.lastIndexOf("/"))
        : ".remb";

      mkdirSync(dir, { recursive: true });
      writeFileSync(outPath, bundle.markdown, "utf-8");

      // Ensure .remb/ is in .gitignore
      ensureGitignore(dir);

      success(`Context written to ${chalk.bold(outPath)}`);
      info(
        `${chalk.dim("Project:")} ${bundle.project.name}  ` +
          `${chalk.dim("Memories:")} ${bundle.memories.length}  ` +
          `${chalk.dim("Features:")} ${bundle.features.length}`,
      );
      info(
        chalk.dim(
          "AI agents can read this file for full project understanding.",
        ),
      );
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });

function ensureGitignore(rembDir: string) {
  const gitignorePath = join(process.cwd(), ".gitignore");
  const entry = rembDir.startsWith("./") ? rembDir : `./${rembDir}`;
  const patterns = [rembDir, entry, `${rembDir}/`];

  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, "utf-8");
      const hasEntry = patterns.some((p) => content.split("\n").some((line) => line.trim() === p));
      if (!hasEntry) {
        writeFileSync(
          gitignorePath,
          content.trimEnd() + `\n\n# Remb context (auto-generated)\n${rembDir}/\n`,
          "utf-8",
        );
      }
    }
  } catch {
    // Non-fatal — user can add .remb/ to .gitignore manually
  }
}
