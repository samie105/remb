import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { handleError, validateDateFormat } from "../lib/shared.js";
import {
  ALL_PARSERS,
  detectAvailableIDEs,
  getParser,
  conversationToEvents,
  type IDEParser,
  type IDESource,
  type IDEProject,
  type ParsedConversation,
} from "../lib/ide-parsers/index.js";

/* ─── Constants ─── */
const BATCH_SIZE = 20;
const MAX_EVENTS_PER_REQUEST = 100;

/* ─── remb import ─── */

export const importCommand = new Command("import")
  .description("Import AI chat history from local IDE storage into Remb")
  .option("--ide <name>", "Import from a specific IDE only (e.g., cursor, claude-code, vscode)")
  .option("--project <id>", "Import a specific project/workspace by its storage ID")
  .option("--remb-project <slug>", "Associate imported conversations with this Remb project")
  .option("--all", "Import all conversations from all detected IDEs without prompting")
  .option("--dry-run", "Show what would be imported without actually sending data")
  .option("--since <date>", "Only import conversations after this date (YYYY-MM-DD)")
  .option("--list", "List detected IDEs and available projects, then exit")
  .option("-l, --limit <n>", "Max conversations to import per project", "100")
  .addHelpText(
    "after",
    `
Supported IDEs:
  cursor          Cursor (VS Code fork)
  claude-code     Claude Code CLI
  vscode          VS Code (GitHub Copilot)
  windsurf        Windsurf (Codeium)
  intellij        IntelliJ IDEA
  pycharm         PyCharm
  android-studio  Android Studio
  visual-studio   Visual Studio (Windows)
  zed             Zed
  sublime-text    Sublime Text (LSP-Copilot)

Examples:
  $ remb import                          # Auto-detect and import interactively
  $ remb import --list                   # List all detected IDEs and projects
  $ remb import --ide cursor             # Import from Cursor only
  $ remb import --ide cursor --project abc123  # Import specific workspace
  $ remb import --all --dry-run          # Preview what would be imported
  $ remb import --since 2025-01-01       # Only import recent conversations
  $ remb import --ide claude-code --remb-project my-app  # Associate with Remb project`,
  )
  .action(async (opts) => {
    try {
      await runImport(opts);
    } catch (err) {
      handleError(err);
    }
  });

/* ─── Main import logic ─── */

interface ImportOpts {
  ide?: string;
  project?: string;
  rembProject?: string;
  all?: boolean;
  dryRun?: boolean;
  since?: string;
  list?: boolean;
  limit?: string;
}

async function runImport(opts: ImportOpts) {
  // Validate options
  if (opts.since) validateDateFormat(opts.since, "--since");
  const limit = Math.min(parseInt(opts.limit ?? "100", 10) || 100, 500);
  const sinceDate = opts.since ? new Date(`${opts.since}T00:00:00Z`) : undefined;

  // Step 1: Detect available IDEs
  const spinner = ora("Detecting installed IDEs...").start();

  let parsers: IDEParser[];
  if (opts.ide) {
    const parser = getParser(opts.ide as IDESource);
    if (!parser) {
      spinner.fail(`Unknown IDE: ${opts.ide}`);
      console.log(chalk.dim(`  Supported: ${ALL_PARSERS.map((p) => p.id).join(", ")}`));
      process.exit(1);
    }
    const available = await parser.detect();
    if (!available) {
      spinner.fail(`${parser.displayName} storage not found on this machine`);
      process.exit(1);
    }
    parsers = [parser];
  } else {
    parsers = await detectAvailableIDEs();
  }

  if (parsers.length === 0) {
    spinner.fail("No supported IDEs detected on this machine");
    process.exit(1);
  }

  spinner.succeed(`Found ${parsers.length} IDE${parsers.length > 1 ? "s" : ""}: ${parsers.map((p) => p.displayName).join(", ")}`);

  // Step 2: List projects for each IDE
  const allProjects: Array<{ parser: IDEParser; project: IDEProject }> = [];

  for (const parser of parsers) {
    const projectSpinner = ora(`  Scanning ${parser.displayName} workspaces...`).start();
    try {
      const projects = await parser.listProjects();

      if (opts.project) {
        // Filter to specific project
        const match = projects.find((p) => p.id === opts.project);
        if (match) {
          allProjects.push({ parser, project: match });
        }
      } else {
        for (const project of projects) {
          allProjects.push({ parser, project });
        }
      }

      projectSpinner.succeed(
        `  ${parser.displayName}: ${projects.length} project${projects.length !== 1 ? "s" : ""} found`,
      );
    } catch {
      projectSpinner.warn(`  ${parser.displayName}: failed to scan`);
    }
  }

  if (allProjects.length === 0) {
    console.log(chalk.yellow("\n  No projects with chat history found."));
    process.exit(0);
  }

  // Step 3: --list mode — just show what's available
  if (opts.list) {
    console.log();
    console.log(chalk.bold("  Available IDE Chat History"));
    console.log();

    let lastIde = "";
    for (const { parser, project } of allProjects) {
      if (parser.id !== lastIde) {
        console.log(chalk.blue(`  ${parser.displayName}`));
        lastIde = parser.id;
      }
      const date = chalk.dim(project.lastModified.toISOString().slice(0, 10));
      const ws = project.workspacePath ? chalk.dim(` → ${project.workspacePath}`) : "";
      console.log(`    ${chalk.green(project.id.slice(0, 12))} ${project.name} ${date}${ws}`);
    }
    console.log();
    console.log(chalk.dim(`  ${allProjects.length} total project(s) across ${parsers.length} IDE(s)`));
    return;
  }

  // Step 4: Parse conversations from each project
  console.log();
  let totalConversations = 0;
  let totalMessages = 0;
  const importQueue: Array<{
    parser: IDEParser;
    project: IDEProject;
    conversation: ParsedConversation;
  }> = [];

  for (const { parser, project } of allProjects) {
    const parseSpinner = ora(`  Parsing ${parser.displayName} / ${project.name}...`).start();
    try {
      let conversations = await parser.parseConversations(project.id);

      // Filter by date if --since specified
      if (sinceDate) {
        conversations = conversations.filter((c) => {
          if (c.startedAt) return c.startedAt >= sinceDate;
          if (c.endedAt) return c.endedAt >= sinceDate;
          return true; // Include if no date info
        });
      }

      // Apply limit
      conversations = conversations.slice(0, limit);

      for (const conv of conversations) {
        importQueue.push({ parser, project, conversation: conv });
        totalMessages += conv.messages.length;
      }
      totalConversations += conversations.length;

      parseSpinner.succeed(
        `  ${parser.displayName} / ${project.name}: ${conversations.length} conversation${conversations.length !== 1 ? "s" : ""} (${conversations.reduce((sum, c) => sum + c.messages.length, 0)} messages)`,
      );
    } catch {
      parseSpinner.warn(`  ${parser.displayName} / ${project.name}: failed to parse`);
    }
  }

  if (importQueue.length === 0) {
    console.log(chalk.yellow("\n  No conversations to import."));
    return;
  }

  // Step 5: Show summary
  console.log();
  console.log(chalk.bold("  Import Summary"));
  console.log(`  ${chalk.green(String(totalConversations))} conversations, ${chalk.green(String(totalMessages))} messages`);
  console.log(`  Each conversation will be AI-summarized and stored with embeddings`);
  if (opts.rembProject) {
    console.log(`  Target project: ${chalk.blue(opts.rembProject)}`);
  }

  // Step 6: Dry run — stop here
  if (opts.dryRun) {
    console.log();
    console.log(chalk.yellow("  Dry run — no data sent. Remove --dry-run to import."));

    // Show a preview of the first few conversations
    const preview = importQueue.slice(0, 5);
    console.log();
    for (const { parser, conversation } of preview) {
      const title = conversation.title ?? conversation.messages[0]?.text.slice(0, 80);
      const date = conversation.startedAt?.toISOString().slice(0, 10) ?? "unknown";
      console.log(`  ${chalk.dim(date)} ${chalk.cyan(parser.displayName)} ${title}`);
    }
    if (importQueue.length > 5) {
      console.log(chalk.dim(`  ... and ${importQueue.length - 5} more`));
    }
    return;
  }

  // Step 7: Import — send to API in batches
  if (!opts.all) {
    console.log();
    console.log(chalk.dim("  Use --all to skip confirmation, or --dry-run to preview."));
    // In a non-interactive context we proceed; in a future version we could add readline confirmation
  }

  const client = createApiClient();
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const importSpinner = ora(`  Importing 0/${importQueue.length}...`).start();

  // Process in batches
  for (let i = 0; i < importQueue.length; i += BATCH_SIZE) {
    const batch = importQueue.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async ({ parser, project, conversation }) => {
        // Convert parsed conversation → RawConversationEvent[]
        const events = conversationToEvents(conversation);
        if (events.length === 0) return "skipped";

        // Cap events per request
        const cappedEvents = events.slice(0, MAX_EVENTS_PER_REQUEST);

        const result = await client.logSmartConversation({
          events: cappedEvents,
          projectSlug: opts.rembProject ?? undefined,
          ideSource: parser.id,
          metadata: {
            import_source: parser.id,
            import_project_name: project.name,
            import_workspace_path: project.workspacePath,
            conversation_id: conversation.id,
            conversation_title: conversation.title,
            started_at: conversation.startedAt?.toISOString(),
            message_count: conversation.messages.length,
          },
        });

        return result.deduplicated ? "deduplicated" : "imported";
      }),
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        if (result.value === "skipped" || result.value === "deduplicated") {
          skipped++;
        } else {
          imported++;
        }
      } else {
        failed++;
      }
    }

    importSpinner.text = `  Importing ${Math.min(i + BATCH_SIZE, importQueue.length)}/${importQueue.length}... (${imported} new, ${skipped} skipped)`;
  }

  importSpinner.succeed(
    `  Import complete: ${chalk.green(String(imported))} imported, ${chalk.yellow(String(skipped))} skipped/deduplicated, ${failed > 0 ? chalk.red(String(failed)) : "0"} failed`,
  );

  if (imported > 0) {
    console.log();
    console.log(chalk.dim("  View imported history: remb history"));
    if (!opts.rembProject) {
      console.log(chalk.dim("  Tip: Use --remb-project <slug> to associate imports with a project"));
    }
  }
}
