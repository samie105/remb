import { NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { searchConversationHistory } from "@/lib/conversation-actions";

/**
 * GET /api/cli/conversations/search
 *
 * Semantic search across conversation history.
 * Query params: q (required), projectSlug?, tags? (comma-separated), limit?
 */
export async function GET(request: Request) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { user } = auth;
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("q");
  if (!query) {
    return NextResponse.json({ error: "q (search query) is required" }, { status: 400 });
  }

  const projectSlug = searchParams.get("projectSlug");
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 50);

  const results = await searchConversationHistory({
    userId: user.id,
    query,
    projectSlug: projectSlug ?? undefined,
    tags,
    limit,
  });

  return NextResponse.json({ results, total: results.length });
}
