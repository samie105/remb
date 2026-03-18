import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import {
  handleError,
  validateDateFormat,
  validatePositiveInt,
} from "../lib/shared.js";

/* ─── remb history ─── */

export const historyCommand = new Command("history")
  .description("View conversation history — what AI discussed and did across sessions")
  .option("-s, --search <query>", "Semantic search across conversation history")
  .option("-d, --date <date>", "Filter by specific date (YYYY-MM-DD)")
  .option("--from <date>", "Start date filter (YYYY-MM-DD)")
  .option("--to <date>", "End date filter (YYYY-MM-DD)")
  .option("-l, --limit <n>", "Max entries to show", "20")
  .option("-p, --project <slug>", "Filter by project slug")
  .option("--format <fmt>", "Output format: timeline (default), markdown, json", "timeline")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb history\n  $ remb history -d 2025-01-15\n  $ remb history --search "authentication flow"\n  $ remb history --from 2025-01-01 --to 2025-01-31 --format json`,
  )
  .action(async (opts) => {
    // Validate date inputs
    if (opts.date) validateDateFormat(opts.date, "--date");
    if (opts.from) validateDateFormat(opts.from, "--from");
    if (opts.to) validateDateFormat(opts.to, "--to");
    if (opts.from && opts.to && opts.from > opts.to) {
      console.error(chalk.red("\u2716") + " --from date cannot be after --to date.");
      process.exit(1);
    }
    const limit = parseInt(opts.limit, 10) || 20;
    validatePositiveInt(limit, "Limit", 200);

    const spinner = ora("Loading conversation history...").start();

    try {
      const client = createApiClient();
      const projectSlug = opts.project;

      // ── Semantic search mode ──
      if (opts.search) {
        spinner.text = "Searching conversations...";
        const { results } = await client.searchConversations({
          query: opts.search,
          projectSlug,
          limit,
        });
        spinner.stop();

        if (results.length === 0) {
          console.log(chalk.dim("  No matching conversations found."));
          return;
        }

        if (opts.format === "json") {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        console.log();
        console.log(chalk.bold(`  Search results for "${opts.search}"`));
        console.log(chalk.dim(`  ${results.length} matches\n`));

        for (const r of results) {
          const date = chalk.dim(r.created_at.slice(0, 10));
          const time = chalk.dim(r.created_at.slice(11, 16));
          const sim = chalk.green(`${(r.similarity * 100).toFixed(0)}%`);
          const tags = r.tags?.length ? chalk.blue(` [${r.tags.join(", ")}]`) : "";
          const proj = r.project_slug ? chalk.dim(` (${r.project_slug})`) : "";
          console.log(`  ${date} ${time} ${sim}${proj}${tags}`);
          console.log(`    ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`);
          console.log();
        }
        return;
      }

      // Build date params
      let startDate: string | undefined;
      let endDate: string | undefined;
      if (opts.date) {
        startDate = `${opts.date}T00:00:00Z`;
        endDate = `${opts.date}T23:59:59Z`;
      } else {
        if (opts.from) startDate = `${opts.from}T00:00:00Z`;
        if (opts.to) endDate = `${opts.to}T23:59:59Z`;
      }

      // JSON format → raw API response
      if (opts.format === "json") {
        const result = await client.getConversationHistory({
          projectSlug,
          startDate,
          endDate,
          limit,
          format: "json",
        });
        spinner.stop();
        console.log(JSON.stringify(result.entries, null, 2));
        return;
      }

      // Markdown format → server-generated markdown
      if (opts.format === "markdown") {
        const result = await client.getConversationHistory({
          projectSlug,
          startDate,
          endDate,
          limit,
          format: "json",
        });
        spinner.stop();
        printMarkdown(result.entries);
        return;
      }

      // Default: timeline format
      const result = await client.getConversationHistory({
        projectSlug,
        startDate,
        endDate,
        limit,
        format: "json",
      });

      spinner.stop();

      if (result.entries.length === 0) {
        console.log(chalk.dim("  No conversation history. AI sessions log here automatically via MCP."));
        return;
      }

      console.log();
      console.log(chalk.bold("  Conversation History"));
      console.log(chalk.dim(`  ${result.total} entries\n`));

      // Group by date
      const grouped = new Map<string, typeof result.entries>();
      for (const entry of result.entries) {
        const date = entry.created_at.slice(0, 10);
        const list = grouped.get(date) ?? [];
        list.push(entry);
        grouped.set(date, list);
      }

      for (const [date, entries] of grouped) {
        console.log(chalk.bold.blue(`  ${date}`));
        for (const e of entries) {
          const time = chalk.dim(e.created_at.slice(11, 16));
          const icon =
            e.type === "tool_call"
              ? chalk.yellow("⚡")
              : e.type === "milestone"
                ? chalk.green("◆")
                : chalk.cyan("●");
          const src = e.source !== "mcp" ? chalk.dim(` [${e.source}]`) : "";
          console.log(`    ${time} ${icon}${src} ${e.content}`);
        }
        console.log();
      }
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });

/* ─── markdown printer ─── */

function printMarkdown(
  entries: Array<{
    created_at: string;
    type: string;
    content: string;
    source: string;
  }>
) {
  if (entries.length === 0) {
    console.log("No conversation history. AI sessions log here automatically via MCP.");
    return;
  }

  // Reverse to chronological
  const chronological = [...entries].reverse();

  const grouped = new Map<string, typeof chronological>();
  for (const entry of chronological) {
    const date = entry.created_at.slice(0, 10);
    const list = grouped.get(date) ?? [];
    list.push(entry);
    grouped.set(date, list);
  }

  console.log("# Conversation History\n");
  for (const [date, dayEntries] of grouped) {
    console.log(`## ${date}\n`);
    for (const e of dayEntries) {
      const time = e.created_at.slice(11, 16);
      const icon = e.type === "tool_call" ? "🔧" : e.type === "milestone" ? "🏁" : "💬";
      const src = e.source !== "mcp" ? ` [${e.source}]` : "";
      console.log(`- **${time}** ${icon}${src} ${e.content}`);
    }
    console.log();
  }
}
