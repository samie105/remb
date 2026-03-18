import chalk from "chalk";

export type OutputFormat = "json" | "table" | "markdown";

interface ContextEntry {
  id: string;
  feature: string;
  content: string;
  entry_type: string;
  source: string;
  metadata: unknown;
  created_at: string;
}

/**
 * Format context entries in the requested output format.
 */
export function formatEntries(
  entries: ContextEntry[],
  format: OutputFormat
): string {
  if (entries.length === 0) {
    return chalk.dim("No entries found.");
  }

  switch (format) {
    case "json":
      return JSON.stringify(entries, null, 2);

    case "markdown":
      return formatMarkdown(entries);

    case "table":
    default:
      return formatTable(entries);
  }
}

function formatTable(entries: ContextEntry[]): string {
  const lines: string[] = [];

  // Header
  const cols = {
    feature: "FEATURE",
    type: "TYPE",
    source: "SOURCE",
    date: "DATE",
    content: "CONTENT",
  };

  // Calculate widths
  const w = {
    feature: Math.max(
      cols.feature.length,
      ...entries.map((e) => e.feature.length)
    ),
    type: Math.max(cols.type.length, ...entries.map((e) => e.entry_type.length)),
    source: Math.max(
      cols.source.length,
      ...entries.map((e) => e.source.length)
    ),
    date: 10, // YYYY-MM-DD
  };

  const header = [
    chalk.bold(cols.feature.padEnd(w.feature)),
    chalk.bold(cols.type.padEnd(w.type)),
    chalk.bold(cols.source.padEnd(w.source)),
    chalk.bold(cols.date.padEnd(w.date)),
    chalk.bold(cols.content),
  ].join("  ");

  lines.push(header);
  lines.push(chalk.dim("─".repeat(Math.min(process.stdout.columns || 100, 120))));

  for (const entry of entries) {
    const date = entry.created_at.slice(0, 10);
    const preview =
      entry.content.length > 60
        ? entry.content.slice(0, 57) + "..."
        : entry.content;

    lines.push(
      [
        chalk.cyan(entry.feature.padEnd(w.feature)),
        chalk.yellow(entry.entry_type.padEnd(w.type)),
        entry.source.padEnd(w.source),
        chalk.dim(date.padEnd(w.date)),
        preview.replace(/\n/g, " "),
      ].join("  ")
    );
  }

  return lines.join("\n");
}

function formatMarkdown(entries: ContextEntry[]): string {
  const lines: string[] = [];
  let currentFeature = "";

  for (const entry of entries) {
    if (entry.feature !== currentFeature) {
      if (currentFeature) lines.push("");
      lines.push(`## ${entry.feature}`);
      currentFeature = entry.feature;
    }

    const date = entry.created_at.slice(0, 10);
    lines.push("");
    lines.push(
      `> **${entry.entry_type}** · ${entry.source} · ${date}`
    );
    lines.push("");
    lines.push(entry.content);
  }

  return lines.join("\n");
}

/** Print a success message */
export function success(msg: string): void {
  console.log(`${chalk.green("✔")} ${msg}`);
}

/** Print an error message */
export function error(msg: string): void {
  console.error(`${chalk.red("✖")} ${msg}`);
}

/** Print a warning */
export function warn(msg: string): void {
  console.log(`${chalk.yellow("!")} ${msg}`);
}

/** Print an info message */
export function info(msg: string): void {
  console.log(`${chalk.blue("ℹ")} ${msg}`);
}

/** Print a dim label: value pair */
export function keyValue(label: string, value: string): void {
  console.log(`  ${chalk.dim(label + ":")} ${value}`);
}
