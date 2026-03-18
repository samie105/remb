/**
 * Pure, client-safe importance tier utilities.
 * No "use server" — safe to import from both server and client code.
 */

export type FeatureCategory = "core" | "ui" | "data" | "infra" | "integration";

export type ImportanceTier = "critical" | "high" | "medium" | "low";

export type TieredFeature = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: FeatureCategory;
  importance: number;
  entry_count: number;
  files: string[];
  dependencies: string[];
  tags: string[];
  key_decisions: string[];
  gotchas: string[];
};

export type ImportanceGroup = {
  tier: ImportanceTier;
  label: string;
  description: string;
  color: string;
  bg: string;
  features: TieredFeature[];
  avgImportance: number;
};

export const TIER_META: Record<
  ImportanceTier,
  { label: string; description: string; color: string; bg: string; min: number; max: number }
> = {
  critical: {
    label: "Critical",
    description: "Core systems the app cannot function without",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    min: 9,
    max: 10,
  },
  high: {
    label: "High Priority",
    description: "Key features driving the primary user experience",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    min: 7,
    max: 8,
  },
  medium: {
    label: "Standard",
    description: "Supporting features and utilities",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    min: 4,
    max: 6,
  },
  low: {
    label: "Low Priority",
    description: "Minor utilities and peripheral code",
    color: "text-zinc-500 dark:text-zinc-400",
    bg: "bg-zinc-500/10",
    min: 1,
    max: 3,
  },
};

export function getTier(importance: number): ImportanceTier {
  if (importance >= 9) return "critical";
  if (importance >= 7) return "high";
  if (importance >= 4) return "medium";
  return "low";
}
