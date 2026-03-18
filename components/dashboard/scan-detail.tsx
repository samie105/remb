"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Loading03Icon,
  File01Icon,
  Layers01Icon,
  ArrowLeft02Icon,
  CodeIcon,
  Activity01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getScanJob,
  getScanFeatures,
  type ScanJobWithProject,
  type ScanLogEntry,
  type ScanResult,
} from "@/lib/scan-actions";
import { TechStackIcons } from "@/components/dashboard/tech-stack-icons";
import { groupScanFeaturesByImportance, type ImportanceTier } from "@/lib/smart-grouping";

/* ─── types ─── */
type ScanFeature = Awaited<ReturnType<typeof getScanFeatures>>[number];

/* ─── animation ─── */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ─── helpers ─── */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function logStatusColor(status: ScanLogEntry["status"]) {
  switch (status) {
    case "done":
      return "text-emerald-400";
    case "scanning":
      return "text-blue-400";
    case "error":
      return "text-red-400";
    case "skipped":
      return "text-zinc-500";
    default:
      return "text-zinc-600";
  }
}

function logStatusSymbol(status: ScanLogEntry["status"]) {
  switch (status) {
    case "done":
      return "✓";
    case "scanning":
      return "●";
    case "error":
      return "✗";
    case "skipped":
      return "○";
    default:
      return "·";
  }
}

/* ─── tier config ─── */
const TIER_ICONS: Record<ImportanceTier, typeof Layers01Icon> = {
  critical: Activity01Icon,
  high: Activity01Icon,
  medium: Layers01Icon,
  low: CodeIcon,
};

/* ─── Component ─── */
interface ScanDetailProps {
  scanJobId: string;
  projectSlug?: string;
  onBack?: () => void;
}

export function ScanDetail({ scanJobId, projectSlug, onBack }: ScanDetailProps) {
  const router = useRouter();
  const [job, setJob] = React.useState<ScanJobWithProject | null>(null);
  const [features, setFeatures] = React.useState<ScanFeature[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isTechModalOpen, setIsTechModalOpen] = React.useState(false);
  const [collapsedTiers, setCollapsedTiers] = React.useState<Set<string>>(new Set());
  const logEndRef = React.useRef<HTMLDivElement>(null);

  const toggleTier = React.useCallback((tier: string) => {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  function handleBack() {
    if (onBack) onBack();
    else if (projectSlug) router.push(`/dashboard/${projectSlug}?tab=scanner`);
    else router.back();
  }

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jobData, featuresData] = await Promise.all([
          getScanJob(scanJobId),
          getScanFeatures(scanJobId),
        ]);
        if (!cancelled) {
          setJob(jobData);
          setFeatures(featuresData);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [scanJobId]);

  React.useEffect(() => {
    if (!job || (job.status !== "running" && job.status !== "queued")) return;
    const interval = setInterval(async () => {
      const [jobData, featuresData] = await Promise.all([
        getScanJob(scanJobId),
        getScanFeatures(scanJobId),
      ]);
      setJob(jobData);
      setFeatures(featuresData);
      if (jobData && jobData.status !== "running" && jobData.status !== "queued") {
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [job?.status, scanJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job?.result]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-10 text-center">
        <p className="text-[13px] text-muted-foreground">Scan not found.</p>
        <Button variant="ghost" size="sm" onClick={handleBack} className="mt-2 gap-1.5">
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-3.5" />
          Back
        </Button>
      </div>
    );
  }

  const result = job.result as (ScanResult & { error?: string }) | null;
  const logs = result?.logs ?? [];
  const techStack = result?.tech_stack ?? [];
  const languages = result?.languages ?? {};
  const isRunning = job.status === "running" || job.status === "queued";
  const isFailed = job.status === "failed";
  const scanError = result?.error;
  const duration = result?.duration_ms ?? (
    job.started_at && job.finished_at
      ? new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
      : null
  );

  const allTech = [...new Set([...techStack, ...Object.keys(languages)])];
  const importanceGroups = groupScanFeaturesByImportance(features);

  const statusConfig = {
    done: { variant: "secondary" as const, label: "Completed", dot: "bg-emerald-500" },
    running: { variant: "outline" as const, label: "Running", dot: "bg-blue-500 animate-pulse" },
    failed: { variant: "outline" as const, label: "Failed", dot: "bg-red-500" },
    queued: { variant: "outline" as const, label: "Queued", dot: "bg-muted-foreground animate-pulse" },
  }[job.status] ?? { variant: "outline" as const, label: job.status, dot: "bg-muted-foreground" };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      {/* ─── Header ─── */}
      <motion.div variants={item} className="space-y-3">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5 -ml-2 text-muted-foreground">
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-3.5" />
          Back to scans
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
                {job.project_name}
              </h1>
              <Badge variant={statusConfig.variant} className="h-5 text-[10px] px-2 gap-1.5 border-border/40">
                <span className={`size-1.5 rounded-full ${statusConfig.dot}`} />
                {statusConfig.label}
              </Badge>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Scan triggered {job.triggered_by === "manual" ? "manually" : `via ${job.triggered_by}`}
              {job.started_at && ` · ${new Date(job.started_at).toLocaleString()}`}
            </p>
          </div>
          {duration != null && (
            <span className="text-[13px] text-muted-foreground font-mono flex items-center gap-1.5">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5" />
              {formatDuration(duration)}
            </span>
          )}
        </div>
      </motion.div>

      {/* ─── Error banner ─── */}
      {isFailed && scanError && (
        <motion.div variants={item} className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3.5 flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4 text-destructive" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-destructive">Scan failed</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">{scanError}</p>
          </div>
        </motion.div>
      )}

      {/* ─── Stats + Tech ─── */}
      {result && result.files_total != null && (
        <motion.div variants={item} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          {[
            { label: "Files", value: `${result.files_scanned ?? 0}/${result.files_total ?? 0}`, icon: File01Icon },
            { label: "Features", value: String(result.features_created ?? 0), icon: Layers01Icon },
            { label: "Entries", value: String(result.entries_created ?? 0), icon: CodeIcon },
            { label: "Errors", value: String(result.errors ?? 0), icon: (result.errors ?? 0) > 0 ? Cancel01Icon : CheckmarkCircle01Icon },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <HugeiconsIcon icon={stat.icon} strokeWidth={2} className="size-3.5 text-muted-foreground/60" />
              <span className="font-semibold tabular-nums text-foreground">{stat.value}</span>
              <span className="text-muted-foreground/60">{stat.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* ─── Tech Stack icons ─── */}
      {allTech.length > 0 && (
        <motion.div variants={item} className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsTechModalOpen(true)}
            className="flex items-center gap-2.5 hover:opacity-75 transition-opacity"
            title="View all technologies"
          >
            <TechStackIcons items={allTech} size="sm" maxVisible={5} />
            <span className="text-[12px] text-muted-foreground">
              {allTech.length} {allTech.length === 1 ? "technology" : "technologies"}
            </span>
          </button>

          <Dialog open={isTechModalOpen} onOpenChange={setIsTechModalOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-[15px]">Technologies Used</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 mt-2">
                {allTech.map((name) => {
                  const fileCount = languages[name];
                  return (
                    <Badge key={name} variant="secondary" className="gap-1.5 text-[11px] h-7 px-2.5 border-0">
                      <TechStackIcons items={[name]} size="xs" className="space-x-0!" />
                      {name}
                      {fileCount != null && (
                        <span className="text-muted-foreground/50 text-[10px]">{fileCount} files</span>
                      )}
                    </Badge>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>
      )}

      {/* ─── Tabs ─── */}
      <motion.div variants={item}>
        <Tabs defaultValue="features">
          <TabsList variant="line">
            <TabsTrigger value="features">
              Features ({features.length})
            </TabsTrigger>
            <TabsTrigger value="logs">
              Build Log
            </TabsTrigger>
          </TabsList>

          {/* ─── Features Tab ─── */}
          <TabsContent value="features" className="mt-5 space-y-6">
            {features.length === 0 ? (
              <div className="py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 mx-auto mb-3">
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-5 text-muted-foreground" />
                </div>
                <p className="text-[13px] font-medium text-foreground mb-1">
                  {isRunning ? "Scanning in progress..." : "No features found"}
                </p>
                <p className="text-[12px] text-muted-foreground max-w-xs mx-auto">
                  {isRunning
                    ? "Features will appear here as files are analyzed."
                    : "This scan did not extract any features from the codebase."}
                </p>
              </div>
            ) : (
              importanceGroups.map(({ tier, meta, features: tierFeatures }) => {
                const tierIcon = TIER_ICONS[tier];
                const isCollapsed = collapsedTiers.has(tier);
                return (
                  <div key={tier} className="space-y-3">
                    {/* Tier header */}
                    <button
                      type="button"
                      onClick={() => toggleTier(tier)}
                      className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity"
                    >
                      <div className="flex size-6 items-center justify-center rounded-md bg-muted/50">
                        <HugeiconsIcon icon={tierIcon} strokeWidth={2} className="size-3 text-muted-foreground" />
                      </div>
                      <h3 className="text-[13px] font-medium text-foreground flex-1 text-left">
                        {meta.label}
                      </h3>
                      <span className="text-[11px] text-muted-foreground/60">
                        {tierFeatures.length}
                      </span>
                      <HugeiconsIcon
                        icon={isCollapsed ? ArrowDown01Icon : ArrowUp01Icon}
                        strokeWidth={2}
                        className="size-3.5 text-muted-foreground/40"
                      />
                    </button>

                    {/* Feature rows */}
                    {!isCollapsed && (
                    <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
                      {tierFeatures.map((feature) => {
                        const files = feature.entries.map((e) => (e.metadata?.file_path as string) ?? "unknown");
                        const uniqueFiles = [...new Set(files)];

                        return (
                          <div key={feature.id} className="px-4 py-3 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-[13px] font-medium text-foreground truncate">
                                  {feature.name}
                                </h4>
                                <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                                  {feature.importance}/10
                                </span>
                                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0 border-0">
                                  {feature.category}
                                </Badge>
                              </div>
                              {feature.description && (
                                <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                                  {feature.description}
                                </p>
                              )}
                              {uniqueFiles.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {uniqueFiles.slice(0, 3).map((fp) => (
                                    <span
                                      key={fp}
                                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 font-mono"
                                    >
                                      <HugeiconsIcon icon={File01Icon} strokeWidth={2} className="size-2.5" />
                                      {fp.split("/").pop()}
                                    </span>
                                  ))}
                                  {uniqueFiles.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground/50">
                                      +{uniqueFiles.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>                    )}                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ─── Build Log Tab ─── */}
          <TabsContent value="logs" className="mt-5">
            <div className="rounded-xl border border-border/40 overflow-hidden w-full">
              <div className="bg-zinc-950 w-full overflow-hidden">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/80">
                  <div className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-zinc-700" />
                    <span className="size-2.5 rounded-full bg-zinc-700" />
                    <span className="size-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono ml-2">
                    scan — {job.project_name}
                  </span>
                  {isRunning && (
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3 animate-spin text-zinc-500 ml-auto" />
                  )}
                  {duration != null && !isRunning && (
                    <span className="text-[10px] text-zinc-600 font-mono ml-auto tabular-nums">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>

                {/* Log content */}
                <ScrollArea className="h-80">
                  <div className="p-4 font-mono text-[12px] leading-relaxed">
                    {logs.length === 0 && !isRunning && (
                      <p className="text-zinc-600">No log entries.</p>
                    )}
                    {logs.length === 0 && isRunning && (
                      <p className="text-zinc-500 animate-pulse">Initializing scan...</p>
                    )}
                    <AnimatePresence>
                      {logs.map((log, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex gap-2 items-start py-px group hover:bg-zinc-900/50 -mx-2 px-2 rounded"
                        >
                          <span className={`shrink-0 w-3 text-center ${logStatusColor(log.status)}`}>
                            {logStatusSymbol(log.status)}
                          </span>
                          <span className="text-zinc-600 shrink-0 hidden sm:inline w-18 text-[11px]">
                            {new Date(log.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                          </span>
                          {log.file && (
                            <span className="text-zinc-400 shrink-0 max-w-[25%] sm:max-w-52 truncate text-[11px]" title={log.file}>
                              {log.file}
                            </span>
                          )}
                          <span className={`flex-1 truncate ${logStatusColor(log.status)}`}>
                            {log.feature ? (
                              <span className="text-zinc-300">
                                → <span className="text-emerald-400">{log.feature}</span>
                              </span>
                            ) : (
                              log.message
                            )}
                          </span>
                          {log.elapsed_ms != null && (
                            <span className="text-zinc-700 shrink-0 text-[10px] tabular-nums group-hover:text-zinc-500 transition-colors">
                              {formatDuration(log.elapsed_ms)}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {isRunning && (
                      <div className="flex items-center gap-2 text-zinc-500 mt-1">
                        <span className="animate-pulse">▋</span>
                      </div>
                    )}
                    <div ref={logEndRef} />
                  </div>
                </ScrollArea>

                {/* Terminal footer */}
                {job.status === "done" && (
                  <div className="border-t border-zinc-800/80 px-4 py-2.5 flex items-center gap-2">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-3.5 text-emerald-500" />
                    <span className="text-[11px] text-emerald-500/80 font-mono">
                      Scan completed
                    </span>
                    {duration != null && (
                      <span className="text-[11px] text-zinc-600 font-mono ml-auto tabular-nums">
                        {formatDuration(duration)}
                      </span>
                    )}
                  </div>
                )}
                {job.status === "failed" && (
                  <div className="border-t border-zinc-800/80 px-4 py-2.5 flex items-center gap-2">
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5 text-red-500" />
                    <span className="text-[11px] text-red-500/80 font-mono">
                      Scan failed
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
