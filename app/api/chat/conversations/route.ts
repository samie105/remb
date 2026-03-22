import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversationSessions, getConversationHistory } from "@/lib/conversation-actions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await getConversationSessions(session.dbUser.id, undefined, 20, "web");

  // For each session, get the first entry to use as title/preview
  const conversations = await Promise.all(
    sessions.map(async (s) => {
      const entries = await getConversationHistory({
        userId: session.dbUser.id,
        sessionId: s.sessionId,
        limit: 2,
        source: "web",
      });

      const firstEntry = entries[entries.length - 1];
      const content = firstEntry?.content ?? "";
      const title =
        (firstEntry?.metadata as Record<string, string> | null)?.title ??
        content.slice(0, 60) + (content.length > 60 ? "…" : "");
      const preview = content.slice(0, 100);

      return {
        id: s.sessionId,
        title,
        preview,
        createdAt: s.first,
        source: (firstEntry?.source as string) ?? "web",
        messageCount: s.count,
      };
    }),
  );

  return NextResponse.json({ conversations });
}
