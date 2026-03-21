"use server";

import { createAdminClient } from "@/lib/supabase/server";

/* ─── types ─── */

export interface EntityRef {
  entity_type: string;
  entity_id: string;
}

export interface NeighborResult {
  direction: "outgoing" | "incoming";
  related_type: string;
  related_id: string;
  relation: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface TraversalResult {
  hop: number;
  entity_type: string;
  entity_id: string;
  via_relation: string;
  confidence: number;
  path: string[];
}

export interface KnowledgeGraphNode {
  entity_type: string;
  entity_id: string;
  relation: string;
  direction: string;
  confidence: number;
  title: string | null;
  preview: string | null;
}

/* ─── graph queries ─── */

/**
 * Get 1-hop neighbors of any entity.
 */
export async function getEntityNeighborhood(
  userId: string,
  entityType: string,
  entityId: string,
  projectId?: string,
): Promise<NeighborResult[]> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("get_entity_neighborhood" as "search_memories", {
    p_user_id: userId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_project_id: projectId ?? null,
  } as never);

  if (error) throw new Error(`Graph neighborhood query failed: ${error.message}`);
  return (data ?? []) as unknown as NeighborResult[];
}

/**
 * Multi-hop traversal from any entity.
 */
export async function getRelatedEntities(
  userId: string,
  entityType: string,
  entityId: string,
  options?: {
    maxHops?: number;
    relationFilter?: string;
    projectId?: string;
  },
): Promise<TraversalResult[]> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("get_related_entities" as "search_memories", {
    p_user_id: userId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_max_hops: options?.maxHops ?? 2,
    p_relation_filter: options?.relationFilter ?? null,
    p_project_id: options?.projectId ?? null,
  } as never);

  if (error) throw new Error(`Graph traversal failed: ${error.message}`);
  return (data ?? []) as unknown as TraversalResult[];
}

/**
 * Get the full knowledge graph for a feature — all memories, context entries,
 * conversations, and file deps related to it.
 */
export async function getFeatureKnowledgeGraph(
  userId: string,
  featureId: string,
): Promise<KnowledgeGraphNode[]> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("get_feature_knowledge_graph" as "search_memories", {
    p_user_id: userId,
    p_feature_id: featureId,
  } as never);

  if (error) throw new Error(`Feature knowledge graph failed: ${error.message}`);
  return (data ?? []) as unknown as KnowledgeGraphNode[];
}

/**
 * Create entity relations in bulk — used by scan pipeline and knowledge extraction.
 */
export async function createEntityRelations(
  userId: string,
  relations: Array<{
    projectId?: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relation: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }>,
): Promise<number> {
  if (relations.length === 0) return 0;

  const db = createAdminClient();
  const rows = relations.map((r) => ({
    user_id: userId,
    project_id: r.projectId ?? null,
    source_type: r.sourceType,
    source_id: r.sourceId,
    target_type: r.targetType,
    target_id: r.targetId,
    relation: r.relation,
    confidence: r.confidence ?? 1.0,
    metadata: r.metadata ?? {},
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // entity_relations table is not yet in generated Supabase types
    const { error } = await (db as unknown as { from: (t: string) => { upsert: (v: unknown, o: { onConflict: string }) => Promise<{ error: Error | null }> } })
      .from("entity_relations")
      .upsert(chunk, { onConflict: "source_type,source_id,target_type,target_id,relation" });
    if (!error) inserted += chunk.length;
  }

  return inserted;
}
