import { Command } from "commander";
import chalk from "chalk";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/login.js";
import { initCommand } from "./commands/init.js";
import { saveCommand } from "./commands/save.js";
import { getCommand } from "./commands/get.js";
import { scanCommand } from "./commands/scan.js";
import { linkCommand } from "./commands/link.js";
import { serveCommand } from "./commands/serve.js";
import { memoryCommand } from "./commands/memory.js";
import { projectsCommand } from "./commands/projects.js";
import { contextCommand } from "./commands/context.js";
import { diffCommand } from "./commands/diff.js";
import { pushCommand } from "./commands/push.js";
import { historyCommand } from "./commands/history.js";
import { planCommand } from "./commands/plan.js";

declare const __CLI_VERSION__: string;

const program = new Command();

program
  .name("remb")
  .description(
    "Persistent memory layer for AI coding sessions — save, retrieve, and visualize project context."
  )
  .version(__CLI_VERSION__, "-v, --version")
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => chalk.bold(cmd.name()),
  });

// ── Auth ────────────────────────────────────────────
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);

// ── Project setup ───────────────────────────────────
program.addCommand(initCommand);

// ── Core context ────────────────────────────────────
program.addCommand(saveCommand);
program.addCommand(getCommand);
program.addCommand(contextCommand);
program.addCommand(diffCommand);
program.addCommand(pushCommand);

// ── Scanning ────────────────────────────────────────
program.addCommand(scanCommand);

// ── Feature links ───────────────────────────────────
program.addCommand(linkCommand);

// ── Memory management ───────────────────────────────
program.addCommand(memoryCommand);

// ── Conversation history ────────────────────────────
program.addCommand(historyCommand);

// ── Projects ────────────────────────────────────────
program.addCommand(projectsCommand);

// ── Plans ───────────────────────────────────────────
program.addCommand(planCommand);

// ── MCP server ──────────────────────────────────────
program.addCommand(serveCommand);

// ── Global error handling ───────────────────────────
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    // Commander throws on --help and --version (exit code 0) — let those through
    if (
      err &&
      typeof err === "object" &&
      "exitCode" in err &&
      (err as { exitCode: number }).exitCode === 0
    ) {
      process.exit(0);
    }

    // Unhandled errors
    if (err instanceof Error && err.message) {
      console.error(`${chalk.red("✖")} ${err.message}`);
    }
    process.exit(1);
  }
}

main();
