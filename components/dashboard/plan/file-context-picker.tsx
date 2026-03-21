"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Search01Icon,
  File02Icon,
  Folder01Icon,
  Loading03Icon,
  CheckmarkCircle02Icon,
  ArrowDown01Icon,
  CodeIcon,
  GlobalIcon,
  Settings01Icon,
  PaintBrushIcon,
  Link04Icon,
  Database01Icon,
  PlugIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getProjectsForPicker,
  getProjectFiles,
  type ProjectFileInfo,
} from "@/lib/plan-actions";

/* ─── public types ─── */

export interface ContextFile {
  path: string;
  projectId: string;
  projectName: string;
}

/* ─── file categorization ─── */

type FileCategory =
  | "all"
  | "page"
  | "component"
  | "api"
  | "hook"
  | "lib"
  | "config"
  | "style"
  | "migration"
  | "other";

interface CategorizedFile {
  path: string;
  fileName: string;
  directory: string;
  category: FileCategory;
}

const CATEGORY_META: Record<
  FileCategory,
  { label: string; icon: typeof File02Icon; color: string }
> = {
  all: { label: "All", icon: File02Icon, color: "text-muted-foreground" },
  page: { label: "Pages", icon: GlobalIcon, color: "text-blue-600 dark:text-blue-400" },
  component: { label: "Components", icon: CodeIcon, color: "text-purple-600 dark:text-purple-400" },
  api: { label: "API", icon: PlugIcon, color: "text-emerald-600 dark:text-emerald-400" },
  hook: { label: "Hooks", icon: Link04Icon, color: "text-orange-600 dark:text-orange-400" },
  lib: { label: "Library", icon: Database01Icon, color: "text-cyan-600 dark:text-cyan-400" },
  config: { label: "Config", icon: Settings01Icon, color: "text-amber-600 dark:text-amber-400" },
  style: { label: "Styles", icon: PaintBrushIcon, color: "text-pink-600 dark:text-pink-400" },
  migration: { label: "SQL", icon: Database01Icon, color: "text-indigo-600 dark:text-indigo-400" },
  other: { label: "Other", icon: File02Icon, color: "text-muted-foreground" },
};

function categorizeFile(path: string): FileCategory {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];

  if (fileName === "route.ts" || fileName === "route.tsx" || parts.includes("api"))
    return "api";
  if (
    fileName === "page.tsx" ||
    fileName === "page.ts" ||
    fileName === "layout.tsx" ||
    fileName === "layout.ts"
  )
    return "page";
  if (fileName.startsWith("use") || parts.includes("hooks")) return "hook";
  if (parts.includes("components") || parts.includes("ui")) return "component";
  if (parts.includes("lib") || parts.includes("utils")) return "lib";
  if (fileName.endsWith(".css") || fileName.endsWith(".scss")) return "style";
  if (fileName.endsWith(".sql")) return "migration";
  if (
    fileName.endsWith(".json") ||
    fileName.endsWith(".config.ts") ||
    fileName.endsWith(".config.js") ||
    fileName.endsWith(".config.mjs")
  )
    return "config";
  return "other";
}

function buildCategorizedFiles(paths: string[]): CategorizedFile[] {
  return paths.map((path) => {
    const parts = path.split("/");
    return {
      path,
      fileName: parts[parts.length - 1],
      directory: parts.slice(0, -1).join("/"),
      category: categorizeFile(path),
    };
  });
}

/* ─── tree builder ─── */

interface TreeNode {
  name: string;
  path: string; // full path for files, partial for dirs
  isFile: boolean;
  category: FileCategory;
  children: TreeNode[];
}

function buildFileTree(files: CategorizedFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, category: "other", children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.children.push({
          name: part,
          path: file.path,
          isFile: true,
          category: file.category,
          children: [],
        });
      } else {
        let dir = current.children.find((c) => !c.isFile && c.name === part);
        if (!dir) {
          dir = {
            name: part,
            path: parts.slice(0, i + 1).join("/"),
            isFile: false,
            category: "other",
            children: [],
          };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  // Sort: directories first, then alphabetical
  function sortTree(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => ({ ...n, children: sortTree(n.children) }));
  }

  return sortTree(root.children);
}

/* ─── props ─── */

interface FileContextPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProjectId: string;
  selectedFiles: ContextFile[];
  onFilesChange: (files: ContextFile[]) => void;
}

/* ─── main component ─── */

export function FileContextPicker({
  open,
  onOpenChange,
  currentProjectId,
  selectedFiles,
  onFilesChange,
}: FileContextPickerProps) {
  const isMobile = useIsMobile();

  const [projects, setProjects] = React.useState<ProjectFileInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = React.useState(currentProjectId);
  const [filePaths, setFilePaths] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<FileCategory>("all");
  const [localSelected, setLocalSelected] = React.useState<Set<string>>(new Set());
  const [showProjectDropdown, setShowProjectDropdown] = React.useState(false);
  const [projectSearch, setProjectSearch] = React.useState("");
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());

  // Persistent cache so files are never re-fetched for the same project
  const fileCache = React.useRef<Map<string, string[]>>(new Map());
  // Tracks which project each selected file came from
  const selectedProjectsMap = React.useRef<Map<string, { projectId: string; projectName: string }>>(new Map());

  const searchRef = React.useRef<HTMLInputElement>(null);
  const projectSearchRef = React.useRef<HTMLInputElement>(null);

  // Load projects & files when modal opens
  React.useEffect(() => {
    if (!open) return;
    // Initialise from incoming selectedFiles
    const initPaths = new Set(selectedFiles.map((f) => f.path));
    setLocalSelected(initPaths);
    selectedProjectsMap.current = new Map(
      selectedFiles.map((f) => [f.path, { projectId: f.projectId, projectName: f.projectName }]),
    );
    setSearch("");
    setActiveCategory("all");

    async function loadProjects() {
      try {
        const p = await getProjectsForPicker();
        setProjects(p);
        // Prefetch files for all projects in the background
        for (const project of p) {
          if (!fileCache.current.has(project.id)) {
            getProjectFiles(project.id)
              .then((files) => fileCache.current.set(project.id, files))
              .catch(() => { /* silent */ });
          }
        }
      } catch {
        /* silent */
      }
    }
    loadProjects();
  }, [open, selectedFiles]);

  React.useEffect(() => {
    if (!open || !activeProjectId) return;

    const cached = fileCache.current.get(activeProjectId);
    if (cached) {
      // Instant — use the cache
      setFilePaths(cached);
      setIsLoading(false);
      return;
    }

    // Not cached yet — fetch and cache
    setIsLoading(true);
    setFilePaths([]);

    async function loadFiles() {
      try {
        const files = await getProjectFiles(activeProjectId);
        fileCache.current.set(activeProjectId, files);
        setFilePaths(files);
      } catch {
        /* silent */
      } finally {
        setIsLoading(false);
      }
    }
    loadFiles();
  }, [open, activeProjectId]);

  // Focus search on open
  React.useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  const allFiles = React.useMemo(() => buildCategorizedFiles(filePaths), [filePaths]);

  // Category counts
  const categoryCounts = React.useMemo(() => {
    const counts: Record<FileCategory, number> = {
      all: allFiles.length,
      page: 0,
      component: 0,
      api: 0,
      hook: 0,
      lib: 0,
      config: 0,
      style: 0,
      migration: 0,
      other: 0,
    };
    for (const f of allFiles) counts[f.category]++;
    return counts;
  }, [allFiles]);

  // Filtered + searched files
  const filteredFiles = React.useMemo(() => {
    let files = allFiles;

    if (activeCategory !== "all") {
      files = files.filter((f) => f.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      files = files.filter(
        (f) => f.path.toLowerCase().includes(q) || f.fileName.toLowerCase().includes(q),
      );
    }

    return files;
  }, [allFiles, activeCategory, search]);

  // Build tree from filtered files
  const fileTree = React.useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  // Auto-expand all directories when files change or search is active
  React.useEffect(() => {
    const dirs = new Set<string>();
    for (const f of filteredFiles) {
      const parts = f.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
    setExpandedDirs(dirs);
  }, [filteredFiles]);

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleFile(path: string) {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        selectedProjectsMap.current.delete(path);
      } else {
        next.add(path);
        selectedProjectsMap.current.set(path, {
          projectId: activeProjectId,
          projectName: activeProject?.name ?? "Unknown project",
        });
      }
      return next;
    });
  }

  function handleConfirm() {
    const files: ContextFile[] = [...localSelected].map((path) => {
      const proj = selectedProjectsMap.current.get(path);
      return {
        path,
        projectId: proj?.projectId ?? activeProjectId,
        projectName: proj?.projectName ?? activeProject?.name ?? "Unknown project",
      };
    });
    onFilesChange(files);
    onOpenChange(false);
  }

  function handleClearAll() {
    setLocalSelected(new Set());
    selectedProjectsMap.current.clear();
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const visibleCategories: FileCategory[] = (
    ["all", "page", "component", "api", "hook", "lib", "config", "style", "migration", "other"] as const
  ).filter((c) => c === "all" || categoryCounts[c] > 0);

  const pickerContent = (
    <div className="flex h-full flex-col">
      {/* Header with project selector + search */}
      <div className="shrink-0 space-y-3 p-4 pb-0">
        {/* Project selector row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowProjectDropdown((v) => {
                  if (v) setProjectSearch("");
                  return !v;
                });
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <div className="size-2 rounded-full bg-emerald-500" />
              <span className="flex-1 truncate text-left font-medium text-foreground">
                {activeProject?.name ?? "Select project"}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  showProjectDropdown && "rotate-180",
                )}
              />
            </button>

            {/* Project dropdown */}
            <AnimatePresence>
              {showProjectDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
                >
                  {/* Search inside dropdown */}
                  <div className="p-1.5 pb-0">
                    <div className="relative">
                      <HugeiconsIcon
                        icon={Search01Icon}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50"
                      />
                      <input
                        ref={projectSearchRef}
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full rounded-md bg-muted/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/40"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Scrollable list */}
                  <div className="max-h-52 overflow-y-auto p-1 mt-1">
                    {projects
                      .filter((p) =>
                        !projectSearch.trim() ||
                        p.name.toLowerCase().includes(projectSearch.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            // Apply cache immediately so the list updates synchronously
                            const cached = fileCache.current.get(p.id);
                            if (cached) setFilePaths(cached);
                            setActiveProjectId(p.id);
                            setShowProjectDropdown(false);
                            setProjectSearch("");
                            setActiveCategory("all");
                            setSearch("");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                            p.id === activeProjectId
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )}
                        >
                          <div
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              p.id === activeProjectId ? "bg-emerald-500" : "bg-muted-foreground/30",
                            )}
                          />
                          <span className="flex-1 truncate text-left">{p.name}</span>
                          {p.id === currentProjectId && (
                            <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 shrink-0">
                              current
                            </Badge>
                          )}
                        </button>
                      ))}
                    {projectSearch.trim() &&
                      projects.filter((p) =>
                        p.name.toLowerCase().includes(projectSearch.toLowerCase()),
                      ).length === 0 && (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                          No projects match &ldquo;{projectSearch}&rdquo;
                        </p>
                      )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {localSelected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-xs text-muted-foreground hover:text-destructive shrink-0"
            >
              Clear all
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60"
          />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-9 h-10 bg-muted/30"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="shrink-0 flex items-center gap-1 overflow-x-auto px-4 py-3 scrollbar-none">
        {visibleCategories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = activeCategory === cat;
          const count = categoryCounts[cat];

          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <HugeiconsIcon
                icon={meta.icon}
                className={cn("size-3.5", isActive ? "text-background" : meta.color)}
              />
              <span>{meta.label}</span>
              {cat !== "all" && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    isActive ? "text-background/60" : "text-muted-foreground/50",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="mx-4 h-px bg-border/60" />

      {/* File tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <HugeiconsIcon
                icon={Loading03Icon}
                className="size-5 animate-spin text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">Loading files...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
                <HugeiconsIcon icon={File02Icon} className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search ? "No files match your search" : "No files found"}
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-xs text-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="font-mono text-[13px]">
              {fileTree.map((node, i) => (
                <TreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  isLast={i === fileTree.length - 1}
                  parentLines={[]}
                  selected={localSelected}
                  onToggle={toggleFile}
                  searchQuery={search}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 border-t border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {localSelected.size > 0 ? (
              <span>
                <span className="font-semibold text-foreground">{localSelected.size}</span>{" "}
                {localSelected.size === 1 ? "file" : "files"} selected
              </span>
            ) : (
              <span>Select files to add as context</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={localSelected.size === 0}
              className="text-xs gap-1.5"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
              Add to context
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92vh] rounded-t-2xl p-0"
          showCloseButton={false}
        >
          <SheetHeader className="p-4 pb-0">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/20" />
            <SheetTitle className="text-base">Add Context Files</SheetTitle>
          </SheetHeader>
          {pickerContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 h-[80vh] max-h-[700px] flex flex-col overflow-hidden">
        <DialogHeader className="p-4 pb-0 shrink-0">
          <DialogTitle className="text-base">Add Context Files</DialogTitle>
        </DialogHeader>
        {pickerContent}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tree row (recursive) ─── */

function TreeRow({
  node,
  depth,
  isLast,
  parentLines,
  selected,
  onToggle,
  searchQuery,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[]; // true = parent at that depth has a continuing line
  selected: Set<string>;
  onToggle: (path: string) => void;
  searchQuery: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = !node.isFile && expandedDirs.has(node.path);
  const isSelected = node.isFile && selected.has(node.path);
  const meta = node.isFile ? CATEGORY_META[node.category] : null;

  // Build the tree guide lines for this row
  const guides = (
    <span className="inline-flex shrink-0 select-none" aria-hidden>
      {parentLines.map((continues, i) => (
        <span
          key={i}
          className="inline-block w-5 text-center text-border"
        >
          {continues ? "│" : " "}
        </span>
      ))}
      {depth > 0 && (
        <span className="inline-block w-5 text-center text-border">
          {isLast ? "└" : "├"}
        </span>
      )}
    </span>
  );

  if (!node.isFile) {
    // Directory row
    return (
      <>
        <button
          onClick={() => onToggleDir(node.path)}
          className="group flex w-full items-center py-1 text-left hover:bg-accent/50 rounded-md transition-colors"
        >
          {guides}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-3 text-muted-foreground/60 transition-transform mr-1",
              !isExpanded && "-rotate-90",
            )}
          />
          <HugeiconsIcon
            icon={Folder01Icon}
            className="size-3.5 text-muted-foreground/70 mr-1.5"
          />
          <span className="text-muted-foreground font-medium truncate">
            {node.name}
          </span>
        </button>

        {isExpanded &&
          node.children.map((child, i) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              parentLines={[...parentLines, ...(depth > 0 ? [!isLast] : [])]}
              selected={selected}
              onToggle={onToggle}
              searchQuery={searchQuery}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
      </>
    );
  }

  // File row
  return (
    <motion.button
      onClick={() => onToggle(node.path)}
      whileTap={{ scale: 0.995 }}
      className={cn(
        "group flex w-full items-center py-1 text-left rounded-md transition-all",
        isSelected
          ? "bg-primary/[0.06] dark:bg-primary/[0.08]"
          : "hover:bg-accent/50",
      )}
    >
      {guides}
      <span className="inline-block w-5" />
      {meta && (
        <HugeiconsIcon
          icon={meta.icon}
          className={cn("size-3.5 shrink-0 mr-1.5", meta.color)}
        />
      )}
      <span className="flex-1 min-w-0 truncate text-foreground">
        <HighlightMatch text={node.name} query={searchQuery} />
      </span>

      {/* Checkbox */}
      <div
        className={cn(
          "size-4 shrink-0 rounded border-[1.5px] flex items-center justify-center transition-all mr-2",
          isSelected
            ? "bg-primary border-primary"
            : "border-border group-hover:border-muted-foreground/40",
        )}
      >
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <svg viewBox="0 0 12 12" className="size-2.5 text-primary-foreground">
              <path
                d="M3.5 6.5L5 8l3.5-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        )}
      </div>
    </motion.button>
  );
}

/* ─── Search highlight ─── */

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-200/60 dark:bg-yellow-500/20 text-foreground rounded-sm px-px">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
