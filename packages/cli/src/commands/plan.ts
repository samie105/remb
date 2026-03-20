import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createApiClient } from "../lib/api-client.js";
import { info, success, warn } from "../lib/output.js";
import { resolveProject, handleError } from "../lib/shared.js";

export const planCommand = new Command("plan")
  .description("View and manage active plans for a project")
  .option(
    "-p, --project <slug>",
    "Project slug (reads from .remb.yml if omitted)",
  )
  .option("--json", "Output raw JSON instead of formatted text")
  .addHelpText(
    "after",
    `\nExamples:\n  $ remb plan\n  $ remb plan -p my-app\n  $ remb plan --json`,
  )
  .action(async (opts) => {
    const projectSlug = resolveProject(opts.project);
    const spinner = ora("Fetching plans...").start();

    try {
      const client = createApiClient();
      const { plans } = await client.getPlans(projectSlug);

      spinner.stop();

      if (opts.json) {
        console.log(JSON.stringify(plans, null, 2));
        return;
      }

      if (plans.length === 0) {
        info("No active plans for this project.");
        info(
          chalk.dim(
            "Create a plan at: https://www.useremb.com/dashboard/" +
              projectSlug +
              "/plan",
          ),
        );
        return;
      }

      for (const plan of plans) {
        console.log("");
        console.log(
          chalk.bold(`📋 ${plan.title}`) +
            chalk.dim(` (${plan.status})`),
        );
        if (plan.description) {
          console.log(chalk.dim(`   ${plan.description}`));
        }

        if (plan.phases.length > 0) {
          console.log("");
          for (const phase of plan.phases) {
            const icon =
              phase.status === "completed"
                ? chalk.green("✅")
                : phase.status === "in_progress"
                  ? chalk.yellow("🔄")
                  : chalk.dim("⬜");
            const title =
              phase.status === "completed"
                ? chalk.strikethrough(phase.title)
                : phase.title;
            const desc = phase.description
              ? chalk.dim(` — ${phase.description}`)
              : "";
            console.log(`   ${icon} ${title}${desc}`);
          }
        }

        const completed = plan.phases.filter(
          (p) => p.status === "completed",
        ).length;
        const total = plan.phases.length;
        if (total > 0) {
          console.log("");
          info(
            `   Progress: ${completed}/${total} phases completed`,
          );
        }
      }
      console.log("");
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });

// Subcommand: complete a phase
planCommand
  .command("complete <phase-id>")
  .description("Mark a plan phase as completed")
  .option("-p, --project <slug>", "Project slug")
  .option("--plan <id>", "Plan ID")
  .action(async (phaseId, opts) => {
    const projectSlug = resolveProject(opts.project);
    const spinner = ora("Completing phase...").start();

    try {
      const client = createApiClient();

      // Resolve plan ID
      let planId = opts.plan;
      if (!planId) {
        const { plans } = await client.getPlans(projectSlug);
        if (plans.length === 0) throw new Error("No active plans found");
        // Find the plan containing this phase
        const plan = plans.find((p) =>
          p.phases.some((ph) => ph.id === phaseId),
        );
        if (!plan) throw new Error("Phase not found in any active plan");
        planId = plan.id;
      }

      const { updated } = await client.updatePlanPhase({
        projectSlug,
        planId,
        phaseId,
        action: "complete",
      });

      spinner.stop();
      success(`Phase "${updated.title}" marked as ${updated.status}`);
    } catch (err) {
      spinner.stop();
      handleError(err);
    }
  });
