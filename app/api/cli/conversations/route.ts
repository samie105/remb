import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getConversationHistory,
  generateConversationMarkdown,
  logConversation,
} from "@/lib/conversation-actions";

/**
 * GET /api/cli/conversations
 *
 * Retrieve conversation history with optional filters.
 * Query params: projectSlug, startDate, endDate, limit, format (json|markdown)
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const { searchParams } = new URL(request.url);

  const projectSlug = searchParams.get("projectSlug");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const format = searchParams.get("format") ?? "json";

  // Resolve project slug → id
  let projectId: string | null = null;
  if (projectSlug) {
    const db = createAdminClient();
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("slug", projectSlug)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = project.id;
  }

  const input = {
    userId: user.id,
    projectId,
    projectSlug: projectSlug ?? undefined,
    startDate: startDate ?? undefined,
    endDate: endDate ?? undefined,
    limit,
  };

  if (format === "markdown") {
    const markdown = await generateConversationMarkdown(input);
    return new Response(markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const entries = await getConversationHistory(input);
  return NextResponse.json({ entries, total: entries.length });
}

/**
 * POST /api/cli/conversations
 *
 * Log a conversation entry from CLI.
 * Body: { content, projectSlug?, type?, metadata?, sessionId? }
 */
export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const body = await request.json();

  const { content, projectSlug, type, metadata, sessionId, tags } = body as {
    content?: string;
    projectSlug?: string;
    type?: string;
    metadata?: Record<string, unknown>;
    sessionId?: string;
    tags?: string[];
  };

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Resolve project slug → id
  let projectId: string | null = null;
  if (projectSlug) {
    const db = createAdminClient();
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("slug", projectSlug)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = project.id;
  }

  const validTypes = ["summary", "tool_call", "milestone", "conversation"];
  const entryType = validTypes.includes(type ?? "") ? (type as "summary" | "tool_call" | "milestone" | "conversation") : "summary";

  const entry = await logConversation({
    userId: user.id,
    projectId,
    projectSlug: projectSlug ?? null,
    sessionId: sessionId ?? `cli-${Date.now()}`,
    type: entryType,
    content,
    tags: Array.isArray(tags) ? tags : [],
    metadata: metadata ?? {},
    source: "cli",
  });

  return NextResponse.json({
    logged: true,
    id: entry.id,
    created_at: entry.created_at,
    deduplicated: (entry as Record<string, unknown>).deduplicated ?? false,
  });
}
