import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createApiClient } from "../lib/api-client.js";
import { info, success } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";
import { generateVault, ensureGitignore } from "../lib/vault-generator.js";

export const contextCommand = new Command("context")
  .description(
    "Download project context and generate an Obsidian-compatible .remb/ vault for AI agents",
  )
  .option(
    "-p, --project <slug>",
    "Project slug (reads from .remb.yml if omitted)",
  )
  .option("-o, --output <path>", "Output file path", ".remb/context.md")
  .option("--json", "Output raw JSON instead of markdown")
  .option("--vault", "Generate full Obsidian vault with feature notes and wikilinks", true)
  .option("--no-vault", "Only write context.md without vault structure")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb context                     # Full Obsidian vault (default)\n  $ remb context --no-vault           # Just context.md\n  $ remb context -p my-app --json\n  $ remb context -o docs/context.md`,
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

      const dir = ".remb";

      // Fetch plans (non-fatal)
      let plansMd: string | undefined;
      try {
        const { plans } = await client.getPlans(projectSlug);
        if (plans.length > 0) {
          plansMd = "# Active Plans\n\n";
          plansMd += "> Use `remb__plan_update_phase` to mark phases completed, `remb__plan_create_phase` to add new phases, and `remb__plan_complete` to finish a plan.\n\n";
          for (const plan of plans) {
            plansMd += `## ${plan.title}\n`;
            if (plan.description) plansMd += `${plan.description}\n`;
            plansMd += "\n";
            if (plan.phases.length > 0) {
              plansMd += "### Phases\n";
              for (const phase of plan.phases) {
                const icon = phase.status === "completed" ? "\u2705" : phase.status === "in_progress" ? "\uD83D\uDD04" : "\u2B1C";
                const desc = phase.description ? ` \u2014 ${phase.description}` : "";
                plansMd += `- ${icon} **${phase.title}** (id: \`${phase.id}\`)${desc}\n`;
              }
              plansMd += "\n";
            }
          }
        }
      } catch { /* non-fatal */ }

      if (opts.vault) {
        // Generate full Obsidian vault
        const { filesWritten } = generateVault(dir, {
          project: bundle.project,
          features: bundle.features,
          memories: bundle.memories,
          markdown: bundle.markdown,
          plans: plansMd,
        });

        ensureGitignore();

        success(`Generated Obsidian vault at ${chalk.bold(".remb/")} (${filesWritten} files)`);
        info(`Features: ${chalk.bold(String(bundle.features.length))}  Memories: ${chalk.bold(String(bundle.memories.length))}`);
        console.log();
        info(`Open ${chalk.bold(".remb/")} as a vault in Obsidian to explore the knowledge graph.`);
      } else {
        // Legacy: just write context.md
        const outPath = opts.output as string;
        const outDir = outPath.includes("/")
          ? outPath.slice(0, outPath.lastIndexOf("/"))
          : dir;

        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, bundle.markdown, "utf-8");

        if (plansMd) {
          writeFileSync(join(outDir, "plan.md"), plansMd, "utf-8");
        }

        ensureGitignore();
        success(`Context saved to ${chalk.bold(outPath)}`);
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
