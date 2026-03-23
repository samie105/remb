/**
 * Generates an Obsidian-compatible vault inside `.remb/`.
 *
 * Structure:
 *   .remb/
 *     .obsidian/              ← Obsidian config (graph colors, templates)
 *     README.md               ← Vault homepage / MOC
 *     context.md              ← Full markdown context bundle
 *     plan.md                 ← Active plans (if any)
 *     features/
 *       <feature-name>.md     ← One note per feature with YAML frontmatter
 *     memories/
 *       <memory-title>.md     ← Persistent memories
 *
 * Each feature note includes:
 *   - YAML frontmatter (tags, importance, category)
 *   - [[wikilinks]] to files and other features
 *   - File list with paths
 *
 * Opens natively in Obsidian as a zero-config knowledge graph of the codebase.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

export interface VaultFeature {
  name: string;
  category: string;
  importance: number;
  description: string | null;
  files: string[];
}

export interface VaultMemory {
  tier: string;
  category: string;
  title: string;
  content: string;
}

export interface VaultProject {
  name: string;
  description: string | null;
  techStack: string[];
  languages: Record<string, number>;
}

export interface VaultData {
  project: VaultProject;
  features: VaultFeature[];
  memories: VaultMemory[];
  markdown: string;
  plans?: string;
}

/** Slugify a name for filenames */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Generate the Obsidian vault */
export function generateVault(dir: string, data: VaultData): { filesWritten: number } {
  let filesWritten = 0;

  // Create directories
  for (const sub of ["", ".obsidian", "features", "memories"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }

  // ── .obsidian/app.json — minimal config ──
  writeFileSync(
    join(dir, ".obsidian/app.json"),
    JSON.stringify({
      showFrontmatter: true,
      livePreview: true,
      readableLineLength: true,
    }, null, 2),
  );
  filesWritten++;

  // ── .obsidian/graph.json — graph view colors ──
  writeFileSync(
    join(dir, ".obsidian/graph.json"),
    JSON.stringify({
      collapse_filter: false,
      search: "",
      showTags: true,
      showAttachments: false,
      hideUnresolved: false,
      showOrphans: true,
      collapse_color: false,
      colorGroups: [
        { query: "path:features", color: { a: 1, rgb: 14073170 } },  // amber
        { query: "path:memories", color: { a: 1, rgb: 5025616 } },   // teal
        { query: "tag:#core",     color: { a: 1, rgb: 16750848 } },  // orange
      ],
      collapse_display: false,
      showArrow: true,
      textFadeMultiplier: 0,
      nodeSizeMultiplier: 1,
      lineSizeMultiplier: 1,
      collapse_forces: true,
      centerStrength: 0.5,
      repelStrength: 10,
      linkStrength: 1,
      linkDistance: 250,
    }, null, 2),
  );
  filesWritten++;

  // ── Feature notes ──
  const featureLinks: string[] = [];
  for (const feature of data.features) {
    const slug = slugify(feature.name);
    const filename = `features/${slug}.md`;

    const tags = [`feature/${slugify(feature.category)}`, `importance/${feature.importance}`];
    if (feature.importance >= 8) tags.push("core");

    let content = "---\n";
    content += `name: "${feature.name}"\n`;
    content += `category: ${feature.category}\n`;
    content += `importance: ${feature.importance}\n`;
    content += `tags:\n`;
    for (const tag of tags) content += `  - ${tag}\n`;
    content += `files: ${feature.files.length}\n`;
    content += "---\n\n";
    content += `# ${feature.name}\n\n`;
    if (feature.description) content += `${feature.description}\n\n`;

    // File list with links
    if (feature.files.length > 0) {
      content += "## Files\n\n";
      for (const file of feature.files) {
        content += `- \`${file}\`\n`;
      }
      content += "\n";
    }

    // Cross-references to related features (same category or shared files)
    const related = data.features.filter(
      (f) => f.name !== feature.name && (
        f.category === feature.category ||
        f.files.some((file) => feature.files.includes(file))
      ),
    );
    if (related.length > 0) {
      content += "## Related Features\n\n";
      for (const r of related) {
        content += `- [[${slugify(r.name)}|${r.name}]]\n`;
      }
      content += "\n";
    }

    writeFileSync(join(dir, filename), content);
    filesWritten++;
    featureLinks.push(`- [[${slug}|${feature.name}]] — ${feature.description?.slice(0, 80) ?? feature.category}`);
  }

  // ── Memory notes ──
  const memoryLinks: string[] = [];
  for (const memory of data.memories) {
    const slug = slugify(memory.title);
    const filename = `memories/${slug}.md`;

    let content = "---\n";
    content += `title: "${memory.title}"\n`;
    content += `tier: ${memory.tier}\n`;
    content += `category: ${memory.category}\n`;
    content += `tags:\n  - memory/${memory.category}\n  - ${memory.tier}\n`;
    content += "---\n\n";
    content += `# ${memory.title}\n\n`;
    content += memory.content + "\n";

    writeFileSync(join(dir, filename), content);
    filesWritten++;
    memoryLinks.push(`- [[${slug}|${memory.title}]] (${memory.tier}/${memory.category})`);
  }

  // ── README.md — vault homepage / MOC (Map of Content) ──
  let readme = "---\ntags:\n  - moc\n---\n\n";
  readme += `# ${data.project.name}\n\n`;
  if (data.project.description) readme += `> ${data.project.description}\n\n`;

  if (data.project.techStack.length > 0) {
    readme += `**Tech Stack:** ${data.project.techStack.join(", ")}\n\n`;
  }
  if (Object.keys(data.project.languages).length > 0) {
    readme += `**Languages:** ${Object.entries(data.project.languages).map(([k, v]) => `${k} (${v})`).join(", ")}\n\n`;
  }

  readme += "---\n\n";
  readme += `## Features (${data.features.length})\n\n`;
  readme += featureLinks.join("\n") + "\n\n";

  if (memoryLinks.length > 0) {
    readme += `## Memories (${data.memories.length})\n\n`;
    readme += memoryLinks.join("\n") + "\n\n";
  }

  readme += "---\n\n";
  readme += "*Generated by [Remb](https://useremb.com) — AI context management*\n";

  writeFileSync(join(dir, "README.md"), readme);
  filesWritten++;

  // ── context.md — full bundle ──
  writeFileSync(join(dir, "context.md"), data.markdown);
  filesWritten++;

  // ── plan.md (if provided) ──
  if (data.plans) {
    writeFileSync(join(dir, "plan.md"), data.plans);
    filesWritten++;
  }

  // ── Tool integrations ──

  // Foam (VS Code wiki) — .vscode settings for wiki-style links
  mkdirSync(join(dir, ".vscode"), { recursive: true });
  writeFileSync(
    join(dir, ".vscode/settings.json"),
    JSON.stringify({
      "foam.edit.linkReferenceDefinitions": "withExtensions",
      "foam.openDailyNote.directory": "memories",
      "foam.graph.style": { "node": { "note": "#d4a574" } },
    }, null, 2),
  );
  filesWritten++;

  // Continue (.continue/) — context provider reference
  const continueCtx = {
    name: "remb-context",
    description: `Project context for ${data.project.name}`,
    contextProviders: [{
      name: "file",
      params: { path: ".remb/context.md" },
    }],
  };
  mkdirSync(join(dir, ".continue"), { recursive: true });
  writeFileSync(join(dir, ".continue/config.json"), JSON.stringify(continueCtx, null, 2));
  filesWritten++;

  // Cursor rules export — single summary rule
  let cursorRule = `---\ndescription: Auto-generated project context from Remb scan\nglobs: "**"\n---\n\n`;
  cursorRule += `# ${data.project.name} — Project Context\n\n`;
  cursorRule += `Tech: ${data.project.techStack.join(", ")}\n\n`;
  cursorRule += `## Features\n\n`;
  for (const f of data.features) {
    cursorRule += `- **${f.name}** (${f.category}, importance ${f.importance}): ${f.description?.slice(0, 100) ?? ""}`;
    if (f.files.length > 0) cursorRule += ` — files: ${f.files.slice(0, 5).join(", ")}`;
    cursorRule += "\n";
  }
  if (data.memories.length > 0) {
    cursorRule += `\n## Key Memories\n\n`;
    for (const m of data.memories.filter((m) => m.tier === "core").slice(0, 10)) {
      cursorRule += `- **${m.title}** (${m.category}): ${m.content.slice(0, 120)}\n`;
    }
  }
  writeFileSync(join(dir, "cursor-rules.mdc"), cursorRule);
  filesWritten++;

  return { filesWritten };
}

/** Ensure .remb/ is in .gitignore */
export function ensureGitignore(rootDir: string = "."): void {
  const gitignorePath = join(rootDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes(".remb/") && !content.includes(".remb")) {
      appendFileSync(gitignorePath, "\n# Remb vault (local AI context)\n.remb/\n");
    }
  } else {
    writeFileSync(gitignorePath, "# Remb vault (local AI context)\n.remb/\n");
  }
}
