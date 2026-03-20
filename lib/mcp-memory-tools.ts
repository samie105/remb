/**
 * Built-in MCP tools for the Remb memory system.
 *
 * These are "native" tools — they don't call an upstream MCP server
 * but instead operate directly on the memories table. They get injected
 * alongside aggregated upstream tools in the MCP route.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai";
import type { AggregatedTool } from "@/lib/mcp-proxy";
import type { MemoryTier, MemoryCategory } from "@/lib/supabase/types";

/* ─── tool prefix ─── */

const PREFIX = "remb";

/**
 * Bump this whenever builtin tools are added, removed, or changed.
 * This ensures connected MCP clients get a `notifications/tools/list_changed`.
 */
export const BUILTIN_TOOLS_VERSION = 4;

/* ─── tool definitions ─── */

export function getBuiltinTools(): AggregatedTool[] {
  return [
    {
      name: `${PREFIX}__memory_list`,
      description: "[Remb] List memories. Filter by tier (core/active/archive), category, or project.",
      inputSchema: {
        type: "object",
        properties: {
          tier: {
            type: "string",
            enum: ["core", "active", "archive"],
            description: "Filter by memory tier",
          },
          category: {
            type: "string",
            enum: ["preference", "pattern", "decision", "correction", "knowledge", "general"],
            description: "Filter by category",
          },
          project_id: {
            type: "string",
            description: "Filter by project ID (also includes global memories)",
          },
        },
      },
      _serverId: "__builtin__",
      _originalName: "memory_list",
    },
    {
      name: `${PREFIX}__memory_search`,
      description: "[Remb] Semantic search across memories. Returns the most relevant memories for a given query.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language query to search memories",
          },
          project_id: {
            type: "string",
            description: "Scope search to a project (also includes global memories)",
          },
          tier: {
            type: "string",
            enum: ["core", "active", "archive"],
            description: "Restrict search to a specific tier",
          },
          limit: {
            type: "number",
            description: "Max results (default: 10)",
          },
        },
        required: ["query"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_search",
    },
    {
      name: `${PREFIX}__memory_load_context`,
      description: "[Remb] Load tiered context for an AI session. Returns all core memories (always-on) plus relevant active memories based on an optional query. Use this at the start of a conversation.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional query to find relevant active memories",
          },
          project_id: {
            type: "string",
            description: "Scope to a project",
          },
        },
      },
      _serverId: "__builtin__",
      _originalName: "memory_load_context",
    },
    {
      name: `${PREFIX}__memory_create`,
      description: "[Remb] Create a new memory. Use this to save user preferences, learned patterns, decisions, corrections, or knowledge for future sessions.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short title for the memory",
          },
          content: {
            type: "string",
            description: "Full content of the memory",
          },
          tier: {
            type: "string",
            enum: ["core", "active", "archive"],
            description: "Memory tier (default: active). Core = always loaded, Active = on-demand, Archive = compressed long-term",
          },
          category: {
            type: "string",
            enum: ["preference", "pattern", "decision", "correction", "knowledge", "general"],
            description: "Category of the memory (default: general)",
          },
          project_id: {
            type: "string",
            description: "Associate with a project (omit for global memory)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for organization",
          },
        },
        required: ["title", "content"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_create",
    },
    {
      name: `${PREFIX}__memory_update`,
      description: "[Remb] Update an existing memory's content, category, or tags.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Memory ID to update",
          },
          title: { type: "string" },
          content: { type: "string" },
          category: {
            type: "string",
            enum: ["preference", "pattern", "decision", "correction", "knowledge", "general"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["id"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_update",
    },
    {
      name: `${PREFIX}__memory_delete`,
      description: "[Remb] Delete a memory by ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Memory ID to delete",
          },
        },
        required: ["id"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_delete",
    },
    {
      name: `${PREFIX}__memory_promote`,
      description: "[Remb] Change a memory's tier. Promote (archive → active → core) or demote (core → active → archive). Archived memories are automatically compressed.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Memory ID",
          },
          tier: {
            type: "string",
            enum: ["core", "active", "archive"],
            description: "New tier for the memory",
          },
        },
        required: ["id", "tier"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_promote",
    },
    {
      name: `${PREFIX}__memory_stats`,
      description: "[Remb] Get memory usage statistics: total count, tokens per tier, and counts per category.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      _serverId: "__builtin__",
      _originalName: "memory_stats",
    },
    {
      name: `${PREFIX}__memory_image_upload`,
      description: "[Remb] Upload an image to a memory. Provide base64-encoded image data. OCR text will be automatically extracted and attached to the memory.",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Memory ID to attach the image to",
          },
          image_data: {
            type: "string",
            description: "Base64-encoded image data",
          },
          filename: {
            type: "string",
            description: "Original filename (e.g. screenshot.png)",
          },
          mime_type: {
            type: "string",
            enum: ["image/png", "image/jpeg", "image/webp", "image/gif"],
            description: "Image MIME type",
          },
        },
        required: ["memory_id", "image_data", "filename", "mime_type"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_image_upload",
    },
    {
      name: `${PREFIX}__memory_image_list`,
      description: "[Remb] List images attached to a memory. Returns image metadata, OCR text, and descriptions.",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: {
            type: "string",
            description: "Memory ID to list images for",
          },
        },
        required: ["memory_id"],
      },
      _serverId: "__builtin__",
      _originalName: "memory_image_list",
    },
    {
      name: `${PREFIX}__conversation_log`,
      description: "[Remb] Log what you discussed or accomplished in this session. Call this to record summaries, milestones, or key decisions so future sessions know what happened. Content is AI-summarized, embedded for semantic search, and deduplicated automatically.",
      inputSchema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "What was discussed or done — a concise summary of the conversation turn or action",
          },
          project_id: {
            type: "string",
            description: "Optional project ID to associate with",
          },
          project_slug: {
            type: "string",
            description: "Project slug (e.g. 'my-app') — used for tagging and dedup",
          },
          session_id: {
            type: "string",
            description: "Session identifier (auto-generated if omitted)",
          },
          type: {
            type: "string",
            enum: ["summary", "milestone"],
            description: "Entry type: summary (default) or milestone for major checkpoints",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization (e.g. ['auth', 'bug-fix', 'refactor'])",
          },
        },
        required: ["summary"],
      },
      _serverId: "__builtin__",
      _originalName: "conversation_log",
    },
    {
      name: `${PREFIX}__conversation_history`,
      description: "[Remb] Load recent conversation history to understand what was previously discussed and done. Call this at the start of a session to get context on past work.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Filter by project ID",
          },
          project_slug: {
            type: "string",
            description: "Filter by project slug (e.g. 'my-app')",
          },
          start_date: {
            type: "string",
            description: "Start date filter (ISO 8601, e.g. 2025-01-15)",
          },
          end_date: {
            type: "string",
            description: "End date filter (ISO 8601)",
          },
          limit: {
            type: "number",
            description: "Max entries to return (default 50, max 200)",
          },
          format: {
            type: "string",
            enum: ["markdown", "json"],
            description: "Output format: markdown (default) for readable timeline, json for structured data",
          },
        },
      },
      _serverId: "__builtin__",
      _originalName: "conversation_history",
    },
    {
      name: `${PREFIX}__conversation_search`,
      description: "[Remb] Semantically search conversation history. Find past discussions, decisions, and work related to a topic using AI-powered similarity search.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query (e.g. 'authentication bug fixes')",
          },
          project_slug: {
            type: "string",
            description: "Filter by project slug",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags",
          },
          limit: {
            type: "number",
            description: "Max results (default 10)",
          },
        },
        required: ["query"],
      },
      _serverId: "__builtin__",
      _originalName: "conversation_search",
    },
    // ─── Project & Context tools ───
    {
      name: `${PREFIX}__projects_list`,
      description: "[Remb] List all your projects with feature and entry counts.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      _serverId: "__builtin__",
      _originalName: "projects_list",
    },
    {
      name: `${PREFIX}__project_get`,
      description: "[Remb] Get a project's details including features, tech stack, and latest scan info.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug (e.g. 'my-app')",
          },
        },
        required: ["project_slug"],
      },
      _serverId: "__builtin__",
      _originalName: "project_get",
    },
    {
      name: `${PREFIX}__context_save`,
      description: "[Remb] Save a context entry for a feature. Creates the feature if it doesn't exist.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
          feature_name: {
            type: "string",
            description: "Feature name (e.g. 'auth-flow', 'payment-integration')",
          },
          content: {
            type: "string",
            description: "The context content to save — architecture notes, decisions, patterns, etc.",
          },
          entry_type: {
            type: "string",
            enum: ["architecture", "pattern", "decision", "note", "api", "schema"],
            description: "Type of context entry (default: note)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for organization",
          },
        },
        required: ["project_slug", "feature_name", "content"],
      },
      _serverId: "__builtin__",
      _originalName: "context_save",
    },
    {
      name: `${PREFIX}__context_get`,
      description: "[Remb] Retrieve context entries for a project, optionally filtered by feature.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
          feature_name: {
            type: "string",
            description: "Filter by feature name (omit to get all)",
          },
          limit: {
            type: "number",
            description: "Max entries to return (default: 20, max: 100)",
          },
        },
        required: ["project_slug"],
      },
      _serverId: "__builtin__",
      _originalName: "context_get",
    },
    {
      name: `${PREFIX}__context_bundle`,
      description: "[Remb] Load the full project context bundle — memories, features, tech stack — as a single markdown document. Ideal for getting comprehensive project understanding.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
        },
        required: ["project_slug"],
      },
      _serverId: "__builtin__",
      _originalName: "context_bundle",
    },
    {
      name: `${PREFIX}__session_start`,
      description: "[Remb] Unified session start — returns context bundle, memories, features, recent conversations, and scan status in a single call. Use this at the start of every session instead of calling context_bundle + conversation_history separately.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
        },
        required: ["project_slug"],
      },
      _serverId: "__builtin__",
      _originalName: "session_start",
    },
    {
      name: `${PREFIX}__scan_trigger`,
      description: "[Remb] Trigger a cloud scan of the project repository to extract features and context. Returns a scan ID for progress tracking.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
        },
        required: ["project_slug"],
      },
      _serverId: "__builtin__",
      _originalName: "scan_trigger",
    },
    {
      name: `${PREFIX}__scan_status`,
      description: "[Remb] Check the status of a running or completed scan. Returns progress percentage, log entries, and results.",
      inputSchema: {
        type: "object",
        properties: {
          scan_id: {
            type: "string",
            description: "Scan job ID returned by scan_trigger",
          },
        },
        required: ["scan_id"],
      },
      _serverId: "__builtin__",
      _originalName: "scan_status",
    },
    {
      name: `${PREFIX}__diff_analyze`,
      description: "[Remb] Analyze a git diff and save extracted feature-level changes as context entries. Useful for understanding what changed and why.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
          diff: {
            type: "string",
            description: "Raw git diff output to analyze",
          },
        },
        required: ["project_slug", "diff"],
      },
      _serverId: "__builtin__",
      _originalName: "diff_analyze",
    },
    {
      name: `${PREFIX}__scan_on_push`,
      description: "[Remb] Toggle auto-scan on push for a project. When enabled, pushing to the configured branch automatically triggers a scan via GitHub webhook.",
      inputSchema: {
        type: "object",
        properties: {
          project_slug: {
            type: "string",
            description: "Project slug",
          },
          enabled: {
            type: "boolean",
            description: "Whether to enable (true) or disable (false) auto-scan on push",
          },
        },
        required: ["project_slug", "enabled"],
      },
      _serverId: "__builtin__",
      _originalName: "scan_on_push",
    },
    // ─── Cross-project tools ───
    {
      name: `${PREFIX}__cross_project_search`,
      description: "[Remb] Search across ALL your projects for features, context entries, and memories. Use this when the user wants to reference how something was done in another project, find patterns across projects, or apply approaches from one project to another.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for (e.g. 'authentication flow', 'state management', 'API design')",
          },
          limit: {
            type: "number",
            description: "Max results per category (default 10)",
          },
        },
        required: ["query"],
      },
      _serverId: "__builtin__",
      _originalName: "cross_project_search",
    },
  ];
}

/* ─── tool execution ─── */

export async function callBuiltinTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const db = createAdminClient();

  switch (toolName) {
    case "memory_list": {
      let query = db
        .from("memories")
        .select("id, tier, category, title, content, compressed_content, tags, token_count, access_count, project_id, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (args.tier) query = query.eq("tier", args.tier as MemoryTier);
      if (args.category) query = query.eq("category", args.category as MemoryCategory);
      if (args.project_id) {
        query = query.or(`project_id.eq.${args.project_id},project_id.is.null`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              (data ?? []).map((m) => ({
                ...m,
                content: m.tier === "archive" && m.compressed_content ? m.compressed_content : m.content,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    case "memory_search": {
      const queryText = args.query as string;
      if (!queryText) throw new Error("query is required");

      let embedding: number[];
      try {
        embedding = await generateEmbedding(queryText);
      } catch {
        // Fallback: text search
        let query = db
          .from("memories")
          .select("id, tier, category, title, content, tags, token_count")
          .eq("user_id", userId)
          .or(`title.ilike.%${queryText}%,content.ilike.%${queryText}%`)
          .limit((args.limit as number) ?? 10);

        if (args.tier) query = query.eq("tier", args.tier as MemoryTier);
        if (args.project_id) {
          query = query.or(`project_id.eq.${args.project_id},project_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      const { data, error } = await db.rpc("search_memories", {
        p_user_id: userId,
        p_project_id: (args.project_id as string) ?? undefined,
        query_embedding: JSON.stringify(embedding),
        match_count: (args.limit as number) ?? 10,
        p_tier: (args.tier as string) ?? undefined,
      });

      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    case "memory_load_context": {
      // Use build_context_bundle() — single SQL call with priority ranking + token budget.
      // Replaces separate core + active queries + broken access tracking loop.

      // Resolve plan token budget
      const { data: userRow } = await db
        .from("users")
        .select("plan")
        .eq("id", userId)
        .single();

      const { data: planRow } = await db
        .from("plan_limits")
        .select("max_token_budget")
        .eq("plan", userRow?.plan ?? "free")
        .single();

      const tokenBudget = planRow?.max_token_budget ?? 16000;

      // Optional semantic embedding for relevance ranking
      let embedding: string | null = null;
      if (args.query) {
        try {
          const vector = await generateEmbedding(args.query as string);
          embedding = JSON.stringify(vector);
        } catch { /* fallback: priority-only ranking */ }
      }

      const { data: bundleRows, error: bundleError } = await db.rpc("build_context_bundle", {
        p_user_id: userId,
        p_project_id: (args.project_id as string) ?? null,
        query_embedding: embedding,
        token_budget: tokenBudget,
      });

      if (bundleError) throw new Error(bundleError.message);
      const rows = (bundleRows ?? []) as Array<{ id: string; tier: string; category: string; title: string; content: string; tags: string[]; token_count: number; access_count: number; similarity: number; cumulative_tokens: number }>;

      // Atomic access tracking in one shot
      const memoryIds = rows.map((r) => r.id);
      if (memoryIds.length > 0) {
        await db.rpc("touch_memories", { memory_ids: memoryIds });
      }

      const core = rows.filter((r) => r.tier === "core");
      const active = rows.filter((r) => r.tier === "active");
      const totalTokens = rows.length > 0 ? Number(rows[rows.length - 1].cumulative_tokens) : 0;

      const result = {
        core: core.map((r) => ({ id: r.id, tier: r.tier, category: r.category, title: r.title, content: r.content, tags: r.tags, token_count: r.token_count })),
        active: active.map((r) => ({ id: r.id, tier: r.tier, category: r.category, title: r.title, content: r.content, tags: r.tags, token_count: r.token_count, similarity: r.similarity })),
        total_tokens: totalTokens,
        token_budget: tokenBudget,
        memories_loaded: rows.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "memory_create": {
      const title = args.title as string;
      const content = args.content as string;
      if (!title || !content) throw new Error("title and content are required");

      const tier = (args.tier as MemoryTier) ?? "active";
      const category = (args.category as MemoryCategory) ?? "general";
      const tokenCount = Math.ceil(content.length / 4);

      // Plan-level content size + quota checks
      const { data: userRecord } = await db
        .from("users")
        .select("plan")
        .eq("id", userId)
        .single();

      const { data: limits } = await db
        .from("plan_limits")
        .select("max_memory_bytes, max_memories")
        .eq("plan", userRecord?.plan ?? "free")
        .single();

      if (limits) {
        const bytes = new TextEncoder().encode(content).length;
        if (bytes > limits.max_memory_bytes) {
          throw new Error(`Content exceeds plan limit (${limits.max_memory_bytes} bytes). Shorten the content or upgrade your plan.`);
        }
      }

      const { data: withinQuota } = await db.rpc("check_memory_quota", { p_user_id: userId });
      if (withinQuota === false) {
        throw new Error("Memory quota reached. Delete or archive existing memories, or upgrade your plan.");
      }

      // Core limit
      if (tier === "core") {
        const { count } = await db
          .from("memories")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("tier", "core");
        if ((count ?? 0) >= 20) {
          throw new Error("Core memory limit reached (max 20). Demote existing core memories first.");
        }
      }

      let embedding: string | null = null;
      try {
        const vector = await generateEmbedding(`${title}\n${content}`);
        embedding = JSON.stringify(vector);
      } catch { /* non-blocking */ }

      const { data, error } = await db
        .from("memories")
        .insert({
          user_id: userId,
          project_id: (args.project_id as string) ?? null,
          tier,
          category,
          title,
          content,
          tags: (args.tags as string[]) ?? [],
          token_count: tokenCount,
          embedding,
        })
        .select("id, tier, category, title, token_count")
        .single();

      if (error) throw new Error(error.message);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ created: data }, null, 2),
          },
        ],
      };
    }

    case "memory_update": {
      const id = args.id as string;
      if (!id) throw new Error("id is required");

      const updates: Record<string, unknown> = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.content !== undefined) {
        updates.content = args.content;
        updates.token_count = Math.ceil((args.content as string).length / 4);
      }
      if (args.category !== undefined) updates.category = args.category;
      if (args.tags !== undefined) updates.tags = args.tags;

      if (args.content !== undefined || args.title !== undefined) {
        try {
          const text = `${(args.title as string) ?? ""}\n${(args.content as string) ?? ""}`;
          const vector = await generateEmbedding(text);
          updates.embedding = JSON.stringify(vector);
        } catch { /* non-blocking */ }
      }

      const { data, error } = await db
        .from("memories")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, tier, category, title, token_count")
        .single();

      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify({ updated: data }, null, 2) }] };
    }

    case "memory_delete": {
      const id = args.id as string;
      if (!id) throw new Error("id is required");

      const { error } = await db
        .from("memories")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: id }) }] };
    }

    case "memory_promote": {
      const id = args.id as string;
      const newTier = args.tier as MemoryTier;
      if (!id || !newTier) throw new Error("id and tier are required");

      if (newTier === "core") {
        const { count } = await db
          .from("memories")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("tier", "core");
        if ((count ?? 0) >= 20) {
          throw new Error("Core memory limit reached (max 20).");
        }
      }

      const updates: Record<string, unknown> = { tier: newTier };

      if (newTier === "archive") {
        const { data: memory } = await db
          .from("memories")
          .select("content, title")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (memory) {
          const sentences = memory.content.split(/[.!?\n]+/).filter((s: string) => s.trim().length > 10);
          if (sentences.length > 3) {
            const summary = [
              sentences[0],
              sentences[Math.floor(sentences.length / 2)],
              sentences[sentences.length - 1],
            ].map((s: string) => s.trim()).join(". ");
            updates.compressed_content = `${memory.title}: ${summary}.`;
          } else {
            updates.compressed_content = memory.content;
          }
        }
      } else {
        updates.compressed_content = null;
      }

      const { data, error } = await db
        .from("memories")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, tier, title, token_count")
        .single();

      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify({ promoted: data }, null, 2) }] };
    }

    case "memory_stats": {
      const { data: memories, error } = await db
        .from("memories")
        .select("tier, category, token_count")
        .eq("user_id", userId);

      if (error) throw new Error(error.message);

      const stats: Record<string, unknown> = {
        total: memories?.length ?? 0,
        byTier: { core: { count: 0, tokens: 0 }, active: { count: 0, tokens: 0 }, archive: { count: 0, tokens: 0 } },
        byCategory: { preference: 0, pattern: 0, decision: 0, correction: 0, knowledge: 0, general: 0 },
      };

      const byTier = stats.byTier as Record<string, { count: number; tokens: number }>;
      const byCategory = stats.byCategory as Record<string, number>;
      for (const m of memories ?? []) {
        byTier[m.tier as string].count++;
        byTier[m.tier as string].tokens += m.token_count;
        byCategory[m.category as string]++;
      }

      // Include quota from user_storage_stats view
      const { data: storageRow } = await db
        .from("user_storage_stats")
        .select("memory_count, max_memories, total_memory_tokens, max_token_budget, memory_bytes, max_memory_bytes, plan, context_entry_count, context_bytes, conversation_entry_count, project_count, max_projects")
        .eq("user_id", userId)
        .single();

      if (storageRow) {
        stats.quota = {
          plan: storageRow.plan,
          memories: { used: storageRow.memory_count, limit: storageRow.max_memories },
          tokens: { used: storageRow.total_memory_tokens, budget: storageRow.max_token_budget },
          storage_bytes: { memories: Number(storageRow.memory_bytes), context: Number(storageRow.context_bytes) },
          projects: { used: storageRow.project_count, limit: storageRow.max_projects },
          conversations: storageRow.conversation_entry_count,
          context_entries: storageRow.context_entry_count,
        };
      }

      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    }

    case "memory_image_upload": {
      const memoryId = args.memory_id as string;
      const imageData = args.image_data as string;
      const filename = args.filename as string;
      const mimeType = args.mime_type as string;

      if (!memoryId || !imageData || !filename || !mimeType) {
        throw new Error("memory_id, image_data, filename, and mime_type are required");
      }

      const { uploadMemoryImageFromBuffer } = await import("@/lib/image-actions");
      const buffer = Buffer.from(imageData, "base64");
      const result = await uploadMemoryImageFromBuffer(userId, memoryId, buffer, filename, mimeType);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              uploaded: {
                id: result.image.id,
                filename: result.image.filename,
                size_bytes: result.image.size_bytes,
                ocr_text: result.ocrText,
                description: result.description,
              },
            }, null, 2),
          },
        ],
      };
    }

    case "memory_image_list": {
      const memoryId = args.memory_id as string;
      if (!memoryId) throw new Error("memory_id is required");

      const { getMemoryImagesForUser } = await import("@/lib/image-actions");
      const images = await getMemoryImagesForUser(userId, memoryId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(images, null, 2),
          },
        ],
      };
    }

    case "conversation_log": {
      const summary = args.summary as string;
      if (!summary) throw new Error("summary is required");

      const { logConversation } = await import("@/lib/conversation-actions");
      const entry = await logConversation({
        userId,
        projectId: (args.project_id as string) ?? null,
        projectSlug: (args.project_slug as string) ?? null,
        sessionId: (args.session_id as string) ?? `mcp-${Date.now()}`,
        type: (args.type as "summary" | "milestone") ?? "summary",
        content: summary,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
        source: "mcp",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              logged: true,
              id: entry.id,
              created_at: entry.created_at,
              deduplicated: (entry as Record<string, unknown>).deduplicated ?? false,
            }),
          },
        ],
      };
    }

    case "conversation_history": {
      const { getConversationHistory, generateConversationMarkdown } = await import("@/lib/conversation-actions");
      const format = (args.format as string) ?? "markdown";

      const input = {
        userId,
        projectId: (args.project_id as string) ?? undefined,
        projectSlug: (args.project_slug as string) ?? undefined,
        startDate: (args.start_date as string) ?? undefined,
        endDate: (args.end_date as string) ?? undefined,
        limit: (args.limit as number) ?? 50,
      };

      if (format === "json") {
        const entries = await getConversationHistory(input);
        return {
          content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
        };
      }

      const markdown = await generateConversationMarkdown(input);
      return {
        content: [{ type: "text", text: markdown }],
      };
    }

    case "conversation_search": {
      const query = args.query as string;
      if (!query) throw new Error("query is required");

      const { searchConversationHistory } = await import("@/lib/conversation-actions");
      const results = await searchConversationHistory({
        userId,
        query,
        projectSlug: (args.project_slug as string) ?? undefined,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
        limit: (args.limit as number) ?? 10,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    // ─── Project & Context tool implementations ───

    case "projects_list": {
      const { data: projects, error } = await db
        .from("projects")
        .select("id, name, slug, description, status, repo_name, branch, language, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw new Error(error.message);

      const projectIds = (projects ?? []).map((p) => p.id);
      const { data: features } = projectIds.length > 0
        ? await db.from("features").select("id, project_id").in("project_id", projectIds)
        : { data: [] as { id: string; project_id: string }[] };

      const featuresByProject = new Map<string, number>();
      for (const f of features ?? []) {
        featuresByProject.set(f.project_id, (featuresByProject.get(f.project_id) ?? 0) + 1);
      }

      const result = (projects ?? []).map((p) => ({
        ...p,
        feature_count: featuresByProject.get(p.id) ?? 0,
      }));

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "project_get": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");

      const { data: project, error } = await db
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (error || !project) throw new Error(`Project "${slug}" not found`);

      // Features
      const { data: features } = await db
        .from("features")
        .select("id, name, description, status, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });

      // Latest scan
      const { data: latestScan } = await db
        .from("scan_jobs")
        .select("id, status, result, started_at, finished_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const scanResult = latestScan?.result as Record<string, unknown> | null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...project,
            features: features ?? [],
            latest_scan: latestScan ? {
              id: latestScan.id,
              status: latestScan.status,
              features_created: scanResult?.features_created ?? 0,
              tech_stack: scanResult?.tech_stack ?? [],
              languages: scanResult?.languages ?? {},
              started_at: latestScan.started_at,
              finished_at: latestScan.finished_at,
            } : null,
          }, null, 2),
        }],
      };
    }

    case "context_save": {
      const slug = args.project_slug as string;
      const featureName = args.feature_name as string;
      const content = args.content as string;
      if (!slug || !featureName || !content) throw new Error("project_slug, feature_name, and content are required");

      // Content size guard (128 KB hard cap matches DB constraint)
      const contentBytes = new TextEncoder().encode(content).length;
      if (contentBytes > 131_072) {
        throw new Error("Context content exceeds 128 KB limit. Shorten the content.");
      }

      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);

      // Find or create feature
      let featureId: string;
      const { data: existing } = await db
        .from("features")
        .select("id")
        .eq("project_id", project.id)
        .eq("name", featureName)
        .single();

      if (existing) {
        featureId = existing.id;
      } else {
        const { data: created, error: createErr } = await db
          .from("features")
          .insert({ project_id: project.id, name: featureName })
          .select("id")
          .single();
        if (createErr || !created) throw new Error("Failed to create feature");
        featureId = created.id;
      }

      const { data: entry, error: entryErr } = await db
        .from("context_entries")
        .insert({
          feature_id: featureId,
          content,
          entry_type: (args.entry_type as string) ?? "note",
          source: "mcp",
          metadata: { tags: (args.tags as string[]) ?? [] } as unknown as import("@/lib/supabase/types").Json,
        })
        .select("id, created_at")
        .single();

      if (entryErr) throw new Error(entryErr.message);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ saved: true, feature: featureName, entry_id: entry.id }),
        }],
      };
    }

    case "context_get": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");

      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);

      const featureName = args.feature_name as string | undefined;
      let featureIds: string[] = [];

      if (featureName) {
        const { data: feature } = await db
          .from("features")
          .select("id")
          .eq("project_id", project.id)
          .eq("name", featureName)
          .single();
        if (!feature) throw new Error(`Feature "${featureName}" not found`);
        featureIds = [feature.id];
      } else {
        const { data: features } = await db
          .from("features")
          .select("id")
          .eq("project_id", project.id);
        featureIds = (features ?? []).map((f) => f.id);
      }

      if (featureIds.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ entries: [], total: 0 }) }] };
      }

      const limit = Math.min(Math.max((args.limit as number) ?? 20, 1), 100);
      const { data: entries, error } = await db
        .from("context_entries")
        .select("id, feature_id, content, entry_type, source, metadata, created_at")
        .in("feature_id", featureIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      // Attach feature names
      const { data: featureRows } = await db
        .from("features")
        .select("id, name")
        .in("id", featureIds);
      const featureMap = new Map((featureRows ?? []).map((f) => [f.id, f.name]));

      const enriched = (entries ?? []).map((e) => ({
        ...e,
        feature_name: featureMap.get(e.feature_id) ?? "unknown",
      }));

      return { content: [{ type: "text", text: JSON.stringify({ entries: enriched, total: enriched.length }, null, 2) }] };
    }

    case "context_bundle": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");

      const { data: project } = await db
        .from("projects")
        .select("id, name, description")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);

      // Latest scan for tech stack
      const { data: latestScan } = await db
        .from("scan_jobs")
        .select("result")
        .eq("project_id", project.id)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const scanResult = latestScan?.result as Record<string, unknown> | null;
      const techStack = Array.isArray(scanResult?.tech_stack) ? scanResult.tech_stack as string[] : [];
      const languages = (scanResult?.languages ?? {}) as Record<string, number>;

      // Budget-aware memories via build_context_bundle (single SQL call)
      const { data: planRow } = await db
        .from("plan_limits")
        .select("max_token_budget")
        .eq("plan", "free")
        .single();

      const { data: bundleRows } = await db.rpc("build_context_bundle", {
        p_user_id: userId,
        p_project_id: project.id,
        token_budget: planRow?.max_token_budget ?? 16000,
      });

      const memories = (bundleRows ?? []) as Array<{ id: string; tier: string; category: string; title: string; content: string; tags: string[] }>;

      // Touch memories for access tracking
      const memIds = memories.map((m) => m.id);
      if (memIds.length > 0) {
        await db.rpc("touch_memories", { memory_ids: memIds });
      }

      // Features
      const { data: features } = await db
        .from("features")
        .select("id, name, description, status")
        .eq("project_id", project.id)
        .eq("status", "active");

      const featureIds = (features ?? []).map((f) => f.id);
      const { data: entries } = featureIds.length > 0
        ? await db.from("context_entries").select("feature_id, content, entry_type, metadata").in("feature_id", featureIds)
        : { data: [] as { feature_id: string; content: string; entry_type: string; metadata: unknown }[] };

      // Build markdown
      const lines: string[] = [];
      lines.push(`# ${project.name} — Project Context`);
      lines.push("");
      if (project.description) { lines.push(project.description); lines.push(""); }
      if (techStack.length > 0) { lines.push(`**Tech Stack:** ${techStack.join(", ")}`); lines.push(""); }
      const langEntries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
      if (langEntries.length > 0) { lines.push(`**Languages:** ${langEntries.map(([l, c]) => `${l} (${c})`).join(", ")}`); lines.push(""); }

      const coreMemories = memories.filter((m) => m.tier === "core");
      if (coreMemories.length > 0) {
        lines.push("## Core Knowledge");
        lines.push("");
        for (const m of coreMemories) {
          lines.push(`### ${m.title}`);
          lines.push(m.content);
          lines.push("");
        }
      }

      const activeMemories = memories.filter((m) => m.tier === "active");
      if (activeMemories.length > 0) {
        lines.push("## Active Memories");
        lines.push("");
        for (const m of activeMemories) {
          lines.push(`- **${m.title}** _(${m.category})_: ${m.content}`);
        }
        lines.push("");
      }

      if ((features ?? []).length > 0) {
        lines.push("## Features");
        lines.push("");
        for (const f of features ?? []) {
          lines.push(`### ${f.name}`);
          if (f.description) lines.push(f.description);
          const fEntries = (entries ?? []).filter((e) => e.feature_id === f.id);
          for (const e of fEntries) {
            lines.push(`- [${e.entry_type}] ${e.content.slice(0, 200)}`);
          }
          lines.push("");
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    case "session_start": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");

      // Single unified call to session/start API
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const secret = process.env.SCAN_WORKER_SECRET?.trim();
      if (!secret) throw new Error("Internal configuration error");

      // Fetch from our own session-start endpoint using internal auth
      const { data: project } = await db
        .from("projects")
        .select("id, name, description, repo_name, branch")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);

      // Run all queries in parallel
      const [scanRes, memRes, featRes, convRes] = await Promise.all([
        db.from("scan_jobs")
          .select("result, created_at, finished_at")
          .eq("project_id", project.id)
          .eq("status", "done")
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        db.from("memories")
          .select("id, tier, category, title, content")
          .eq("user_id", userId)
          .or(`project_id.eq.${project.id},project_id.is.null`)
          .in("tier", ["core", "active"])
          .order("tier")
          .order("access_count", { ascending: false })
          .limit(50),
        db.from("features")
          .select("id, name, description")
          .eq("project_id", project.id)
          .eq("status", "active"),
        db.from("conversation_entries")
          .select("content, type, tags, created_at")
          .eq("user_id", userId)
          .or(`project_slug.eq.${slug},project_slug.is.null`)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const scanMeta = scanRes.data?.result as Record<string, unknown> | null;
      const lastScanAt = scanRes.data?.finished_at ?? scanRes.data?.created_at ?? null;
      const techStack = Array.isArray(scanMeta?.tech_stack) ? scanMeta.tech_stack as string[] : [];

      const memories = memRes.data ?? [];
      const coreMemories = memories.filter((m) => m.tier === "core");
      const activeMemories = memories.filter((m) => m.tier === "active");

      // Touch memories
      const memIds = memories.map((m) => m.id);
      if (memIds.length > 0) {
        try { await db.rpc("touch_memories", { memory_ids: memIds }); } catch { /* non-fatal */ }
      }

      const features = featRes.data ?? [];
      const conversations = convRes.data ?? [];

      // Build a concise session-start markdown
      const lines: string[] = [];
      lines.push(`# ${project.name} — Session Context`);
      lines.push("");
      if (techStack.length > 0) lines.push(`**Tech Stack:** ${techStack.join(", ")}`);
      if (lastScanAt) lines.push(`**Last Scan:** ${lastScanAt}`);
      lines.push("");

      if (coreMemories.length > 0) {
        lines.push("## Core Knowledge");
        lines.push("");
        for (const m of coreMemories) {
          lines.push(`### ${m.title}`);
          lines.push(m.content);
          lines.push("");
        }
      }

      if (activeMemories.length > 0) {
        lines.push("## Active Memories");
        lines.push("");
        for (const m of activeMemories) {
          lines.push(`- **${m.title}** _(${m.category})_: ${m.content}`);
        }
        lines.push("");
      }

      if (features.length > 0) {
        lines.push(`## Features (${features.length})`);
        lines.push("");
        for (const f of features) {
          lines.push(`- **${f.name}**: ${f.description ?? "No description"}`);
        }
        lines.push("");
      }

      if (conversations.length > 0) {
        lines.push("## Recent Activity");
        lines.push("");
        for (const c of conversations) {
          const date = c.created_at.slice(0, 16).replace("T", " ");
          const tagStr = c.tags?.length > 0 ? ` [${c.tags.join(", ")}]` : "";
          const truncated = c.content.length > 300 ? c.content.slice(0, 300) + "..." : c.content;
          lines.push(`- **${date}**${tagStr}: ${truncated}`);
        }
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    case "scan_trigger": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");

      const { data: project } = await db
        .from("projects")
        .select("id, repo_name, branch, name")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);
      if (!project.repo_name) throw new Error("Project has no connected repository");

      // Check for running scans
      const { data: running } = await db
        .from("scan_jobs")
        .select("id")
        .eq("project_id", project.id)
        .in("status", ["queued", "running"])
        .limit(1);

      if (running && running.length > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "A scan is already running", scan_id: running[0].id }) }],
        };
      }

      // Get GitHub token
      const { data: userRow } = await db
        .from("users")
        .select("github_token")
        .eq("id", userId)
        .single();

      if (!userRow?.github_token) throw new Error("GitHub token not found. Reconnect GitHub from settings.");

      // Create scan job
      await db.from("projects").update({ status: "scanning" }).eq("id", project.id);

      const { data: scanJob, error: scanErr } = await db
        .from("scan_jobs")
        .insert({
          project_id: project.id,
          status: "running",
          triggered_by: "mcp",
          started_at: new Date().toISOString(),
        })
        .select("id, status")
        .single();

      if (scanErr) throw new Error(scanErr.message);

      // Fire-and-forget to scan worker
      const { getInternalApiUrl, getInternalFetchHeaders } = await import("@/lib/utils");
      const appUrl = getInternalApiUrl();

      fetch(`${appUrl}/api/scan/run`, {
        method: "POST",
        headers: getInternalFetchHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SCAN_WORKER_SECRET?.trim()}`,
        }),
        body: JSON.stringify({
          scanJobId: scanJob.id,
          projectId: project.id,
          repoName: project.repo_name,
          branch: project.branch ?? "main",
          githubToken: userRow.github_token,
        }),
      }).catch(() => {});

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ triggered: true, scan_id: scanJob.id, project: project.name }),
        }],
      };
    }

    case "scan_status": {
      const scanId = args.scan_id as string;
      if (!scanId) throw new Error("scan_id is required");

      const { data: job } = await db
        .from("scan_jobs")
        .select("id, status, result, started_at, finished_at, project_id")
        .eq("id", scanId)
        .single();

      if (!job) throw new Error("Scan job not found");

      // Verify ownership
      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("id", job.project_id)
        .eq("user_id", userId)
        .single();

      if (!project) throw new Error("Scan job not found");

      const result = (job.result ?? {}) as Record<string, unknown>;
      const filesTotal = (result.files_total as number) ?? 0;
      const filesScanned = (result.files_scanned as number) ?? 0;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            scan_id: job.id,
            status: job.status,
            percentage: filesTotal > 0 ? Math.round((filesScanned / filesTotal) * 100) : 0,
            files_total: filesTotal,
            files_scanned: filesScanned,
            features_created: (result.features_created as number) ?? 0,
            errors: (result.errors as number) ?? 0,
            duration_ms: (result.duration_ms as number) ?? 0,
            started_at: job.started_at,
            finished_at: job.finished_at,
          }, null, 2),
        }],
      };
    }

    case "diff_analyze": {
      const slug = args.project_slug as string;
      const diff = args.diff as string;
      if (!slug || !diff) throw new Error("project_slug and diff are required");
      if (diff.length > 200_000) throw new Error("diff must be under 200,000 characters");

      const { data: project } = await db
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);

      const { analyzeDiff } = await import("@/lib/openai");
      const changes = await analyzeDiff(diff);

      if (changes.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ analyzed: 0, changes: [] }) }] };
      }

      // Save each change as a context entry
      for (const change of changes) {
        let featureId: string;
        const { data: existingFeature } = await db
          .from("features")
          .select("id")
          .eq("project_id", project.id)
          .eq("name", change.feature_name)
          .single();

        if (existingFeature) {
          featureId = existingFeature.id;
        } else {
          const { data: created } = await db
            .from("features")
            .insert({ project_id: project.id, name: change.feature_name })
            .select("id")
            .single();
          if (!created) continue;
          featureId = created.id;
        }

        await db.from("context_entries").insert({
          feature_id: featureId,
          content: change.summary,
          entry_type: "diff",
          source: "mcp",
          metadata: {
            files_changed: change.files_changed,
            category: change.category,
            importance: change.importance,
          } as unknown as import("@/lib/supabase/types").Json,
        });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            analyzed: changes.length,
            changes: changes.map((c) => ({ feature: c.feature_name, category: c.category, files: c.files_changed })),
          }, null, 2),
        }],
      };
    }

    case "scan_on_push": {
      const slug = args.project_slug as string;
      if (!slug) throw new Error("project_slug is required");
      const enabled = args.enabled as boolean;
      if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");

      const { data: project } = await db
        .from("projects")
        .select("id, repo_name, branch, scan_on_push, webhook_secret, github_webhook_id")
        .eq("user_id", userId)
        .eq("slug", slug)
        .single();

      if (!project) throw new Error(`Project "${slug}" not found`);
      if (!project.repo_name) throw new Error("Project has no connected repository");

      const { data: userRow } = await db
        .from("users")
        .select("github_token")
        .eq("id", userId)
        .single();

      const githubToken = userRow?.github_token;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

      const updates: Record<string, unknown> = { scan_on_push: enabled };

      if (enabled) {
        let secret = project.webhook_secret;
        if (!secret) {
          const { randomBytes } = await import("node:crypto");
          secret = randomBytes(32).toString("hex");
          updates.webhook_secret = secret;
        }
        if (githubToken && !project.github_webhook_id) {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${project.repo_name}/hooks`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github+json",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: "web",
                  active: true,
                  events: ["push"],
                  config: {
                    url: `${appUrl}/api/scan/webhook`,
                    content_type: "json",
                    secret,
                    insecure_ssl: "0",
                  },
                }),
              },
            );
            if (res.ok) {
              const hook = await res.json() as { id: number };
              updates.github_webhook_id = hook.id;
            }
          } catch { /* non-fatal */ }
        }
      } else {
        if (githubToken && project.github_webhook_id) {
          try {
            await fetch(
              `https://api.github.com/repos/${project.repo_name}/hooks/${project.github_webhook_id}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: "application/vnd.github+json",
                },
              },
            );
          } catch { /* non-fatal */ }
        }
        updates.github_webhook_id = null;
      }

      await db.from("projects").update(updates).eq("id", project.id);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            scan_on_push: enabled,
            webhook_registered: enabled ? !!updates.github_webhook_id || !!project.github_webhook_id : false,
            project: slug,
          }),
        }],
      };
    }

    case "cross_project_search": {
      const queryText = args.query as string;
      if (!queryText) throw new Error("query is required");
      const limit = Math.min((args.limit as number) ?? 10, 25);

      // 1. Search memories across ALL projects (no project_id filter)
      let memories: unknown[] = [];
      try {
        const embedding = await generateEmbedding(queryText);
        const { data } = await db.rpc("search_memories", {
          p_user_id: userId,
          // p_project_id omitted → searches all projects + globals
          query_embedding: JSON.stringify(embedding),
          match_count: limit,
        });
        memories = data ?? [];
      } catch {
        // Fallback: text search
        const { data } = await db
          .from("memories")
          .select("id, tier, category, title, content, tags, project_id")
          .eq("user_id", userId)
          .or(`title.ilike.%${queryText}%,content.ilike.%${queryText}%`)
          .limit(limit);
        memories = data ?? [];
      }

      // Resolve project names for memories
      const memProjectIds = [...new Set((memories as { project_id?: string }[]).map((m) => m.project_id).filter(Boolean))] as string[];
      let projectNameMap: Record<string, string> = {};
      if (memProjectIds.length > 0) {
        const { data: projects } = await db
          .from("projects")
          .select("id, name, slug")
          .in("id", memProjectIds);
        for (const p of projects ?? []) {
          projectNameMap[p.id] = p.slug;
        }
      }

      // 2. Search context entries across ALL projects
      const { data: allProjects } = await db
        .from("projects")
        .select("id, name, slug")
        .eq("user_id", userId);

      const allProjectIds = (allProjects ?? []).map((p) => p.id);
      for (const p of allProjects ?? []) {
        projectNameMap[p.id] = p.slug;
      }

      let contextEntries: unknown[] = [];
      if (allProjectIds.length > 0) {
        const { data } = await db
          .from("context_entries")
          .select("id, content, entry_type, source, metadata, feature_id, features!inner(id, name, project_id)")
          .in("features.project_id", allProjectIds)
          .or(`content.ilike.%${queryText}%`)
          .order("created_at", { ascending: false })
          .limit(limit);
        contextEntries = data ?? [];
      }

      // 3. Search features across all projects
      let features: unknown[] = [];
      if (allProjectIds.length > 0) {
        const { data } = await db
          .from("features")
          .select("id, name, description, status, project_id")
          .in("project_id", allProjectIds)
          .or(`name.ilike.%${queryText}%,description.ilike.%${queryText}%`)
          .limit(limit);
        features = data ?? [];
      }

      // Format results with project labels
      const result = {
        query: queryText,
        memories: (memories as { id: string; tier: string; category: string; title: string; content: string; project_id?: string }[]).map((m) => ({
          ...m,
          project: m.project_id ? projectNameMap[m.project_id] ?? "unknown" : "global",
        })),
        features: (features as { id: string; name: string; description: string; project_id: string }[]).map((f) => ({
          ...f,
          project: projectNameMap[f.project_id] ?? "unknown",
        })),
        context_entries: (contextEntries as { id: string; content: string; entry_type: string; features: { name: string; project_id: string } }[]).map((e) => ({
          id: e.id,
          content: e.content.slice(0, 500),
          entry_type: e.entry_type,
          feature: e.features?.name,
          project: e.features?.project_id ? projectNameMap[e.features.project_id] ?? "unknown" : "unknown",
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown builtin tool: ${toolName}`);
  }
}
