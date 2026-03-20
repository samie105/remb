"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  ArrowDown01Icon,
  Search01Icon,
  CheckmarkCircle01Icon,
  PlusSignIcon,
  Cancel01Icon,
  Loading03Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectStore } from "@/lib/project-store";
import { addNotification } from "@/components/dashboard/notification-center";
import { createProject, type ProjectWithCounts } from "@/lib/project-actions";
import { getGitHubRepos } from "@/lib/github-actions";
import type { GitHubRepo } from "@/lib/github";

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

/* ─── Import Repo List (inside dialog) ─── */
function ImportRepoList({
  existingRepos,
  onImported,
}: {
  existingRepos: string[];
  onImported: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<Set<string>>(new Set());
  const [repos, setRepos] = React.useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    getGitHubRepos()
      .then((data) => {
        if (!cancelled) {
          setRepos(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Failed to load repositories. Please try again.");
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const isAlreadyLinked = (fullName: string) =>
    existingRepos.includes(fullName) || imported.has(fullName);

  async function handleImport(repo: GitHubRepo) {
    setImporting(repo.full_name);
    try {
      await createProject({
        name: repo.name,
        description: repo.description ?? undefined,
        repoName: repo.full_name,
        repoUrl: `https://github.com/${repo.full_name}`,
        language: repo.language ?? undefined,
        branch: repo.default_branch,
      });
      setImported((prev) => new Set(prev).add(repo.full_name));
      addNotification({
        type: "success",
        title: "Project imported",
        message: `${repo.name} has been imported successfully.`,
      });
      onImported();
    } catch {
      addNotification({
        type: "error",
        title: "Import failed",
        message: `Failed to import ${repo.name}. Please try again.`,
      });
    } finally {
      setImporting(null);
    }
  }

  return (
    <>
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
        />
        <Input
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8"
        />
      </div>
      <div className="max-h-72 overflow-y-auto -mx-2 px-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
            <span className="text-[13px]">Loading repositories...</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((repo) => {
              const linked = isAlreadyLinked(repo.full_name);
              const isCurrentlyImporting = importing === repo.full_name;
              return (
                <motion.div
                  key={repo.full_name}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-foreground truncate">{repo.name}</span>
                      {repo.private && (
                        <Badge variant="outline" className="h-4 text-[9px] px-1.5">Private</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {repo.description ?? "No description"}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {linked ? (
                      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2} className="size-3.5" />
                        <span className="text-[11px] font-medium">Linked</span>
                      </div>
                    ) : isCurrentlyImporting ? (
                      <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="outline" size="xs" onClick={() => handleImport(repo)} className="gap-1">
                        <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3" />
                        Import
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {!isLoading && loadError && (
          <div className="py-8 text-center space-y-2">
            <p className="text-[13px] text-destructive">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                setLoadError(null);
                getGitHubRepos()
                  .then((data) => {
                    setRepos(data);
                    setIsLoading(false);
                  })
                  .catch(() => {
                    setLoadError("Failed to load repositories. Please try again.");
                    setIsLoading(false);
                  });
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {!isLoading && !loadError && filtered.length === 0 && (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            No repositories match your search.
          </div>
        )}
      </div>
    </>
  );
}

const STORAGE_KEY = "remb:active-project";

/** Static routes that are NOT dynamic project routes */
const STATIC_DASHBOARD_ROUTES = new Set(["settings", "memory", "api", "cli", "docs", "mcp", "auth"]);

/** Routes that exist both as /dashboard/X and /dashboard/[slug]/X */
const PROJECT_AWARE_STATIC_ROUTES = new Set(["settings", "memory"]);

/** Extract project slug from pathname like /dashboard/[slug] or /dashboard/[slug]/visualizer */
function extractProjectSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0] === "dashboard" && !STATIC_DASHBOARD_ROUTES.has(segments[1])) {
    return segments[1];
  }
  return null;
}

/** Get the sub-path after slug, e.g. /dashboard/myproj/visualizer → /visualizer */
function getSubPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // Project route: /dashboard/[slug]/settings/account → /settings/account
  if (segments.length >= 3 && segments[0] === "dashboard" && !STATIC_DASHBOARD_ROUTES.has(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  // Project-aware static route: /dashboard/settings/account → /settings/account
  if (segments.length >= 2 && segments[0] === "dashboard" && PROJECT_AWARE_STATIC_ROUTES.has(segments[1])) {
    return "/" + segments.slice(1).join("/");
  }
  return "";
}

/* ─── Project Switcher ─── */
export function ProjectSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { projects } = useProjectStore();

  // Derive active project from URL path
  const activeSlugFromPath = extractProjectSlug(pathname);

  const [activeProjectSlug, setActiveProjectSlugState] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    // Prefer path-based slug, fallback to localStorage
    return activeSlugFromPath ?? localStorage.getItem(STORAGE_KEY) ?? null;
  });

  // Sync slug from pathname changes (back/forward nav, Link clicks)
  React.useEffect(() => {
    if (activeSlugFromPath && activeSlugFromPath !== activeProjectSlug) {
      setActiveProjectSlugState(activeSlugFromPath);
    } else if (!activeSlugFromPath && pathname === "/dashboard") {
      // On bare /dashboard, don't force clear — keep localStorage
    }
  }, [pathname, activeSlugFromPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProject = projects.find((p) => p.slug === activeProjectSlug) ?? null;
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);

  // Restore from localStorage on mount if on /dashboard with no project
  React.useEffect(() => {
    if (!activeSlugFromPath && pathname === "/dashboard" && projects.length > 0) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && projects.some((p) => p.slug === stored)) {
          setActiveProjectSlugState(stored);
          router.replace(`/dashboard/${stored}`);
        }
      } catch { /* SSR / localStorage unavailable */ }
    }
  }, [projects, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage whenever active project changes
  React.useEffect(() => {
    try {
      if (activeProjectSlug) {
        localStorage.setItem(STORAGE_KEY, activeProjectSlug);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* SSR / localStorage unavailable */ }
  }, [activeProjectSlug]);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const existingRepos = projects
    .filter((p) => p.repo_name)
    .map((p) => p.repo_name as string);

  function handleSelect(project: ProjectWithCounts) {
    setActiveProjectSlugState(project.slug);
    const subPath = getSubPath(pathname);
    const tab = searchParams.get("tab");
    const qs = tab ? `?tab=${tab}` : "";
    router.push(`/dashboard/${project.slug}${subPath}${qs}`);
    setOpen(false);
    setSearch("");
  }

  function handleClear() {
    setActiveProjectSlugState(null);
    const subPath = getSubPath(pathname);
    const tab = searchParams.get("tab");
    const qs = tab ? `?tab=${tab}` : "";
    router.push(`/dashboard${subPath}${qs}`);
    setOpen(false);
    setSearch("");
  }

  function handleImported() {
    router.refresh();
    setImportDialogOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className="h-7 gap-2 px-2.5 text-[13px] font-medium text-foreground hover:bg-muted/60"
          >
            {activeProject ? (
              <>
                <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold">
                  {activeProject.name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-30 truncate">{activeProject.name}</span>
                {activeProject.language && (
                  <span className={cn("size-1.5 rounded-full", langColor(activeProject.language))} />
                )}
              </>
            ) : (
              <>
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Select project</span>
              </>
            )}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-3 text-muted-foreground/60"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
          {/* Search */}
          <div className="p-2 border-b border-border/40">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
              />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-7 text-[13px]"
                autoFocus
              />
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length > 0 ? (
              filtered.map((project) => {
                const isActive = project.slug === activeProjectSlug;
                return (
                  <button
                    key={project.id}
                    onClick={() => handleSelect(project)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[11px] font-semibold">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate">
                          {project.name}
                        </span>
                        {project.language && (
                          <span className={cn("size-1.5 rounded-full", langColor(project.language))} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{project.feature_count} features</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>{timeAgo(project.updated_at)}</span>
                      </div>
                    </div>
                    {isActive && (
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        strokeWidth={2}
                        className="size-3.5 shrink-0 text-foreground"
                      />
                    )}
                  </button>
                );
              })
            ) : projects.length > 0 ? (
              <div className="py-6 text-center text-[13px] text-muted-foreground">
                No projects match &quot;{search}&quot;
              </div>
            ) : (
              <div className="py-6 text-center">
                <HugeiconsIcon
                  icon={Folder01Icon}
                  strokeWidth={1.5}
                  className="mx-auto size-8 text-muted-foreground/40 mb-2"
                />
                <p className="text-[13px] font-medium text-foreground mb-1">No projects yet</p>
                <p className="text-[11px] text-muted-foreground mb-3">Import a repository to get started.</p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="p-1.5 border-t border-border/40 flex gap-1">
            {activeProject && (
              <Button
                variant="ghost"
                size="xs"
                className="flex-1 gap-1 text-muted-foreground text-[11px]"
                onClick={handleClear}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
                Clear selection
              </Button>
            )}
            <Button
              variant="default"
              size="xs"
              className="flex-1 gap-1 text-[11px]"
              onClick={() => {
                setOpen(false);
                setImportDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
              Import project
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Import dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import from GitHub</DialogTitle>
            <DialogDescription>
              Select a repository to import into Remb.
            </DialogDescription>
          </DialogHeader>
          <ImportRepoList existingRepos={existingRepos} onImported={handleImported} />
        </DialogContent>
      </Dialog>
    </>
  );
}
