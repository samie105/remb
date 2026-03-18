import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createApiClient } from "../lib/api-client.js";
import { findProjectConfig } from "../lib/config.js";
import { success, info, keyValue, warn } from "../lib/output.js";
import { handleError } from "../lib/shared.js";

/* ─── remb projects ─── */

export const projectsCommand = new Command("projects")
  .description("Manage projects — list, switch active project")
  .addCommand(projectsListCommand())
  .addCommand(projectsUseCommand());

/* ─── remb projects list ─── */

/* ─── remb projects use ─── */

function projectsUseCommand() {
  return new Command("use")
    .alias("switch")
    .description("Set the active project for this workspace — writes/updates .remb.yml")
    .argument("<slug>", "Project slug to activate")
    .option("--api-url <url>", "API server URL to write into .remb.yml")
    .addHelpText(
      "after",
      `\nExamples:\n  $ remb projects use my-app\n  $ remb projects switch my-app\n  $ remb projects use my-app --api-url https://remb.vercel.app`,
    )
    .action(async (slug: string, opts) => {
      const cwd = process.cwd();
      const existing = findProjectConfig(cwd);
      const configPath = resolve(existing?.dir ?? cwd, ".remb.yml");
      const apiUrl = opts.apiUrl ?? existing?.config.api_url ?? "http://localhost:3000";
      const ide = existing?.config.ide;

      // Validate the slug exists remotely
      const spinner = ora(`Looking up project "${slug}"...`).start();
      try {
        const client = createApiClient();
        const { projects } = await client.listProjects({ status: "active", limit: 200 });
        const found = projects.find((p) => p.slug === slug);
        spinner.stop();
        if (!found) {
          const available = projects.map((p) => `  ${chalk.cyan(p.slug)} — ${p.name}`).join("\n");
          warn(`Project "${slug}" not found. Your projects:\n${available}`);
          process.exit(1);
        }

        // Write .remb.yml
        const lines = [
          "# Remb project configuration",
          `# Updated by remb projects use`,
          "",
          `project: ${slug}`,
          `api_url: ${apiUrl}`,
        ];
        if (ide) lines.push(`ide: ${ide}`);
        lines.push("");
        writeFileSync(configPath, lines.join("\n"), "utf-8");

        success(`Active project set to ${chalk.bold(found.name)} (${chalk.cyan(slug)})`);
        keyValue("Config", configPath);
        keyValue("Features", String(found.feature_count));
        keyValue("Entries", String(found.entry_count));
        if (found.repo_name) keyValue("Repo", found.repo_name);
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}

/* ─── remb projects list ─── */

function projectsListCommand() {
  return new Command("list")
    .alias("ls")
    .description("List all projects")
    .option("--status <status>", "Filter by status")
    .option("-l, --limit <n>", "Max results", "50")
    .option("--format <format>", "Output format: table, json, markdown", "table")
    .addHelpText(
      "after",
      `\nExamples:\n  $ remb projects list\n  $ remb projects ls --format json\n  $ remb projects list --status active`,
    )
    .action(async (opts) => {
      const spinner = ora("Fetching projects...").start();
      try {
        const client = createApiClient();
        const { projects, total } = await client.listProjects({
          status: opts.status,
          limit: parseInt(opts.limit, 10),
        });
        spinner.stop();

        if (projects.length === 0) {
          info("No projects found. Create one with: remb init");
          return;
        }

        info(`${total} project${total === 1 ? "" : "s"} found\n`);

        if (opts.format === "json") {
          console.log(JSON.stringify(projects, null, 2));
          return;
        }

        if (opts.format === "markdown") {
          for (const p of projects) {
            console.log(`### ${p.name}`);
            console.log(`- **Slug**: ${p.slug} | **Status**: ${p.status}`);
            console.log(`- **Language**: ${p.language ?? "—"} | **Branch**: ${p.branch}`);
            console.log(`- **Features**: ${p.feature_count} | **Entries**: ${p.entry_count}`);
            if (p.description) console.log(`- **Description**: ${p.description}`);
            if (p.repo_url) console.log(`- **Repo**: ${p.repo_url}`);
            console.log();
          }
          return;
        }

        // Table format
        const statusColors: Record<string, (s: string) => string> = {
          active: chalk.green,
          archived: chalk.dim,
          draft: chalk.yellow,
        };

        for (const p of projects) {
          const statusFn = statusColors[p.status] ?? chalk.white;
          const lang = p.language ? chalk.dim(`[${p.language}]`) : "";
          console.log(
            `${statusFn(p.status.padEnd(10))} ${chalk.bold(p.name.slice(0, 30).padEnd(32))} ${chalk.dim(p.slug.padEnd(25))} ${lang}`
          );
          console.log(
            `           ${chalk.dim(`${p.feature_count} features, ${p.entry_count} entries`)}${p.repo_name ? chalk.dim(` · ${p.repo_name}`) : ""}`
          );
        }
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}


