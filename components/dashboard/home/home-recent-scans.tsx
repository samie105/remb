"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Radar01Icon,
  Clock01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { item, timeAgo } from "./shared";
import type { ScanJobRow } from "@/lib/supabase/types";

interface HomeRecentScansProps {
  scans: ScanJobRow[];
  projectMap: Map<string, { name: string; slug: string }>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function statusConfig(status: string) {
  switch (status) {
    case "done":
      return { icon: CheckmarkCircle01Icon, dotClass: "bg-emerald-500", label: "Completed" };
    case "running":
      return { icon: Loading03Icon, dotClass: "bg-blue-500 animate-pulse", label: "Running" };
    case "failed":
      return { icon: Cancel01Icon, dotClass: "bg-red-500", label: "Failed" };
    default:
      return { icon: Clock01Icon, dotClass: "bg-muted-foreground animate-pulse", label: "Queued" };
  }
}

export function HomeRecentScans({ scans, projectMap }: HomeRecentScansProps) {
  if (scans.length === 0) {
    return (
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <HugeiconsIcon icon={Radar01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              Recent Scans
            </CardTitle>
            <CardDescription className="text-[12px]">
              No scans yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50">
                <HugeiconsIcon icon={Radar01Icon} strokeWidth={1.5} className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-[13px] text-muted-foreground">
                Scan a project to see results here.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={item}>
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <HugeiconsIcon
                icon={Radar01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              Recent Scans
            </CardTitle>
            <Badge variant="secondary" className="h-5 text-[10px] px-2">
              {scans.length}
            </Badge>
          </div>
          <CardDescription className="text-[12px]">
            Latest scan activity across all projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
            {scans.slice(0, 5).map((scan) => {
              const project = projectMap.get(scan.project_id);
              const config = statusConfig(scan.status);
              const result = scan.result as Record<string, number> | null;
              const duration = scan.started_at && scan.finished_at
                ? new Date(scan.finished_at).getTime() - new Date(scan.started_at).getTime()
                : null;

              return (
                <Link
                  key={scan.id}
                  href={project ? `/dashboard/${project.slug}/scan/${scan.id}` : "#"}
                  className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-200 hover:bg-muted/30"
                >
                  <div className="flex size-2.5 shrink-0">
                    <span className={`size-2.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
                    <span className="sr-only">{config.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-medium text-foreground truncate">
                        {project?.name ?? "Unknown Project"}
                      </h3>
                      <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-border/40">
                        {config.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {result
                        ? `${result.files_scanned ?? 0} files · ${result.features_created ?? 0} features`
                        : scan.status === "running" ? "Scanning in progress..." : "Queued..."}
                    </p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    {duration != null && (
                      <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                        {formatDuration(duration)}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50">
                      {timeAgo(scan.created_at)}
                    </p>
                  </div>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
