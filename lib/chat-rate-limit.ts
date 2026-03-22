"use server";

import { createAdminClient } from "@/lib/supabase/server";

export type ChatModel = "o4-mini" | "gpt-4.1";

const MODEL_LIMITS: Record<ChatModel, number> = {
  "o4-mini": 4,
  "gpt-4.1": 4,
};

export interface ChatUsage {
  model: ChatModel;
  used: number;
  limit: number;
  remaining: number;
}

/** Get today's usage for all models */
export async function getChatUsage(userId: string): Promise<ChatUsage[]> {
  const db = createAdminClient();
  const { data } = await db.rpc("get_all_chat_usage_today", { p_user_id: userId });
  const usageMap = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ model: string; count: number }>) {
    usageMap.set(row.model, Number(row.count));
  }

  return (Object.entries(MODEL_LIMITS) as [ChatModel, number][]).map(([model, limit]) => {
    const used = usageMap.get(model) ?? 0;
    return { model, used, limit, remaining: Math.max(0, limit - used) };
  });
}

/** Check if user can use a specific model — returns remaining count or 0 */
export async function checkChatLimit(userId: string, model: ChatModel): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.rpc("get_chat_usage_today", {
    p_user_id: userId,
    p_model: model,
  });
  const used = (data as number) ?? 0;
  const limit = MODEL_LIMITS[model] ?? 4;
  return Math.max(0, limit - used);
}

/** Record one prompt usage */
export async function recordChatUsage(userId: string, model: ChatModel): Promise<void> {
  const db = createAdminClient();
  await db.from("chat_usage").insert({ user_id: userId, model });
}
