import { Command } from "commander";
import chalk from "chalk";

/**
 * `remb push` is now an alias for `remb scan`.
 * Kept for backward compatibility — prints deprecation notice and delegates.
 */
export const pushCommand = new Command("push")
  .description("(Deprecated — use 'remb scan') Trigger a cloud scan")
  .option("-p, --project <slug>", "Project slug")
  .option("--force", "Skip git checks", false)
  .option("--no-progress", "Fire and forget", false)
  .action(async (opts) => {
    console.log(
      chalk.yellow("⚠"),
      chalk.dim("'remb push' is deprecated — use"),
      chalk.bold("remb scan"),
      chalk.dim("instead.\n"),
    );

    // Dynamically import to avoid circular deps
    const { scanCommand } = await import("./scan.js");
    const args: string[] = [];
    if (opts.project) { args.push("-p", opts.project); }
    if (opts.force) args.push("--force");
    if (opts.progress === false) args.push("--no-poll");
    await scanCommand.parseAsync(args, { from: "user" });
  });

