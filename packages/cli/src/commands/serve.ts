import { Command } from "commander";
import chalk from "chalk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createApiClient } from "../lib/api-client.js";
import { findProjectConfig } from "../lib/config.js";
import { info, error as logError, success } from "../lib/output.js";

export const serveCommand = new Command("serve")
  .description("Start the MCP server for AI tool integration")
  .option("--project <slug>", "Default project slug")
  .action(async (opts) => {
    const projectSlug =
      opts.project ?? findProjectConfig()?.config.project ?? undefined;

    let client: ReturnType<typeof createApiClient>;
    try {
      client = createApiClient();
    } catch (err) {
      logError(
        err instanceof Error ? err.message : "Failed to create API client"
      );
      process.exit(1);
    }

    const server = new McpServer({
      name: "remb",
      version: "0.1.0",
    });

    // ── Tool: save_context ──────────────────────────────────
    server.tool(
      "save_context",
      "Save a context entry for a project feature. Use this to persist knowledge about a codebase feature, decision, or change.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Project slug (uses default if omitted)"),
        featureName: z.string().describe("Feature or module name"),
        content: z
          .string()
          .describe("The context text to save (max 50,000 chars)"),
        entryType: z
          .string()
          .optional()
          .describe("Entry type: manual, scan, link, decision, note"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        if (!slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No project specified. Pass projectSlug or run with --project flag.",
              },
            ],
          };
        }

        try {
          const result = await client.saveContext({
            projectSlug: slug,
            featureName: params.featureName,
            content: params.content,
            entryType: params.entryType,
            tags: params.tags,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `Context saved successfully.\nID: ${result.id}\nFeature: ${result.featureName}\nCreated: ${result.created_at}`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error saving context: ${err instanceof Error ? err.message : "Unknown error"}`,
              },
            ],
          };
        }
      }
    );

    // ── Tool: get_context ───────────────────────────────────
    server.tool(
      "get_context",
      "Retrieve context entries for a project, optionally filtered by feature. Use this to recall past decisions, architecture notes, and feature knowledge.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Project slug (uses default if omitted)"),
        featureName: z
          .string()
          .optional()
          .describe("Filter by feature name"),
        limit: z
          .number()
          .optional()
          .describe("Max entries to return (default 10, max 100)"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        if (!slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No project specified. Pass projectSlug or run with --project flag.",
              },
            ],
          };
        }

        try {
          const result = await client.getContext({
            projectSlug: slug,
            featureName: params.featureName,
            limit: params.limit,
          });

          if (result.entries.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: params.featureName
                    ? `No context entries found for feature "${params.featureName}" in project "${slug}".`
                    : `No context entries found for project "${slug}".`,
                },
              ],
            };
          }

          const formatted = result.entries
            .map(
              (e) =>
                `## ${e.feature} [${e.entry_type}]\n_${e.source} — ${e.created_at.slice(0, 10)}_\n\n${e.content}`
            )
            .join("\n\n---\n\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Found ${result.total} entries:\n\n${formatted}`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error retrieving context: ${err instanceof Error ? err.message : "Unknown error"}`,
              },
            ],
          };
        }
      }
    );

    // ── Tool: load_project_context ────────────────────────
    server.tool(
      "load_project_context",
      "Load the full project context bundle including memories, features, and tech stack as a structured markdown document. Use this when you need comprehensive project understanding.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Project slug (uses default if omitted)"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        if (!slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No project specified. Pass projectSlug or run with --project flag.",
              },
            ],
          };
        }

        try {
          const bundle = await client.bundleContext(slug);

          return {
            content: [
              {
                type: "text" as const,
                text: bundle.markdown,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error loading project context: ${err instanceof Error ? err.message : "Unknown error"}`,
              },
            ],
          };
        }
      }
    );

    // ── Tool: analyze_diff ──────────────────────────────────
    server.tool(
      "analyze_diff",
      "Analyze a git diff and save the changes as context entries. Use this to capture local uncommitted changes.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Project slug (uses default if omitted)"),
        diff: z
          .string()
          .describe("Git diff text to analyze"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        if (!slug) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No project specified. Pass projectSlug or run with --project flag.",
              },
            ],
          };
        }

        try {
          const result = await client.saveDiff({
            projectSlug: slug,
            diff: params.diff,
          });

          if (result.analyzed === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No significant feature-level changes detected in the diff.",
                },
              ],
            };
          }

          const summary = result.changes
            .map(
              (c) =>
                `- **${c.feature_name}** (${c.category}, importance: ${c.importance}/10): ${c.summary}`
            )
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Analyzed ${result.analyzed} changes:\n\n${summary}`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error analyzing diff: ${err instanceof Error ? err.message : "Unknown error"}`,
              },
            ],
          };
        }
      }
    );

    // ── Tool: memory_list ───────────────────────────────────
    server.tool(
      "memory_list",
      "List AI memories. When a project slug is given, returns both project-scoped memories and global memories (project_id = null). Without a project, returns all memories. Use at session start to load relevant knowledge.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Scope to a project — also includes global memories"),
        tier: z
          .enum(["core", "active", "archive"])
          .optional()
          .describe("Filter by tier: core (always-on), active (on-demand), archive (historical)"),
        category: z
          .enum(["preference", "pattern", "decision", "correction", "knowledge", "general"])
          .optional()
          .describe("Filter by category"),
        search: z.string().optional().describe("Text search against title and content"),
        limit: z.number().optional().describe("Max results (default 20, max 200)"),
      },
      async (params) => {
        try {
          const { memories, total } = await client.listMemories({
            project: params.projectSlug,
            tier: params.tier,
            category: params.category,
            search: params.search,
            limit: params.limit,
          });
          if (memories.length === 0) {
            return { content: [{ type: "text" as const, text: "No memories found." }] };
          }
          const formatted = memories
            .map((m) => {
              const scope = (m as { project_id?: string | null }).project_id ? "[project]" : "[global]";
              return `### ${m.title} ${scope}\n**Tier**: ${m.tier} | **Category**: ${m.category} | **ID**: ${m.id}\n\n${m.content}`;
            })
            .join("\n\n---\n\n");
          return { content: [{ type: "text" as const, text: `${total} memories:\n\n${formatted}` }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: memory_create ─────────────────────────────────
    server.tool(
      "memory_create",
      "Create a new persistent memory. Use to save user preferences, patterns, decisions, or corrections. Omit projectSlug for a global memory that applies across all projects.",
      {
        title: z.string().describe("Short title for the memory"),
        content: z.string().describe("Full content (max 50,000 chars)"),
        tier: z
          .enum(["core", "active", "archive"])
          .optional()
          .describe("Memory tier: core = always loaded, active = on-demand, archive = historical (default: active)"),
        category: z
          .enum(["preference", "pattern", "decision", "correction", "knowledge", "general"])
          .optional()
          .describe("Category (default: general)"),
        tags: z.array(z.string()).optional().describe("Optional tags"),
        projectSlug: z
          .string()
          .optional()
          .describe("Associate with a project — omit to create a global memory"),
      },
      async (params) => {
        try {
          const result = await client.createMemory({
            title: params.title,
            content: params.content,
            tier: params.tier,
            category: params.category,
            tags: params.tags,
            projectSlug: params.projectSlug,
          });
          const scope = params.projectSlug ? `project: ${params.projectSlug}` : "global";
          return {
            content: [
              {
                type: "text" as const,
                text: `Memory created (${scope})\nID: ${result.id}\nTier: ${result.tier} | Category: ${result.category}\nTokens: ${result.token_count}`,
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: memory_update ─────────────────────────────────
    server.tool(
      "memory_update",
      "Update an existing memory by ID — change title, content, tier, category, or tags.",
      {
        id: z.string().describe("Memory UUID"),
        title: z.string().optional(),
        content: z.string().optional(),
        tier: z.enum(["core", "active", "archive"]).optional(),
        category: z
          .enum(["preference", "pattern", "decision", "correction", "knowledge", "general"])
          .optional(),
        tags: z.array(z.string()).optional(),
      },
      async (params) => {
        try {
          const { id, ...updates } = params;
          const result = await client.updateMemory(id, updates);
          return {
            content: [
              {
                type: "text" as const,
                text: `Memory updated\nID: ${result.id}\nTier: ${result.tier} | Category: ${result.category}\nTokens: ${result.token_count}`,
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: memory_delete ─────────────────────────────────
    server.tool(
      "memory_delete",
      "Delete a memory by ID. Use with caution — this is irreversible.",
      {
        id: z.string().describe("Memory UUID to delete"),
      },
      async (params) => {
        try {
          await client.deleteMemory(params.id);
          return { content: [{ type: "text" as const, text: `Memory ${params.id} deleted.` }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: memory_promote ────────────────────────────────
    server.tool(
      "memory_promote",
      "Change a memory's tier. Promoting archive→active→core makes it more readily available. Demoting core→active→archive compresses it to long-term storage.",
      {
        id: z.string().describe("Memory UUID"),
        tier: z.enum(["core", "active", "archive"]).describe("New tier for the memory"),
      },
      async (params) => {
        try {
          const result = await client.updateMemory(params.id, { tier: params.tier });
          return {
            content: [
              { type: "text" as const, text: `Memory promoted to ${result.tier}\nTitle: ${result.title}` },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: conversation_log ──────────────────────────────
    server.tool(
      "conversation_log",
      "Record what was discussed or accomplished in this AI session. Call this after completing significant work so future sessions can pick up where you left off.",
      {
        content: z.string().describe("Summary of what was discussed or accomplished"),
        projectSlug: z
          .string()
          .optional()
          .describe("Associate with a project (uses default project if omitted)"),
        type: z
          .string()
          .optional()
          .describe("Entry type: summary, decision, progress, note (default: summary)"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        try {
          const result = await client.logConversation({
            content: params.content,
            projectSlug: slug,
            type: params.type ?? "summary",
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Conversation logged (ID: ${result.id})\nCreated: ${result.created_at}`,
              },
            ],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Tool: conversation_history ──────────────────────────
    server.tool(
      "conversation_history",
      "Load recent conversation history to understand what was done in prior AI sessions. Call at session start to catch up on prior work.",
      {
        projectSlug: z
          .string()
          .optional()
          .describe("Filter by project (uses default project if omitted)"),
        limit: z.number().optional().describe("Max entries to return (default 20)"),
        from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
        to: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
      },
      async (params) => {
        const slug = params.projectSlug ?? projectSlug;
        try {
          const { entries, total } = await client.getConversationHistory({
            projectSlug: slug,
            limit: params.limit ?? 20,
            startDate: params.from,
            endDate: params.to,
          });
          if (entries.length === 0) {
            return { content: [{ type: "text" as const, text: "No conversation history found." }] };
          }
          const formatted = entries
            .map((e) => `[${e.created_at.slice(0, 10)}] ${e.type}: ${e.content}`)
            .join("\n\n---\n\n");
          return {
            content: [{ type: "text" as const, text: `${total} conversation entries:\n\n${formatted}` }],
          };
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : "Unknown"}` }] };
        }
      }
    );

    // ── Start server with stdio transport ───────────────────
    const transport = new StdioServerTransport();

    info(`Starting Remb MCP server...`);
    if (projectSlug) {
      info(`Default project: ${chalk.bold(projectSlug)}`);
    }

    await server.connect(transport);
    success("MCP server running (stdio transport)");
  });
