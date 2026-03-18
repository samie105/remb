"use client";

import { motion } from "framer-motion";
import { HomeHeader } from "@/components/dashboard/home/home-header";
import { HomeStats } from "@/components/dashboard/home/home-stats";
import { HomeTimeline } from "@/components/dashboard/home/home-timeline";
import { HomeProjects } from "@/components/dashboard/home/home-projects";
import { HomeRecentScans } from "@/components/dashboard/home/home-recent-scans";
import { HomeQuickActions } from "@/components/dashboard/home/home-quick-actions";
import { container } from "@/components/dashboard/home/shared";
import type { ProjectWithCounts } from "@/lib/project-actions";
import type { ScanJobRow } from "@/lib/supabase/types";

interface DashboardContentProps {
  user: { name: string; login: string };
  projects: ProjectWithCounts[];
  recentScans: ScanJobRow[];
}

export function DashboardContent({ user, projects, recentScans }: DashboardContentProps) {
  const projectMap = new Map(
    projects.map((p) => [p.id, { name: p.name, slug: p.slug }])
  );

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      <HomeHeader userName={user.name} />

      <HomeStats projects={projects} recentScans={recentScans} />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
        <HomeTimeline projects={projects} />
        <HomeProjects projects={projects} />
      </div>

      <HomeRecentScans scans={recentScans} projectMap={projectMap} />

      <HomeQuickActions />
    </motion.div>
  );
}
