// Re-export for backward compatibility — callers importing from smart-grouping keep working.
export type { ImportanceTier, ImportanceGroup, TieredFeature } from "@/lib/importance-tiers";
export { TIER_META, getTier } from "@/lib/importance-tiers";
export { getImportanceGroupedFeatures } from "@/lib/project-actions";

import type { FeatureCategory, ImportanceTier } from "@/lib/importance-tiers";
import { TIER_META, getTier } from "@/lib/importance-tiers";

type ScanFeatureEntry = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
};

type ScanFeature = {
  id: string;
  name: string;
  description: string | null;
  entries: ScanFeatureEntry[];
};

export function groupScanFeaturesByImportance(features: ScanFeature[]) {
  const groups = new Map<ImportanceTier, Array<ScanFeature & { importance: number; category: FeatureCategory }>>();

  for (const f of features) {
    let importance = 5;
    let category: FeatureCategory = "core";

    // Extract importance and category from first entry metadata
    if (f.entries.length > 0) {
      const meta = f.entries[0].metadata;
      if (meta?.importance && typeof meta.importance === "number") {
        importance = meta.importance as number;
      }
      if (meta?.category && typeof meta.category === "string") {
        const valid: FeatureCategory[] = ["core", "ui", "data", "infra", "integration"];
        if (valid.includes(meta.category as FeatureCategory)) {
          category = meta.category as FeatureCategory;
        }
      }
    }

    const tier = getTier(importance);
    const list = groups.get(tier) ?? [];
    list.push({ ...f, importance, category });
    groups.set(tier, list);
  }

  // Return in tier order, sorted by importance within each tier
  const tierOrder: ImportanceTier[] = ["critical", "high", "medium", "low"];
  const result: Array<{
    tier: ImportanceTier;
    meta: (typeof TIER_META)[ImportanceTier];
    features: Array<ScanFeature & { importance: number; category: FeatureCategory }>;
  }> = [];

  for (const tier of tierOrder) {
    const feats = groups.get(tier);
    if (!feats?.length) continue;
    feats.sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
    result.push({ tier, meta: TIER_META[tier], features: feats });
  }

  return result;
}
