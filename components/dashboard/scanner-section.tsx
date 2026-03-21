"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Radar01Icon,
  Clock01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
  File01Icon,
  Cancel01Icon,
  Layers01Icon,
  ArrowRight01Icon,
  FilterIcon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNotification } from "@/components/dashboard/notification-center";
import {
  createScanJob,
  checkForChanges,
  getScanJobs,
  cancelScanJob,
} from "@/lib/scan-actions";
import { updateIgnorePatterns } from "@/lib/project-actions";
import { NewScanModal } from "@/components/dashboard/scan-complete-modal";
import { generateProjectMemories } from "@/lib/memory-actions";
import type { ProjectWithCounts } from "@/lib/project-actions";
import type { ScanJobRow } from "@/lib/supabase/types";

/* ─── animation ─── */
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

function statusBadge(status: string) {
  switch (status) {
    case "done":
      return { label: "Completed", variant: "secondary" as const, dotClass: "bg-emerald-500" };
    case "running":
      return { label: "Running", variant: "outline" as const, dotClass: "bg-blue-500 animate-pulse" };
    case "failed":
      return { label: "Failed", variant: "destructive" as const, dotClass: "bg-red-500" };
    default:
      return { label: "Queued", variant: "outline" as const, dotClass: "bg-muted-foreground animate-pulse" };
  }
}

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

/* ─── Props ─── */
interface ScannerSectionProps {
  project: ProjectWithCounts;
}

export function ScannerSection({ project }: ScannerSectionProps) {
  const router = useRouter();
  const [jobs, setJobs] = React.useState<ScanJobRow[]>([]);
  const [isScanning, setIsScanning] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showScanModal, setShowScanModal] = React.useState(false);
  const [ignorePatterns, setIgnorePatterns] = React.useState(project.ignore_patterns ?? "");
  const [isSavingPatterns, setIsSavingPatterns] = React.useState(false);
  const pendingMemoriesRef = React.useRef(false);
  const scanLockRef = React.useRef(false);

  const loadJobs = React.useCallback(async () => {
    const data = await getScanJobs(project.id);
    setJobs(data);
    return data;
  }, [project.id]);

  React.useEffect(() => {
    let cancelled = false;
    loadJobs().then(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadJobs]);

  // Poll while running
  const prevJobStatusRef = React.useRef<Map<string, string>>(new Map());

  React.useEffect(() => {
    const map = new Map<string, string>();
    for (const j of jobs) map.set(j.id, j.status);
    prevJobStatusRef.current = map;
  }, [jobs]);

  React.useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasRunning) return;

    const interval = setInterval(async () => {
      const data = await getScanJobs(project.id);
      const prev = prevJobStatusRef.current;

      for (const job of data) {
        const oldStatus = prev.get(job.id);
        if (oldStatus && (oldStatus === "running" || oldStatus === "queued")) {
          if (job.status === "done") {
            const result = job.result as Record<string, number> | null;
            addNotification({
              type: "success",
              title: "Scan complete",
              message: `Found ${result?.features_created ?? 0} features across ${result?.files_scanned ?? 0} files.`,
            });
            if (pendingMemoriesRef.current) {
              pendingMemoriesRef.current = false;
              generateProjectMemories(project.id)
                .then((res) => {
                  addNotification({
                    type: "success",
                    title: "Memories generated",
                    message: `Created ${res.created} memories from scan results.`,
                  });
                  router.refresh();
                })
                .catch(() => {
                  addNotification({
                    type: "error",
                    title: "Memory generation failed",
                    message: "You can try again from the Memory tab.",
                  });
                });
            }
          } else if (job.status === "failed") {
            const result = job.result as Record<string, string> | null;
            const isTimeout = result?.error?.includes("timed out");
            addNotification({
              type: "error",
              title: isTimeout ? "Scan timed out" : "Scan failed",
              message: isTimeout
                ? "Scans are limited to 15 minutes. Try adding ignore patterns in project settings to reduce scan scope."
                : `Scan for ${project.name} encountered an error.`,
            });
          }
        }
      }

      setJobs(data);
      const stillRunning = data.some((j) => j.status === "running" || j.status === "queued");
      if (!stillRunning) {
        setIsScanning(false);
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [jobs, router, project.id, project.name]);

  function handleScanConfirm(includeMemories: boolean) {
    pendingMemoriesRef.current = includeMemories;
    handleScan();
  }

  async function handleScan() {
    if (isScanning || scanLockRef.current) return;
    scanLockRef.current = true;

    if (!project.repo_name) {
      scanLockRef.current = false;
      addNotification({ type: "error", title: "No repository", message: "This project has no connected repository." });
      return;
    }
    setIsScanning(true);
    try {
      const { hasChanges } = await checkForChanges(project.id);
      if (!hasChanges) {
        setIsScanning(false);
        addNotification({ type: "info", title: "No changes detected", message: "Your codebase is up to date — no new commits since the last scan." });
        return;
      }

      await createScanJob(project.id);
      addNotification({ type: "success", title: "Scan started", message: `Scanning ${project.repo_name}...` });
      const data = await getScanJobs(project.id);
      setJobs(data);
    } catch (err) {
      setIsScanning(false);
      addNotification({
        type: "error",
        title: "Scan failed",
        message: err instanceof Error ? err.message : "Failed to start scan.",
      });
    } finally {
      scanLockRef.current = false;
    }
  }

  function navigateToScan(scanId: string) {
    router.push(`/dashboard/${project.slug}/scan/${scanId}`);
  }

  async function handleSaveIgnorePatterns() {
    setIsSavingPatterns(true);
    try {
      await updateIgnorePatterns(project.id, ignorePatterns);
      addNotification({ type: "success", title: "Ignore patterns saved", message: "Will apply on next scan." });
    } catch (err) {
      addNotification({ type: "error", title: "Failed to save", message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsSavingPatterns(false);
    }
  }

  // Stats
  const totalScans = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === "done");
  const totalFiles = completedJobs.reduce((s, j) => s + ((j.result as Record<string, number> | null)?.files_scanned ?? 0), 0);
  const totalFeatures = completedJobs.reduce((s, j) => s + ((j.result as Record<string, number> | null)?.features_created ?? 0), 0);

  // Latest scan for hero section
  const latestJob = jobs[0] ?? null;
  const latestResult = latestJob?.result as Record<string, number> | null;
  const isLatestRunning = latestJob?.status === "running" || latestJob?.status === "queued";

  // Detect if latest running scan is part of a chain
  const chainId = (latestResult as Record<string, unknown> | null)?._chain_id as string | undefined;
  const batchNumber = ((latestResult as Record<string, unknown> | null)?._batch_number as number) ?? ((latestResult as Record<string, unknown> | null)?._pass_number as number);
  const isChainScan = chainId && batchNumber && batchNumber > 1;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Hero — latest scan or start prompt */}
      <motion.div variants={item}>
        {latestJob && isLatestRunning ? (
          /* Running scan hero */
          <Card className="border-border/40">
            <CardContent className="py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3" role="status" aria-live="polite">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50">
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 text-muted-foreground animate-spin" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-foreground">Scan in progress</p>
                      {isChainScan && (
                        <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-border/40 font-mono">
                          Batch {batchNumber}
                        </Badge>
                      )}
                      {latestResult?._is_smart_scan && (
                        <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400">
                          Smart Scan
                        </Badge>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {latestResult?.files_scanned != null
                        ? latestResult.files_scanned < latestResult.files_total
                          ? `${latestResult.files_scanned} changed files processed (${latestResult.files_total - latestResult.files_scanned} unchanged skipped)`
                          : `${latestResult.files_scanned}/${latestResult.files_total} files processed`
                        : latestResult?._estimated_changed_files != null
                          ? `~${latestResult._estimated_changed_files} changed files to process (${latestResult._estimated_files} total)`
                          : "Initializing..."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigateToScan(chainId ?? latestJob.id)}>
                    View Live
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await cancelScanJob(latestJob.id);
                        setIsScanning(false);
                        addNotification({
                          type: "info",
                          title: "Scan cancelled",
                          message: "The scan has been stopped.",
                        });
                        const data = await getScanJobs(project.id);
                        setJobs(data);
                      } catch (err) {
                        addNotification({
                          type: "error",
                          title: "Cancel failed",
                          message: err instanceof Error ? err.message : "Failed to cancel scan.",
                        });
                      }
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                    Stop
                  </Button>
                </div>
              </div>
              {/* Progress bar */}
              {latestResult?.files_total && latestResult.files_total > 0 && (
                <div className="mt-4 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-foreground/80 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((latestResult.files_scanned ?? 0) / latestResult.files_total) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Start scan prompt */
          <Card className="border-border/40">
            <CardContent className="py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50">
                    <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">Code Scanner</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Scan your codebase to auto-generate context entries from source code.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowScanModal(true)}
                  disabled={isScanning || !project.repo_name}
                >
                  {isScanning ? (
                    <>
                      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-3.5" />
                      New Scan
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Quick stats */}
      {totalScans > 0 && (
        <motion.div variants={item} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          {[
            { label: "Scans", value: String(totalScans), icon: Radar01Icon },
            { label: "Files", value: String(totalFiles), icon: File01Icon },
            { label: "Features", value: String(totalFeatures), icon: Layers01Icon },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <HugeiconsIcon icon={stat.icon} strokeWidth={2} className="size-3.5 text-muted-foreground/60" />
              <span className="font-semibold tabular-nums text-foreground">{stat.value}</span>
              <span className="text-muted-foreground/60">{stat.label}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Scan History */}
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
                Ignore Patterns
              </CardTitle>
            </div>
            <CardDescription className="text-[12px]">
              Paths, folders, or glob patterns to skip during scans — one per line.
              You can also add a <code className="font-mono bg-muted px-1 rounded">.rembignore</code> file to your repo root.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={ignorePatterns}
              onChange={(e) => setIgnorePatterns(e.target.value)}
              placeholder={"__tests__\n*.stories.tsx\nsrc/generated\npublic/"}
              className="font-mono text-[12px] resize-none h-28 bg-muted/30"
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Supports path prefixes and globs: <code className="font-mono">*.generated.ts</code>, <code className="font-mono">**/*.stories.tsx</code>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px] gap-1.5"
                onClick={handleSaveIgnorePatterns}
                disabled={isSavingPatterns}
              >
                {isSavingPatterns ? (
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3 animate-spin" />
                ) : (
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-3" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Scan History */}
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-[14px]">
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
                Scan History
              </CardTitle>
              {!isLatestRunning && totalScans > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => setShowScanModal(true)}
                  disabled={isScanning || !project.repo_name}
                >
                  <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-3" />
                  New Scan
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-10 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
                  <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
                </div>
                <p className="text-[13px] font-medium text-foreground mb-1">No scans yet</p>
                <p className="text-xs text-muted-foreground">
                  Run your first scan to start generating context.
                </p>
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-border/40">
                {jobs.map((job, index) => {
                  const badge = statusBadge(job.status);
                  const result = job.result as Record<string, number> | null;
                  const jobDuration = job.started_at && job.finished_at
                    ? new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()
                    : null;

                  return (
                    <motion.div
                      key={job.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 + index * 0.04 }}
                      className="flex items-center gap-3 sm:gap-4 py-3.5 cursor-pointer hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors group"
                      onClick={() => navigateToScan(job.id)}
                    >
                      {/* Status dot */}
                      <div className="flex size-2.5 shrink-0">
                        <span className={`size-2.5 rounded-full ${badge.dotClass}`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Badge
                            variant={badge.variant}
                            className="h-4 text-[9px] px-1.5"
                          >
                            {badge.label}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {job.triggered_by === "manual" ? "Manual" : job.triggered_by === "webhook" ? "Push" : job.triggered_by}
                          </span>
                          {result && (result.files_scanned ?? 0) < (result.files_total ?? 0) && (result.files_total ?? 0) > 0 && (
                            <Badge variant="outline" className="h-3.5 text-[8px] px-1 border-blue-500/30 text-blue-600 dark:text-blue-400">
                              Smart
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          {result
                            ? (result.files_scanned ?? 0) < (result.files_total ?? 0)
                              ? `${result.files_scanned ?? 0} changed · ${result.features_created ?? 0} features · ${(result.files_total ?? 0) - (result.files_scanned ?? 0)} skipped`
                              : `${result.files_scanned ?? 0} files · ${result.features_created ?? 0} features · ${result.entries_created ?? 0} entries`
                            : job.status === "running" ? "Scanning in progress..." : "Queued..."}
                        </p>
                      </div>

                      {/* Duration + time */}
                      <div className="text-right shrink-0">
                        {jobDuration != null && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {formatDuration(jobDuration)}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50">
                          {timeAgo(job.created_at)}
                        </p>
                      </div>

                      {/* Arrow */}
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Scan complete modal with memory generation */}
      <NewScanModal
        open={showScanModal}
        onOpenChange={setShowScanModal}
        projectName={project.name}
        onConfirm={handleScanConfirm}
      />
    </motion.div>
  );
}
