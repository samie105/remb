import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logSmartConversation } from "@/lib/conversation-actions";
import type { RawConversationEvent, IDESource } from "@/lib/conversation-summarizer";

/**
 * POST /api/cli/conversations/smart
 *
 * Smart conversation logging: accepts raw IDE events, AI-summarizes them,
 * generates embeddings, checks for duplicates, then stores the result.
 *
 * Body: { events: RawConversationEvent[], projectSlug?, metadata? }
 */
export async function POST(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const body = await request.json();

  const { events, projectSlug, metadata, ideSource } = body as {
    events?: RawConversationEvent[];
    projectSlug?: string;
    metadata?: Record<string, unknown>;
    ideSource?: IDESource;
  };

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events array is required" }, { status: 400 });
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

    if (project) projectId = project.id;
  }

  const entry = await logSmartConversation({
    userId: user.id,
    projectId,
    projectSlug: projectSlug ?? null,
    sessionId: `smart-${Date.now()}`,
    events: events.slice(0, 100), // Cap at 100 events per request
    metadata: metadata ?? {},
    source: ideSource ? "import" : "cli",
    ideSource,
  });

  return NextResponse.json({
    logged: true,
    id: entry.id,
    created_at: entry.created_at,
    deduplicated: (entry as Record<string, unknown>).deduplicated ?? false,
    summary: (entry as Record<string, unknown>).summary ?? null,
  });
}
