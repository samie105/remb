"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Layers01Icon,
  File01Icon,
  Clock01Icon,
  Loading03Icon,
  Folder01Icon,
  CommandLineIcon,
  Globe02Icon,
  RepeatIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getFeatureDetail, type FeatureDetail } from "@/lib/project-actions";

/* ─── helpers ─── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Group entries by directory/page */
function groupByDirectory(entries: FeatureDetail["entries"]) {
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const filePath = (entry.metadata?.file_path as string) ?? "unknown";
    const parts = filePath.split("/");
    // Group by parent directory
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
    const existing = groups.get(dir) ?? [];
    existing.push(entry);
    groups.set(dir, existing);
  }
  return groups;
}

/* ─── Component ─── */
interface FeatureDetailDialogProps {
  featureId: string | null;
  onClose: () => void;
}

export function FeatureDetailDialog({ featureId, onClose }: FeatureDetailDialogProps) {
  const [feature, setFeature] = React.useState<FeatureDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!featureId) {
      setFeature(null);
      setExpandedDirs(new Set());
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getFeatureDetail(featureId).then((data) => {
      if (!cancelled) {
        setFeature(data);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [featureId]);

  const fileGroups = feature ? groupByDirectory(feature.entries) : new Map();

  return (
    <Dialog open={!!featureId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
              <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
            </div>
            <span className="font-mono text-[15px] truncate">
              {feature?.name ?? "Loading..."}
            </span>
            {feature && feature.entries.length > 0 && (() => {
              const meta = feature.entries[0].metadata;
              const imp = typeof meta?.importance === "number" ? meta.importance : null;
              return imp != null ? (
                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 ml-1 shrink-0">
                  {imp}/10
                </Badge>
              ) : null;
            })()}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : feature ? (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 pb-4">
              {/* Description */}
              <div>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {feature.description ?? "No description"}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground/60">
                  <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                    {feature.status}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-2.5" />
                    {timeAgo(feature.updated_at)}
                  </span>
                  <span>{feature.entries.length} entries</span>
                </div>
              </div>

              {/* File Grouping */}
              <div className="space-y-3">
                <h4 className="text-[12px] font-medium text-foreground uppercase tracking-wide">
                  Files by Location
                </h4>

                <AnimatePresence>
                  {[...fileGroups.entries()].map(([dir, entries], groupIndex) => (
                    <motion.div
                      key={dir}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: groupIndex * 0.05 }}
                      className="space-y-1"
                    >
                      {/* Directory header */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                        <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-3" />
                        {dir}
                        <Badge variant="outline" className="h-4 text-[9px] px-1 ml-1">
                          {entries.length}
                        </Badge>
                      </div>

                      {/* Stacked file cards */}
                      <div className="relative ml-4">
                        {(() => {
                          const isExpanded = expandedDirs.has(dir);
                          const visibleEntries = isExpanded ? entries : entries.slice(0, 3);
                          return (
                            <>
                              {visibleEntries.map((entry: { id: string; content: string; entry_type?: string; source?: string; metadata: Record<string, unknown> | null }, i: number) => {
                                const filePath = (entry.metadata?.file_path as string) ?? "unknown";
                                const fileName = filePath.split("/").pop() ?? filePath;
                                let content: { summary?: string; key_decisions?: string[]; dependencies?: string[]; tags?: string[] } = {};
                                try {
                                  content = JSON.parse(entry.content);
                                } catch { /* ignore */ }

                                const sourceIcon = entry.source === "cli" ? CommandLineIcon : entry.source === "worker" ? RepeatIcon : Globe02Icon;
                                const sourceLabel = entry.source === "cli" ? "CLI" : entry.source === "worker" ? "Scan" : "Web";

                                return (
                                  <div
                                    key={entry.id}
                                    className="rounded-lg border border-border/40 bg-card px-3 py-2 text-[12px]"
                                    style={{
                                      marginTop: i > 0 ? -4 : 0,
                                      zIndex: entries.length - i,
                                      position: "relative",
                                    }}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-3 text-muted-foreground" />
                                      <span className="font-mono font-medium text-foreground flex-1 truncate" title={filePath}>{fileName}</span>
                                      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground shrink-0">
                                        <HugeiconsIcon icon={sourceIcon} strokeWidth={2} className="size-2.5" />
                                        {sourceLabel}
                                      </span>
                                    </div>
                                    {content.summary && (
                                      <p className="text-[11px] text-muted-foreground line-clamp-2 ml-5">
                                        {content.summary}
                                      </p>
                                    )}
                                    {content.tags && content.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
                                        {content.tags.slice(0, 4).map((tag) => (
                                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {entries.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedDirs((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(dir)) next.delete(dir);
                                      else next.add(dir);
                                      return next;
                                    });
                                  }}
                                  className="w-full rounded-lg border border-border/30 bg-muted/30 px-3 py-1.5 text-center text-[11px] text-muted-foreground font-medium hover:bg-muted/50 transition-colors cursor-pointer"
                                  style={{ marginTop: -4, position: "relative" }}
                                >
                                  {isExpanded ? "Show less" : `+${entries.length - 3} more files`}
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            Feature not found.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
