import { task, logger } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/openai";

export interface ReembedBatchPayload {
  /** Which table to process: memories | context_entries | conversation_entries */
  table: "memories" | "context_entries" | "conversation_entries";
  /** Only re-embed rows with this old model (default: rows where embedding_model != target) */
  sourceModel?: string;
  /** Target model for new embeddings */
  targetModel?: string;
  /** Batch size per DB fetch */
  batchSize?: number;
  /** Artificial delay (ms) between batches to avoid rate limits */
  delayMs?: number;
}

const EMBEDDING_TEXT_COLUMNS: Record<string, (row: Record<string, unknown>) => string> = {
  memories: (r) => `${r.title ?? ""}\n${r.content ?? ""}`,
  context_entries: (r) => String(r.content ?? ""),
  conversation_entries: (r) => String(r.content ?? ""),
};

/**
 * Trigger.dev task: batch re-embed existing rows with the current embedding model.
 *
 * Designed to run after switching models (e.g. ada-002 → text-embedding-3-small).
 * Processes rows in batches to stay within API rate limits.
 */
export const reembedBatchTask = task({
  id: "reembed-batch",
  maxDuration: 1800, // 30 minutes — large tables may take a while
  machine: "medium-1x",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: ReembedBatchPayload) => {
    const db = createAdminClient();
    const {
      table,
      sourceModel,
      targetModel = "text-embedding-3-small",
      batchSize = 50,
      delayMs = 200,
    } = payload;

    const textFn = EMBEDDING_TEXT_COLUMNS[table];
    if (!textFn) throw new Error(`Unsupported table: ${table}`);

    let processed = 0;
    let errors = 0;
    let cursor: string | null = null;

    logger.info(`Starting re-embed for ${table}`, { sourceModel, targetModel, batchSize });

    while (true) {
      // Fetch a batch of rows that need re-embedding
      let query = db
        .from(table)
        .select("id, title, content" as "*")
        .not("embedding", "is", null)
        .neq("embedding_model", targetModel)
        .order("id")
        .limit(batchSize);

      if (sourceModel) {
        query = query.eq("embedding_model", sourceModel);
      }
      if (cursor) {
        query = query.gt("id", cursor);
      }

      const { data: rows, error: fetchErr } = await query;
      if (fetchErr) {
        logger.error(`Fetch error: ${fetchErr.message}`);
        break;
      }
      if (!rows || rows.length === 0) break;

      // Process each row
      for (const row of rows) {
        const record = row as unknown as Record<string, unknown>;
        const text = textFn(record);
        if (!text.trim()) continue;

        try {
          const embedding = await generateEmbedding(text);
          await db
            .from(table)
            .update({
              embedding: JSON.stringify(embedding),
              embedding_model: targetModel,
            } as never)
            .eq("id", record.id as string);
          processed++;
        } catch (e) {
          errors++;
          logger.warn(`Failed to re-embed ${table}/${record.id}: ${e instanceof Error ? e.message : e}`);
        }
      }

      cursor = (rows[rows.length - 1] as unknown as Record<string, unknown>).id as string;
      logger.info(`Progress: ${processed} processed, ${errors} errors, cursor=${cursor}`);

      // Rate-limit courtesy delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    logger.info(`Re-embed complete for ${table}: ${processed} processed, ${errors} errors`);
    return { table, processed, errors };
  },
});
