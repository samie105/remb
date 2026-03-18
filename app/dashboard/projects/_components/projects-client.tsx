"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  Clock01Icon,
  Search01Icon,
  FilterHorizontalIcon,
  MoreHorizontalIcon,
  GithubIcon,
  GitBranchIcon,
  CheckmarkCircle01Icon,
  Download01Icon,
  RefreshIcon,
  Folder01Icon,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { disconnectGitHub, getGitHubRepos } from "@/lib/github-actions";
import { createProject, deleteProject, type ProjectWithCounts } from "@/lib/project-actions";
import { addNotification } from "@/components/dashboard/notification-center";
import type { GitHubRepo } from "@/lib/github";

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

/* ─── language dot color ─── */
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

/* ─── status badge variant ─── */
function statusVariant(s: string) {
  switch (s) {
    case "active":
      return "secondary" as const;
    case "paused":
      return "outline" as const;
    case "scanning":
      return "secondary" as const;
    default:
      return "secondary" as const;
  }
}

/* ─── relative time helper ─── */
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

/* ─── Import repo list (fetches real repos from GitHub) ─── */
function ImportRepoList({ existingRepos }: { existingRepos: string[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState<string | null>(null);
  const [imported, setImported] = React.useState<Set<string>>(new Set());
  const [repos, setRepos] = React.useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getGitHubRepos().then((data) => {
      if (!cancelled) {
        setRepos(data);
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
      router.refresh();
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
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-4 animate-spin"
            />
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
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      strokeWidth={2}
                      className="size-3.5 text-muted-foreground"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {repo.name}
                      </span>
                      {repo.private && (
                        <Badge variant="outline" className="h-4 text-[9px] px-1.5">
                          Private
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {repo.description ?? "No description"}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {linked ? (
                      <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <HugeiconsIcon
                          icon={CheckmarkCircle01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        <span className="text-[11px] font-medium">Linked</span>
                      </div>
                    ) : isCurrentlyImporting ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="size-3.5 animate-spin text-muted-foreground"
                      />
                    ) : (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleImport(repo)}
                        className="gap-1"
                      >
                        <HugeiconsIcon
                          icon={Download01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        Import
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            No repositories match your search.
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Props ─── */
interface ProjectsClientProps {
  account: { username: string; avatarUrl: string };
  initialProjects: ProjectWithCounts[];
}

/* ─── Page ─── */
export function ProjectsClient({ account, initialProjects }: ProjectsClientProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  const filtered = initialProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const existingRepos = initialProjects
    .filter((p) => p.repo_name)
    .map((p) => p.repo_name as string);

  async function handleDisconnect() {
    await disconnectGitHub();
    router.refresh();
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      addNotification({
        type: "info",
        title: "Project removed",
        message: "The project has been removed from your workspace.",
      });
      router.refresh();
    } catch {
      addNotification({
        type: "error",
        title: "Delete failed",
        message: "Failed to remove the project. Please try again.",
      });
    }
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      {/* Header */}
      <motion.div
        variants={item}
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
            Projects
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Manage your projects and their context entries.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 w-fit">
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />
              Import Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Import from GitHub</DialogTitle>
              <DialogDescription>
                Select a repository to import into Remb.
              </DialogDescription>
            </DialogHeader>
            <ImportRepoList existingRepos={existingRepos} />
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* GitHub status banner */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-md bg-blue-500/10">
              <HugeiconsIcon
                icon={GithubIcon}
                strokeWidth={2}
                className="size-3.5 text-blue-600 dark:text-blue-400"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-foreground">
                GitHub connected
              </span>
              <span className="text-[11px] text-muted-foreground">
                — {account.username}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground">
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3" />
              Sync
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        variants={item}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1 max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
          />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 w-fit">
          <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} className="size-3.5" />
          Filter
        </Button>
      </motion.div>

      {/* Projects grid */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {filtered.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05,
              ease: [0.25, 0.1, 0.25, 1],
            }}
          >
            <Link href={`/dashboard/projects/${project.slug}`}>
              <Card className="group cursor-pointer border-border/40 hover:border-border/80 transition-all duration-300 hover:shadow-sm">
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
                            {project.status === "scanning" ? (
                              <span className="flex items-center gap-1">
                                <span className="relative flex size-1.5">
                                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/40" />
                                  <span className="relative inline-flex size-1.5 rounded-full bg-foreground/60" />
                                </span>
                                scanning
                              </span>
                            ) : (
                              project.status
                            )}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.preventDefault()}
                        >
                          <HugeiconsIcon
                            icon={MoreHorizontalIcon}
                            strokeWidth={2}
                            className="size-4"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Scan now</DropdownMenuItem>
                        <DropdownMenuItem>Settings</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDelete(project.id);
                          }}
                        >
                          Remove project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            </Link>
          </motion.div>
        ))}

        {/* Import new card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: filtered.length * 0.05 }}
        >
          <Dialog>
            <DialogTrigger asChild>
              <Card className="group cursor-pointer border-dashed border-border/40 hover:border-border/80 transition-all duration-300 flex items-center justify-center min-h-45">
                <CardContent className="flex flex-col items-center gap-2 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted/30 group-hover:bg-muted/50 transition-colors">
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      className="size-5"
                    />
                  </div>
                  <span className="text-xs font-medium">Import Project</span>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Import from GitHub</DialogTitle>
                <DialogDescription>Select a repository to import.</DialogDescription>
              </DialogHeader>
              <ImportRepoList existingRepos={existingRepos} />
            </DialogContent>
          </Dialog>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
