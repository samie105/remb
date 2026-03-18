"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  BrainIcon,
  Search01Icon,
  SparklesIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createMemory,
  updateMemory,
  deleteMemory,
  changeTier,
  getMemories,
  getMemoryStats,
  generateProjectMemories,
  type MemoryWithProject,
  type MemoryStats,
  type CreateMemoryInput,
} from "@/lib/memory-actions";
import type { MemoryTier, MemoryCategory } from "@/lib/supabase/types";
import {
  TIER_CONFIG,
  CATEGORY_CONFIG,
  ALL_TIERS,
  ALL_CATEGORIES,
  TOKEN_BUDGETS,
  staggerContainer,
} from "./memory-constants";
import { MemoryRow } from "./memory-row";
import { MemoryFormDialog } from "./memory-form-dialog";
import { TokenIndicator } from "./token-indicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function MemoryClient({
  initialMemories,
  initialStats,
  projectId,
  projectName,
}: {
  initialMemories: MemoryWithProject[];
  initialStats: MemoryStats;
  projectId?: string;
  projectName?: string;
}) {
  const [memories, setMemories] = React.useState(initialMemories);
  const [stats, setStats] = React.useState(initialStats);
  const [filterTier, setFilterTier] = React.useState<MemoryTier | "all">(
    "all",
  );
  const [filterCategory, setFilterCategory] = React.useState<
    MemoryCategory | "all"
  >("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingMemory, setEditingMemory] = React.useState<
    MemoryWithProject | undefined
  >();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generateStatus, setGenerateStatus] = React.useState<string | null>(null);
  const [deletingMemoryId, setDeletingMemoryId] = React.useState<string | null>(null);

  const tierAbortMap = React.useRef(new Map<string, AbortController>());

  const isProjectMode = !!projectId;

  async function refreshData() {
    const [newMemories, newStats] = await Promise.all([
      getMemories(isProjectMode ? { projectId } : undefined),
      getMemoryStats(isProjectMode ? { projectId } : undefined),
    ]);
    setMemories(newMemories);
    setStats(newStats);
  }

  async function handleGenerate() {
    if (!projectId) return;
    setIsGenerating(true);
    setGenerateStatus("Analyzing project features...");
    try {
      const result = await generateProjectMemories(projectId);
      setGenerateStatus(`Created ${result.created} memories`);
      // Immediately add new memories to state so UI updates without reload
      const newMemories: MemoryWithProject[] = result.memories.map((m) => ({
        ...m,
        project_name: projectName ?? null,
        image_count: 0,
      }));
      setMemories((prev) => [...newMemories, ...prev]);
      // Refresh stats in background
      getMemoryStats(isProjectMode ? { projectId } : undefined)
        .then(setStats)
        .catch(() => {});
      setTimeout(() => setGenerateStatus(null), 3000);
    } catch (err) {
      setGenerateStatus(err instanceof Error ? err.message : "Failed to generate");
      setTimeout(() => setGenerateStatus(null), 5000);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(
    data: CreateMemoryInput & { id?: string }
  ): Promise<string | void> {
    setIsSaving(true);
    try {
      let memoryId: string | undefined;
      if (data.id) {
        await updateMemory({
          id: data.id,
          title: data.title,
          content: data.content,
          category: data.category,
          tags: data.tags,
        });
        memoryId = data.id;
      } else {
        const created = await createMemory({
          ...data,
          projectId: isProjectMode ? projectId : undefined,
        });
        memoryId = created.id;
      }
      setDialogOpen(false);
      setEditingMemory(undefined);
      await refreshData();
      return memoryId;
    } catch (err) {
      console.error("Failed to save memory:", err);
      toast.error("Failed to save memory. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMemory(id);
      await refreshData();
      toast.success("Memory deleted");
    } catch (err) {
      console.error("Failed to delete memory:", err);
      toast.error("Failed to delete memory. Please try again.");
    }
  }

  async function handleChangeTier(id: string, newTier: MemoryTier) {
    const prev = tierAbortMap.current.get(id);
    if (prev) prev.abort();
    const controller = new AbortController();
    tierAbortMap.current.set(id, controller);

    const prevMemories = memories;
    const prevStats = stats;

    const target = memories.find((m) => m.id === id);
    if (!target) return;
    const oldTier = target.tier;
    const tokens = target.token_count;

    setMemories((ms) =>
      ms.map((m) => (m.id === id ? { ...m, tier: newTier } : m)),
    );
    setStats((s) => ({
      ...s,
      byTier: {
        ...s.byTier,
        [oldTier]: {
          count: s.byTier[oldTier].count - 1,
          tokens: s.byTier[oldTier].tokens - tokens,
        },
        [newTier]: {
          count: s.byTier[newTier].count + 1,
          tokens: s.byTier[newTier].tokens + tokens,
        },
      },
    }));

    try {
      await changeTier(id, newTier);
      if (controller.signal.aborted) return;
      await refreshData();
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Failed to change tier:", err);
      toast.error("Failed to change tier. Please try again.");
      setMemories(prevMemories);
      setStats(prevStats);
    } finally {
      tierAbortMap.current.delete(id);
    }
  }

  const filtered = memories.filter((m) => {
    if (filterTier !== "all" && m.tier !== filterTier) return false;
    if (filterCategory !== "all" && m.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q))
      );
    }
    return true;
  });

  const groupedByTier = ALL_TIERS.reduce(
    (acc, tier) => {
      acc[tier] = filtered.filter((m) => m.tier === tier);
      return acc;
    },
    {} as Record<MemoryTier, MemoryWithProject[]>,
  );

  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {isProjectMode ? `${projectName} Memory` : "Memory"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {isProjectMode
              ? "Project-specific context and patterns the AI remembers for this project."
              : "General preferences and patterns the AI remembers across all projects."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isProjectMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-1.5 h-7 text-xs"
            >
              <HugeiconsIcon
                icon={isGenerating ? Loading03Icon : SparklesIcon}
                strokeWidth={2}
                className={`size-3 ${isGenerating ? "animate-spin" : ""}`}
              />
              {generateStatus ?? "Generate Memories"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditingMemory(undefined);
              setDialogOpen(true);
            }}
            className="gap-1.5 h-7 text-xs"
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3" />
            Add Memory
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 flex-wrap">
        {ALL_TIERS.map((tier) => {
          const conf = TIER_CONFIG[tier];
          return (
            <div key={tier} className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5 border border-border/40">
                <HugeiconsIcon
                  icon={conf.icon}
                  strokeWidth={2}
                  className="size-3 text-foreground/50"
                />
              </div>
              <span className="text-[11px] font-medium text-foreground/70">
                {conf.label}
              </span>
              <TokenIndicator
                used={stats.byTier[tier].tokens}
                budget={TOKEN_BUDGETS[tier]}
              />
            </div>
          );
        })}
        <span className="text-[11px] tabular-nums text-muted-foreground/50 ml-auto">
          {stats.total} {stats.total === 1 ? "memory" : "memories"}
        </span>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50"
          />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-[12px] pl-8"
          />
        </div>

        <div className="flex items-center rounded-lg border border-border/40 p-0.5 bg-muted/30">
          {(["all", ...ALL_TIERS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                filterTier === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              {t === "all" ? "All" : TIER_CONFIG[t].label}
            </button>
          ))}
        </div>

        <Select
          value={filterCategory}
          onValueChange={(v) =>
            setFilterCategory(v as MemoryCategory | "all")
          }
        >
          <SelectTrigger className="w-32.5 h-8 text-[11px] border-border/40">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ALL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_CONFIG[c].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tier sections */}
      <div className="space-y-6">
        {ALL_TIERS.map((tier) => {
          const tierMemories = groupedByTier[tier];
          if (filterTier !== "all" && filterTier !== tier) return null;
          const conf = TIER_CONFIG[tier];

          return (
            <section key={tier}>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="flex size-7 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
                  <HugeiconsIcon
                    icon={conf.icon}
                    strokeWidth={2}
                    className="size-3.5 text-foreground/70"
                  />
                </div>
                <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-foreground">
                  {conf.label}
                </h2>
                <span className="text-[11px] text-muted-foreground/50 tabular-nums">
                  {tierMemories.length}
                </span>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                  {conf.hint}
                </span>
              </div>
              <Separator className="mb-3" />

              {tierMemories.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-[12px] text-muted-foreground/50">
                    {searchQuery || filterCategory !== "all"
                      ? "No memories match your current filters"
                      : `No ${conf.label.toLowerCase()} memories yet`}
                  </p>
                  {(searchQuery || filterCategory !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-muted-foreground"
                      onClick={() => {
                        setSearchQuery("");
                        setFilterCategory("all");
                        setFilterTier("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30"
                >
                  <AnimatePresence mode="popLayout">
                    {tierMemories.map((memory) => (
                      <MemoryRow
                        key={memory.id}
                        memory={memory}
                        showProject={isProjectMode}
                        onEdit={() => {
                          setEditingMemory(memory);
                          setDialogOpen(true);
                        }}
                        onDelete={() => setDeletingMemoryId(memory.id)}
                        onChangeTier={(newTier) =>
                          handleChangeTier(memory.id, newTier)
                        }
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </section>
          );
        })}
      </div>

      {/* Empty state */}
      {memories.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-dashed border-border/60 py-16 flex flex-col items-center gap-3"
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 border border-border/40">
            <HugeiconsIcon
              icon={BrainIcon}
              strokeWidth={1.5}
              className="size-6 text-foreground/60"
            />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              No memories yet
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              {isProjectMode
                ? `Add memories specific to ${projectName} — project conventions, architecture decisions, and patterns.`
                : "Add general memories — coding preferences, patterns, and knowledge that apply across all projects."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditingMemory(undefined);
              setDialogOpen(true);
            }}
            className="mt-1 gap-1.5"
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-3"
            />
            Add your first memory
          </Button>
        </motion.div>
      )}

      <MemoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        memory={editingMemory}
        onSave={handleSave}
        isSaving={isSaving}
        projectName={projectName}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingMemoryId} onOpenChange={(open) => !open && setDeletingMemoryId(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This memory will be permanently removed. Any AI sessions relying on it will no longer have access to this context.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingMemoryId) {
                  handleDelete(deletingMemoryId);
                  setDeletingMemoryId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
