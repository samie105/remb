"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Radar01Icon,
  GitBranchIcon,
  GithubIcon,
  Settings01Icon,
  Layers01Icon,
  File01Icon,
  Activity01Icon,
  CheckmarkCircle01Icon,
  RefreshIcon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addNotification } from "@/components/dashboard/notification-center";
import { deleteProject, clearProjectEntries, disconnectRepository } from "@/lib/project-actions";
import { createScanJob, checkForChanges, cancelScanJob, updateScanConfig } from "@/lib/scan-actions";
import type { ProjectWithCounts, FeatureWithCounts } from "@/lib/project-actions";
import { FeatureGroups } from "@/components/dashboard/feature-groups";
import { ScannerSection } from "@/components/dashboard/scanner-section";
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

/* ─── animation variants ─── */
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

/* ─── helpers ─── */
function langColor(lang: string | null) {
  switch (lang) {
    case "TypeScript": return "bg-blue-500";
    case "Go": return "bg-cyan-500";
    case "Python": return "bg-yellow-500";
    case "Rust": return "bg-orange-500";
    case "JavaScript": return "bg-amber-400";
    default: return "bg-muted-foreground";
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

/* ─── Props ─── */
interface ProjectOverviewProps {
  project: ProjectWithCounts;
  features: FeatureWithCounts[];
}

/* ─── Component ─── */
export function ProjectOverview({ project, features }: ProjectOverviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isScanning, setIsScanning] = React.useState(project.status === "scanning");
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [scanOnPush, setScanOnPush] = React.useState(project.scan_on_push ?? false);
  const [isSavingConfig, setIsSavingConfig] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<"delete" | "clear" | "disconnect" | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const totalEntries = features.reduce((a, f) => a + f.entry_count, 0);

  const tabFromUrl = searchParams.get("tab");
  const validTabs = ["features", "scanner", "config", "danger"];
  const [activeTab, setActiveTab] = React.useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "features"
  );

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "features") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function handleScan() {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const { hasChanges } = await checkForChanges(project.id);
      if (!hasChanges) {
        setIsScanning(false);
        addNotification({
          type: "info",
          title: "No changes detected",
          message: "Your codebase is up to date — no new commits since the last scan.",
        });
        return;
      }

      await createScanJob(project.id);
      addNotification({
        type: "success",
        title: "Scan started",
        message: `Scanning ${project.repo_name ?? project.name}...`,
      });
      handleTabChange("scanner");
    } catch (err) {
      setIsScanning(false);
      addNotification({
        type: "error",
        title: "Scan failed",
        message: err instanceof Error ? err.message : "Failed to start scan.",
      });
    }
  }

  async function handleConfirmedAction() {
    if (!confirmAction) return;
    setIsDeleting(true);
    try {
      switch (confirmAction) {
        case "delete":
          await deleteProject(project.id);
          addNotification({ type: "info", title: "Project deleted", message: `${project.name} has been permanently deleted.` });
          setConfirmAction(null);
          router.push("/dashboard");
          router.refresh();
          return;
        case "clear":
          await clearProjectEntries(project.id);
          addNotification({ type: "info", title: "Entries cleared", message: `All context entries for ${project.name} have been removed.` });
          break;
        case "disconnect":
          await disconnectRepository(project.id);
          addNotification({ type: "info", title: "Repository disconnected", message: `${project.repo_name} has been unlinked.` });
          break;
      }
      setConfirmAction(null);
      router.refresh();
    } catch {
      addNotification({ type: "error", title: "Action failed", message: "Something went wrong. Please try again." });
    } finally {
      setIsDeleting(false);
    }
  }

  const featureStats = [
    { label: "Features", value: features.length, icon: Layers01Icon },
    { label: "Entries", value: totalEntries, icon: File01Icon },
    { label: "Avg/Feature", value: features.length > 0 ? Math.round(totalEntries / features.length) : 0, icon: Activity01Icon },
    { label: "Last Updated", value: timeAgo(project.updated_at), icon: Clock01Icon },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      {/* ─── Header ─── */}
      <motion.div variants={item}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
              <span className="text-base font-bold">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {project.name}
                </h1>
                {project.status === "scanning" && (
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/40" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
                    </span>
                    <span className="text-[11px] text-muted-foreground">scanning</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {project.description ?? "No description"}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/60">
                {project.repo_name && (
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={GithubIcon} strokeWidth={2} className="size-3" />
                    <span className="font-mono">{project.repo_name}</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-3" />
                  <span className="font-mono">{project.branch ?? "main"}</span>
                </span>
                {project.language && (
                  <span className="flex items-center gap-1">
                    <span className={`size-1.5 rounded-full ${langColor(project.language)}`} />
                    {project.language}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── Tabs ─── */}
      <motion.div variants={item}>
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
          <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-background border-b border-border/40 backdrop-blur-xl sm:-mx-6 sm:px-6">
            <TabsList variant="line">
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="scanner">Scanner</TabsTrigger>
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="danger">Danger Zone</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── Features tab ─── */}
          <TabsContent value="features" className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {featureStats.map((stat) => (
                <Card key={stat.label} className="border-border/40">
                  <CardContent className="pt-4 pb-4 flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                      <HugeiconsIcon
                        icon={stat.icon}
                        strokeWidth={2}
                        className="size-3.5 text-muted-foreground"
                      />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold tabular-nums tracking-tight text-foreground leading-none">
                        {stat.value}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <FeatureGroups projectId={project.id} />
          </TabsContent>

          {/* ─── Scanner tab ─── */}
          <TabsContent value="scanner" className="space-y-5">
            {/* Scan controls — only shown on Scanner tab */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleScan}
                disabled={isScanning || !project.repo_name}
              >
                {isScanning ? (
                  <>
                    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-3" />
                    Scan Now
                  </>
                )}
              </Button>
              {isScanning && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={async () => {
                    setIsCancelling(true);
                    try {
                      // Find the active scan from the scanner section polling
                      const { getScanJobs } = await import("@/lib/scan-actions");
                      const jobs = await getScanJobs(project.id);
                      const running = jobs.find((j) => j.status === "running" || j.status === "queued");
                      if (running) {
                        await cancelScanJob(running.id);
                        setIsScanning(false);
                        addNotification({
                          type: "info",
                          title: "Scan cancelled",
                          message: "The scan has been stopped.",
                        });
                        router.refresh();
                      }
                    } catch (err) {
                      addNotification({
                        type: "error",
                        title: "Cancel failed",
                        message: err instanceof Error ? err.message : "Failed to cancel scan.",
                      });
                    } finally {
                      setIsCancelling(false);
                    }
                  }}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <>
                      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3 animate-spin" />
                      Stopping...
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                      Stop Scan
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs ml-auto"
                onClick={() => handleTabChange("config")}
              >
                <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} className="size-3" />
                Settings
              </Button>
            </div>

            <ScannerSection project={project} />
          </TabsContent>

          {/* ─── Configuration tab ─── */}
          <TabsContent value="config" className="space-y-5">
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-[14px]">Scanning</CardTitle>
                <CardDescription className="text-[12px]">
                  Configure how Remb scans this project.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-[13px]">Scan on push</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Trigger a scan when code is pushed to the repo
                    </p>
                  </div>
                  <Switch
                    checked={scanOnPush}
                    onCheckedChange={async (checked) => {
                      setScanOnPush(checked);
                      setIsSavingConfig(true);
                      try {
                        const result = await updateScanConfig(project.id, { scanOnPush: checked });
                        addNotification({
                          type: "success",
                          title: checked ? "Scan on push enabled" : "Scan on push disabled",
                          message: checked
                            ? `Add a GitHub webhook pointing to ${result.webhookUrl} to activate.`
                            : "Auto-scanning on push has been turned off.",
                        });
                      } catch (err) {
                        setScanOnPush(!checked);
                        addNotification({
                          type: "error",
                          title: "Failed to update",
                          message: err instanceof Error ? err.message : "Could not save scan config.",
                        });
                      } finally {
                        setIsSavingConfig(false);
                      }
                    }}
                    disabled={isSavingConfig}
                  />
                </div>
              </CardContent>
            </Card>

            {project.repo_name && (
              <Card className="border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[14px]">Repository</CardTitle>
                  <CardDescription className="text-[12px]">
                    Manage the connected GitHub repository.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
                        <HugeiconsIcon icon={GithubIcon} strokeWidth={2} className="size-4 text-foreground" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground font-mono">
                          {project.repo_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} className="size-2.5" />
                          {project.branch ?? "main"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        strokeWidth={2}
                        className="size-3.5 text-emerald-500"
                      />
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Connected
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Danger zone tab ─── */}
          <TabsContent value="danger" className="space-y-4">
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-[14px] text-destructive">
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-[12px]">
                  These actions are irreversible. Please be certain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Clear all context entries
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Remove all scanned context for this project.
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setConfirmAction("clear")}>
                    Clear Entries
                  </Button>
                </div>
                {project.repo_name && (
                  <div className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-medium text-foreground">
                        Disconnect repository
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Unlink the GitHub repository from this project.
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setConfirmAction("disconnect")}>
                      Disconnect
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Delete project
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Permanently delete this project and all its data.
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setConfirmAction("delete")}>
                    Delete Project
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Confirmation dialog for all danger zone actions */}
            <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {confirmAction === "delete" && `Delete ${project.name}?`}
                    {confirmAction === "clear" && "Clear all context entries?"}
                    {confirmAction === "disconnect" && "Disconnect repository?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirmAction === "delete" && "This will permanently delete this project and all its data including features, context entries, memories, and scan history. This action cannot be undone."}
                    {confirmAction === "clear" && `This will remove all ${totalEntries} scanned context entries for ${project.name}. Features will remain but their context will be empty. This action cannot be undone.`}
                    {confirmAction === "disconnect" && `This will unlink ${project.repo_name} from this project. You can reconnect it later, but scan-on-push webhooks will need to be reconfigured.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleConfirmedAction}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "Processing..." : confirmAction === "delete" ? "Delete Project" : confirmAction === "clear" ? "Clear Entries" : "Disconnect"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
