"use client";

import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  Layers01Icon,
  File01Icon,
  Radar01Icon,
} from "@hugeicons/core-free-icons";
import { Card, CardContent } from "@/components/ui/card";
import { item } from "./shared";
import type { ProjectWithCounts } from "@/lib/project-actions";
import type { ScanJobRow } from "@/lib/supabase/types";

interface HomeStatsProps {
  projects: ProjectWithCounts[];
  recentScans: ScanJobRow[];
}

export function HomeStats({ projects, recentScans }: HomeStatsProps) {
  const totalFeatures = projects.reduce((a, p) => a + p.feature_count, 0);
  const totalEntries = projects.reduce((a, p) => a + p.entry_count, 0);
  const totalScans = recentScans.length;
  const completedScans = recentScans.filter((s) => s.status === "done").length;

  const stats = [
    {
      label: "Projects",
      value: projects.length,
      sub: `${projects.filter((p) => p.status === "active").length} active`,
      icon: Folder01Icon,
    },
    {
      label: "Features",
      value: totalFeatures,
      sub: "across all projects",
      icon: Layers01Icon,
    },
    {
      label: "Context Entries",
      value: totalEntries >= 1000 ? `${(totalEntries / 1000).toFixed(1)}k` : totalEntries,
      sub: "total indexed",
      icon: File01Icon,
    },
    {
      label: "Scans",
      value: totalScans,
      sub: totalScans === 0 ? "run your first scan" : `${completedScans} completed`,
      icon: Radar01Icon,
    },
  ];

  return (
    <motion.div
      variants={item}
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/40">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/60">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground leading-none">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {stat.sub}
                </p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/50">
                <HugeiconsIcon
                  icon={stat.icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </motion.div>
  );
}
