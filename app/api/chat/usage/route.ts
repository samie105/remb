import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getChatUsage } from "@/lib/chat-rate-limit";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const usage = await getChatUsage(session.dbUser.id);
  return NextResponse.json({ usage });
}
