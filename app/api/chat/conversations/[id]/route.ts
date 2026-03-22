import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversationHistory } from "@/lib/conversation-actions";
import { createAdminClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/chat-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  const entries = await getConversationHistory({
    userId: session.dbUser.id,
    sessionId,
    limit: 100,
    source: "web",
  });

  // Convert conversation entries to ChatMessage format
  const messages: ChatMessage[] = entries
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((entry) => {
      const meta = entry.metadata as Record<string, string> | null;
      const role = meta?.role === "user" ? "user" : "assistant";
      return {
        id: entry.id,
        role,
        content: entry.content,
        createdAt: entry.created_at,
      };
    });

  return NextResponse.json({ messages });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = createAdminClient();

  // Delete all conversation entries for this session belonging to the user
  const { error } = await db
    .from("conversation_entries")
    .delete()
    .eq("user_id", session.dbUser.id)
    .eq("session_id", sessionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
