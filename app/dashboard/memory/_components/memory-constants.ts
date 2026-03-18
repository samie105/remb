import {
  StarIcon,
  Clock01Icon,
  Archive01Icon,
} from "@hugeicons/core-free-icons";
import type { MemoryTier, MemoryCategory } from "@/lib/supabase/types";

export const TIER_CONFIG: Record<
  MemoryTier,
  {
    label: string;
    description: string;
    icon: typeof StarIcon;
    hint: string;
  }
> = {
  core: {
    label: "Core",
    description:
      "Always loaded into AI context. High-value patterns and preferences.",
    icon: StarIcon,
    hint: "max 20 · always loaded",
  },
  active: {
    label: "Active",
    description: "Loaded on demand when relevant to the current task.",
    icon: Clock01Icon,
    hint: "loaded contextually",
  },
  archive: {
    label: "Archive",
    description: "Compressed long-term storage. Promoted back when needed.",
    icon: Archive01Icon,
    hint: "compressed storage",
  },
};

export const CATEGORY_CONFIG: Record<MemoryCategory, { label: string }> = {
  preference: { label: "Preference" },
  pattern: { label: "Pattern" },
  decision: { label: "Decision" },
  correction: { label: "Correction" },
  knowledge: { label: "Knowledge" },
  general: { label: "General" },
};

export const ALL_TIERS: MemoryTier[] = ["core", "active", "archive"];
export const ALL_CATEGORIES: MemoryCategory[] = [
  "preference",
  "pattern",
  "decision",
  "correction",
  "knowledge",
  "general",
];

export const TOKEN_BUDGETS: Record<MemoryTier, number> = {
  core: 2000,
  active: 8000,
  archive: 20000,
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
};
