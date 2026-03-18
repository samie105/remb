"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  Search01Icon,
  Clock01Icon,
  GitBranchIcon,
  PlusSignIcon,
  ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";
import { useRouter, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/lib/project-store";
import type { ProjectWithCounts } from "@/lib/project-actions";

/* ─── helpers ─── */
function langColor(lang: string | null) {
  switch (lang) {
    case "TypeScript":
      return "bg-blue-500";
    case "Go":
      return "bg-cyan-500";
    case "Python":
      return "bg-yellow-500";
    case "Rust":
      return "bg-orange-500";
    case "JavaScript":
      return "bg-amber-400";
    default:
      return "bg-muted-foreground";
  }
}

function statusVariant(s: string) {
  switch (s) {
    case "active":
      return "secondary" as const;
    case "paused":
      return "outline" as const;
    default:
      return "secondary" as const;
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

/* ─── Component ─── */
export function ProjectSelectionView() {
  const { projects } = useProjectStore();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.repo_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleSelect(project: ProjectWithCounts) {
    router.push(`${pathname}?project=${encodeURIComponent(project.slug)}`);
  }

  if (projects.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
      >
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/40 mb-4">
          <HugeiconsIcon
            icon={Folder01Icon}
            strokeWidth={1.5}
            className="size-8 text-muted-foreground/50"
          />
        </div>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground mb-1">
          No projects yet
        </h2>
        <p className="text-[13px] text-muted-foreground mb-6 max-w-sm">
          Import a repository from GitHub to start managing your project&apos;s context
          and features.
        </p>
        <Button size="sm" className="gap-1.5">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />
            Import your first project
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">
          Select a project
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Choose a project to view its dashboard, features, and context entries.
        </p>
      </motion.div>

      {/* Search + filter */}
      <motion.div
        variants={item}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1 max-w-md">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
          />
          <Input
            placeholder="Search projects by name, description, or repo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
            autoFocus
          />
        </div>
        <div className="flex gap-1.5">
          {["active", "paused", "scanning"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "secondary" : "outline"}
              size="xs"
              className="capitalize text-[11px]"
              onClick={() =>
                setStatusFilter(statusFilter === status ? null : status)
              }
            >
              {status}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Projects grid */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((project, index) => (
            <motion.div
              key={project.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: 0.3,
                delay: index * 0.04,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <Card
                className="group cursor-pointer border-border/40 hover:border-border/80 transition-all duration-300 hover:shadow-sm"
                onClick={() => handleSelect(project)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground transition-all duration-300 group-hover:bg-muted">
                        <span className="text-sm font-semibold">
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-[14px] tracking-[-0.01em]">
                          {project.name}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge
                            variant={statusVariant(project.status)}
                            className="h-4 text-[9px] px-1.5"
                          >
                            {project.status}
                          </Badge>
                          {project.language && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                              <span
                                className={`size-1.5 rounded-full ${langColor(project.language)}`}
                              />
                              {project.language}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      className="size-4 text-muted-foreground/40 group-hover:text-foreground transition-colors"
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <CardDescription className="text-xs line-clamp-2 mb-4">
                    {project.description ?? "No description"}
                  </CardDescription>
                  <Separator className="mb-3" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span>
                        <strong className="text-foreground font-medium">
                          {project.feature_count}
                        </strong>{" "}
                        features
                      </span>
                      <span>
                        <strong className="text-foreground font-medium">
                          {project.entry_count}
                        </strong>{" "}
                        entries
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <HugeiconsIcon
                        icon={Clock01Icon}
                        strokeWidth={2}
                        className="size-2.5"
                      />
                      {timeAgo(project.updated_at)}
                    </span>
                  </div>
                  {project.repo_name && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                      <HugeiconsIcon
                        icon={GitBranchIcon}
                        strokeWidth={2}
                        className="size-2.5"
                      />
                      <span className="font-mono">{project.repo_name}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="font-mono">{project.branch}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <motion.div
          variants={item}
          className="py-12 text-center"
        >
          <p className="text-[13px] text-muted-foreground">
            No projects match your search.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
