"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Layers01Icon,
  DatabaseIcon,
  Settings01Icon,
  Globe02Icon,
  Loading03Icon,
  RefreshIcon,
  StarIcon,
  Radar01Icon,
  ArrowRight01Icon,
  AlertDiamondIcon,
  ArrowUp01Icon,
  CircleIcon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureDetailDialog } from "@/components/dashboard/feature-detail-dialog";
import {
  getImportanceGroupedFeatures,
  type ImportanceGroup,
  type ImportanceTier,
  type TieredFeature,
} from "@/lib/smart-grouping";
import type { FeatureCategory } from "@/lib/importance-tiers";

/* ─── Category icon lookup ─── */
const CATEGORY_ICONS: Record<FeatureCategory, typeof Layers01Icon> = {
  core: Layers01Icon,
  ui: StarIcon,
  data: DatabaseIcon,
  infra: Settings01Icon,
  integration: Globe02Icon,
};

const TIER_ICONS: Record<ImportanceTier, typeof AlertDiamondIcon> = {
  critical: AlertDiamondIcon,
  high: ArrowUp01Icon,
  medium: CircleIcon,
  low: ArrowDown01Icon,
};

/* ─── Feature row (bordered list item) ─── */
function FeatureRow({
  feature,
  onSelect,
}: {
  feature: TieredFeature;
  onSelect: (id: string) => void;
}) {
  const catIcon = CATEGORY_ICONS[feature.category];

  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 rounded-lg border border-border/40 bg-card px-3.5 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/30"
      onClick={() => onSelect(feature.id)}
    >
      {/* Category icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <HugeiconsIcon icon={catIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {feature.name}
          </span>
          <Badge variant="secondary" className="shrink-0 h-4 text-[9px] px-1.5 font-normal">
            {feature.category}
          </Badge>
        </div>

        {feature.description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-1">
            {feature.description}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground/70">
          <span>{feature.entry_count} {feature.entry_count === 1 ? "entry" : "entries"}</span>
          <span className="text-border/60">&middot;</span>
          <span>{feature.files.length} {feature.files.length === 1 ? "file" : "files"}</span>
          {feature.dependencies.length > 0 && (
            <>
              <span className="text-border/60">&middot;</span>
              <span>{feature.dependencies.length} deps</span>
            </>
          )}
          <span className="text-border/60">&middot;</span>
          <span className="tabular-nums">{feature.importance}/10</span>
        </div>
      </div>

      {/* Arrow */}
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="mt-1.5 size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
      />
    </button>
  );
}

/* ─── Feature Groups Section ─── */
type SortOption = "importance" | "name" | "entries";

export function FeatureGroups({ projectId }: { projectId: string }) {
  const [groups, setGroups] = React.useState<ImportanceGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedFeatureId, setSelectedFeatureId] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<SortOption>("importance");
  const [categoryFilter, setCategoryFilter] = React.useState<FeatureCategory | "all">("all");
  const scrollRef = React.useRef(0);

  const loadFeatures = React.useCallback(async () => {
    scrollRef.current = window.scrollY;
    setIsLoading(true);
    try {
      const data = await getImportanceGroupedFeatures(projectId);
      setGroups(data);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  // Restore scroll position after refresh
  React.useEffect(() => {
    if (!isLoading && scrollRef.current > 0) {
      window.scrollTo(0, scrollRef.current);
    }
  }, [isLoading]);

  const totalFeatures = groups.reduce((s, g) => s + g.features.length, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
          <span className="text-[12px]">Loading features...</span>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
            <HugeiconsIcon icon={Radar01Icon} strokeWidth={1.5} className="size-4 text-muted-foreground" />
          </div>
          <p className="text-[13px] font-medium text-foreground mb-1">No features yet</p>
          <p className="text-xs text-muted-foreground">
            Run a scan to detect features and build the map.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-muted-foreground">
            {totalFeatures} feature{totalFeatures !== 1 ? "s" : ""}
          </p>
          {/* Category filter chips */}
          <div className="flex items-center rounded-lg border border-border/40 p-0.5 bg-muted/30">
            {(["all", ...Object.keys(CATEGORY_ICONS)] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat as FeatureCategory | "all")}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                  categoryFilter === cat
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                }`}
              >
                {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort selector */}
          <div className="flex items-center rounded-lg border border-border/40 p-0.5 bg-muted/30">
            {(["importance", "name", "entries"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                  sortBy === opt
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                }`}
              >
                {opt === "importance" ? "Importance" : opt === "name" ? "Name" : "Entries"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={loadFeatures}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3" />
            Refresh
          </Button>
        </div>
      </div>

      {groups.map((group) => {
        const tierIcon = TIER_ICONS[group.tier];
        // Apply category filter
        let filteredFeatures = group.features;
        if (categoryFilter !== "all") {
          filteredFeatures = filteredFeatures.filter((f) => f.category === categoryFilter);
        }
        // Apply sort
        if (sortBy === "name") {
          filteredFeatures = [...filteredFeatures].sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "entries") {
          filteredFeatures = [...filteredFeatures].sort((a, b) => b.entry_count - a.entry_count);
        }
        if (filteredFeatures.length === 0) return null;

        return (
          <div key={group.tier} className="space-y-2">
            {/* Tier header */}
            <div className="flex items-center gap-2 px-0.5">
              <HugeiconsIcon icon={tierIcon} strokeWidth={2} className="size-3.5 text-muted-foreground/60" />
              <h3 className="text-[12px] font-medium text-muted-foreground tracking-wide uppercase">
                {group.label}
              </h3>
              <span className="text-[11px] text-muted-foreground/50">{group.features.length}</span>
            </div>

            {/* Feature list */}
            <div className="space-y-1.5">
              {filteredFeatures.map((feature) => (
                <FeatureRow
                  key={feature.id}
                  feature={feature}
                  onSelect={setSelectedFeatureId}
                />
              ))}
            </div>
          </div>
        );
      })}

      <FeatureDetailDialog
        featureId={selectedFeatureId}
        onClose={() => setSelectedFeatureId(null)}
      />
    </div>
  );
}
