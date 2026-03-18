import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { success, info, keyValue } from "../lib/output.js";
import {
  handleError,
  confirmAction,
  validateStringLength,
  validateContentSize,
  validateEnum,
  validateUUID,
  validatePositiveInt,
} from "../lib/shared.js";

const VALID_TIERS = ["core", "active", "archive"];
const VALID_CATEGORIES = [
  "preference",
  "pattern",
  "decision",
  "correction",
  "knowledge",
  "general",
];

/* ─── remb memory ─── */

export const memoryCommand = new Command("memory")
  .description("Manage AI memories — add, list, update, delete, and promote")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb memory add -t "Auth pattern" -c "Uses JWT httpOnly cookies"\n  $ remb memory list --tier core\n  $ remb memory update <id> -c "Updated content"\n  $ remb memory delete <id>`,
  )
  .addCommand(memoryAddCommand())
  .addCommand(memoryListCommand())
  .addCommand(memoryUpdateCommand())
  .addCommand(memoryDeleteCommand())
  .addCommand(memoryPromoteCommand());

/* ─── remb memory add ─── */

function memoryAddCommand() {
  return new Command("add")
    .description("Create a new memory")
    .requiredOption("-t, --title <title>", "Memory title")
    .requiredOption("-c, --content <content>", "Memory content")
    .option("--tier <tier>", "Memory tier: core, active, archive", "active")
    .option("--category <category>", "Category: preference, pattern, decision, correction, knowledge, general", "general")
    .option("--tags <tags>", "Comma-separated tags")
    .option("-p, --project <slug>", "Project slug")
    .action(async (opts) => {
      validateStringLength(opts.title, "Title", 200);
      validateContentSize(opts.content, 50);
      validateEnum(opts.tier, "tier", VALID_TIERS);
      validateEnum(opts.category, "category", VALID_CATEGORIES);

      const spinner = ora("Creating memory...").start();
      try {
        const client = createApiClient();
        const result = await client.createMemory({
          title: opts.title,
          content: opts.content,
          tier: opts.tier,
          category: opts.category,
          tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : undefined,
          projectSlug: opts.project,
        });
        spinner.stop();
        success(`Memory created`);
        keyValue("ID", result.id);
        keyValue("Tier", result.tier);
        keyValue("Category", result.category);
        keyValue("Tokens", String(result.token_count));
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}

/* ─── remb memory list ─── */

function memoryListCommand() {
  return new Command("list")
    .alias("ls")
    .description("List memories — shows project-scoped and global memories")
    .option("--tier <tier>", "Filter by tier: core, active, archive")
    .option("--category <category>", "Filter by category")
    .option("-s, --search <query>", "Semantic/text search")
    .option("-p, --project <slug>", "Show memories for a project (includes global memories too)")
    .option("--global", "Show only global memories (no project scope)")
    .option("-l, --limit <n>", "Max results", "20")
    .option("--format <format>", "Output format: table, json, markdown", "table")
    .addHelpText(
      "after",
      `\nMemory scopes:\n  [project]  Scoped to a specific project — relevant to that codebase\n  [global]   No project scope — apply across all projects\n\nExamples:\n  $ remb memory list                          # All memories\n  $ remb memory list --project my-app         # Project + global memories\n  $ remb memory list --global                 # Only global memories\n  $ remb memory list --tier core -s "auth"    # Search core tier`,
    )
    .action(async (opts) => {
      const limit = parseInt(opts.limit, 10) || 20;
      validatePositiveInt(limit, "Limit", 200);
      if (opts.tier) validateEnum(opts.tier, "tier", VALID_TIERS);
      if (opts.category) validateEnum(opts.category, "category", VALID_CATEGORIES);

      const spinner = ora("Fetching memories...").start();
      try {
        const client = createApiClient();
        const listParams: Parameters<ReturnType<typeof createApiClient>["listMemories"]>[0] = {
          tier: opts.tier,
          category: opts.category,
          search: opts.search,
          limit,
        };
        // --global: no project filter, then filter client-side to null project_id
        // --project: pass project slug (API returns project + global)
        if (!opts.global && opts.project) listParams.project = opts.project;
        const { memories: rawMemories, total } = await client.listMemories(listParams);
        const memories = opts.global
          ? rawMemories.filter((m) => (m as { project_id?: string | null }).project_id === null)
          : rawMemories;
        spinner.stop();

        if (memories.length === 0) {
          info("No memories found. Create one with: remb memory add -t \"Title\" -c \"Content\"");
          return;
        }

        info(`${total} memor${total === 1 ? "y" : "ies"} found\n`);

        if (opts.format === "json") {
          console.log(JSON.stringify(memories, null, 2));
          return;
        }

        if (opts.format === "markdown") {
          for (const m of memories) {
            console.log(`### ${m.title}`);
            console.log(`- **Tier**: ${m.tier} | **Category**: ${m.category}`);
            console.log(`- **Tags**: ${m.tags.length ? m.tags.join(", ") : "none"}`);
            console.log(`- **Tokens**: ${m.token_count} | **ID**: ${m.id}`);
            console.log(`\n${m.content}\n`);
          }
          return;
        }

        // Table format
        const tierColors: Record<string, (s: string) => string> = {
          core: chalk.yellow,
          active: chalk.cyan,
          archive: chalk.dim,
        };

        for (const m of memories) {
          const tierFn = tierColors[m.tier] ?? chalk.white;
          const scope = (m as { project_id?: string | null }).project_id
            ? chalk.blue("[project]".padEnd(10))
            : chalk.magenta("[global]".padEnd(10));
          console.log(
            `${scope} ${tierFn(`[${m.tier}]`.padEnd(10))} ${chalk.bold(m.title.slice(0, 45).padEnd(47))} ${chalk.dim(m.category.padEnd(12))} ${chalk.dim(`${m.token_count}t`)}`
          );
          if (m.tags.length) {
            console.log(`                     ${chalk.dim(m.tags.map((t: string) => `#${t}`).join(" "))}`);
          }
        }
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}

/* ─── remb memory update ─── */

function memoryUpdateCommand() {
  return new Command("update")
    .description("Update an existing memory")
    .argument("<id>", "Memory ID")
    .option("-t, --title <title>", "New title")
    .option("-c, --content <content>", "New content")
    .option("--tier <tier>", "New tier")
    .option("--category <category>", "New category")
    .option("--tags <tags>", "Comma-separated tags")
    .action(async (id, opts) => {
      validateUUID(id, "Memory ID");
      if (opts.title) validateStringLength(opts.title, "Title", 200);
      if (opts.content) validateContentSize(opts.content, 50);
      if (opts.tier) validateEnum(opts.tier, "tier", VALID_TIERS);
      if (opts.category) validateEnum(opts.category, "category", VALID_CATEGORIES);

      const spinner = ora("Updating memory...").start();
      try {
        const client = createApiClient();
        const params: Record<string, unknown> = {};
        if (opts.title) params.title = opts.title;
        if (opts.content) params.content = opts.content;
        if (opts.tier) params.tier = opts.tier;
        if (opts.category) params.category = opts.category;
        if (opts.tags) params.tags = opts.tags.split(",").map((t: string) => t.trim());

        const result = await client.updateMemory(id, params);
        spinner.stop();
        success(`Memory updated`);
        keyValue("Tier", result.tier);
        keyValue("Category", result.category);
        keyValue("Tokens", String(result.token_count));
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}

/* ─── remb memory delete ─── */

function memoryDeleteCommand() {
  return new Command("delete")
    .alias("rm")
    .description("Delete a memory")
    .argument("<id>", "Memory ID")
    .option("-f, --force", "Skip confirmation prompt")
    .action(async (id, opts) => {
      validateUUID(id, "Memory ID");

      if (!opts.force) {
        const confirmed = await confirmAction(
          `Delete memory ${chalk.bold(id.slice(0, 8))}...?`,
        );
        if (!confirmed) {
          info("Cancelled.");
          return;
        }
      }

      const spinner = ora("Deleting memory...").start();
      try {
        const client = createApiClient();
        await client.deleteMemory(id);
        spinner.stop();
        success("Memory deleted");
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}

/* ─── remb memory promote ─── */

function memoryPromoteCommand() {
  return new Command("promote")
    .description("Promote a memory to a higher tier (archive→active→core)")
    .argument("<id>", "Memory ID")
    .option("--to <tier>", "Target tier: core, active", "core")
    .action(async (id, opts) => {
      validateUUID(id, "Memory ID");
      validateEnum(opts.to, "tier", ["core", "active"]);

      const spinner = ora(`Promoting memory to ${opts.to}...`).start();
      try {
        const client = createApiClient();
        const result = await client.updateMemory(id, { tier: opts.to });
        spinner.stop();
        success(`Memory promoted to ${result.tier}`);
        keyValue("Title", result.title);
      } catch (err) {
        spinner.stop();
        handleError(err);
      }
    });
}
