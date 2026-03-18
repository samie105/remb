"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Video01Icon,
  PresentationBarChart01Icon,
  CodeIcon,
  SparklesIcon,
  Loading03Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  RefreshIcon,
  ArrowRight01Icon,
  PlusSignIcon,
  Cancel01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useProjects } from "@/lib/project-store";
import {
  requestVideoPresentation,
  getVideoPresentation,
  listVideoPresentations,
  deleteVideoPresentation,
  cancelVideoPresentation,
  type VideoPresentation,
  type VideoStyle,
} from "@/lib/video-actions";

/* ─── Animation variants (match dashboard) ─── */

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
};

/* ─── Style config ─── */

const STYLE_CONFIG = {
  slideshow: {
    title: "Slideshow",
    description: "Animated slides with architecture diagrams and tech visuals",
    icon: PresentationBarChart01Icon,
    accent: "text-blue-500",
  },
  pitch: {
    title: "Pitch",
    description: "Cinematic trailer with dramatic visuals and bold narrative",
    icon: Video01Icon,
    accent: "text-violet-500",
  },
  "code-tour": {
    title: "Code Tour",
    description: "Developer walkthrough of architecture and data flows",
    icon: CodeIcon,
    accent: "text-emerald-500",
  },
} satisfies Record<VideoStyle, { title: string; description: string; icon: typeof Video01Icon; accent: string }>;

const MAX_PRESENTATIONS = 2;

/* ─── Helpers ─── */

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ─── Page ─── */

export default function PresentationPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjects();
  const project = projects.find((p) => p.slug === slug) ?? null;

  const [presentations, setPresentations] = React.useState<VideoPresentation[]>([]);
  const [active, setActive] = React.useState<VideoPresentation | null>(null);
  const [selectedStyle, setSelectedStyle] = React.useState<VideoStyle>("slideshow");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const pollerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailCount = React.useRef(0);

  const successCount = presentations.filter((p) => p.status === "done").length;
  const isAtLimit = successCount >= MAX_PRESENTATIONS;

  // Load presentations
  React.useEffect(() => {
    if (!project) {
      setIsLoading(false);
      return;
    }
    listVideoPresentations(project.id)
      .then((list) => {
        setPresentations(list);
        const inProgress = list.find((p) => p.status === "queued" || p.status === "generating");
        if (inProgress) {
          setActive(inProgress);
          setIsGenerating(true);
        } else if (list.length > 0) {
          setActive(list[0]);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll active generation
  React.useEffect(() => {
    if (!isGenerating || !active || !project) return;
    pollFailCount.current = 0;
    pollerRef.current = setInterval(async () => {
      try {
        const updated = await getVideoPresentation(active.id);
        if (!updated) return;
        pollFailCount.current = 0;
        setActive(updated);
        if (updated.status === "done" || updated.status === "failed") {
          setIsGenerating(false);
          clearInterval(pollerRef.current!);
          const list = await listVideoPresentations(project.id);
          setPresentations(list);
        }
      } catch {
        pollFailCount.current += 1;
        if (pollFailCount.current >= 3) {
          clearInterval(pollerRef.current!);
          setIsGenerating(false);
          setError("Lost connection — check your session and try again");
        }
      }
    }, 4000);
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [isGenerating, active?.id, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    if (!project || isAtLimit) return;
    setError(null);
    setIsGenerating(true);
    try {
      const p = await requestVideoPresentation(project.id, selectedStyle);
      setActive(p);
      setPresentations((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setIsGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteVideoPresentation(id);
      setPresentations((prev) => prev.filter((p) => p.id !== id));
      if (active?.id === id) setActive(null);
      toast.success("Presentation deleted");
    } catch {
      toast.error("Failed to delete presentation. Please try again.");
    }
  }

  async function handleStop() {
    if (!active) return;
    try {
      await cancelVideoPresentation(active.id);
    } catch {
      /* best effort */
    }
    if (pollerRef.current) clearInterval(pollerRef.current);
    setIsGenerating(false);
    // Refresh list to get final state
    if (project) {
      const list = await listVideoPresentations(project.id);
      setPresentations(list);
      const updated = list.find((p) => p.id === active.id);
      if (updated) setActive(updated);
    }
  }

  function goToSelector() {
    setActive(null);
    setIsGenerating(false);
    setError(null);
  }

  const viewState = (() => {
    if (isLoading) return "loading" as const;
    if (!project) return "no-project" as const;
    if (!active) return "selector" as const;
    if (active.status === "queued" || active.status === "generating") return "generating" as const;
    if (active.status === "done") return "player" as const;
    if (active.status === "failed") return "failed" as const;
    return "selector" as const;
  })();

  return (
    <div
      className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 -mb-4 sm:-mb-6 flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 3rem)" }}
    >
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* ── LEFT: main content ── */}
        <div className="flex flex-col overflow-hidden lg:border-r border-border/40">
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border/40 shrink-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
                Presentations
              </h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {project
                  ? `AI-generated video walkthroughs of ${project.name}`
                  : "Select a project to get started"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {project && (
                <Badge variant="secondary" className="text-[11px] font-medium tabular-nums">
                  {successCount}/{MAX_PRESENTATIONS}
                </Badge>
              )}
              {(viewState === "player" || viewState === "failed") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToSelector}
                  disabled={isAtLimit && viewState !== "failed"}
                  className="gap-1.5 h-8 text-xs"
                >
                  <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />
                  New
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {viewState === "loading" && <LoadingView key="loading" />}
              {viewState === "no-project" && <NoProjectView key="no-project" />}
              {viewState === "selector" && (
                <StyleSelectorView
                  key="selector"
                  selectedStyle={selectedStyle}
                  onSelectStyle={setSelectedStyle}
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  isAtLimit={isAtLimit}
                  successCount={successCount}
                  error={error}
                />
              )}
              {viewState === "generating" && (
                <GeneratingView
                  key="generating"
                  presentation={active!}
                  onStop={handleStop}
                  error={error}
                  onResume={() => { setError(null); setIsGenerating(true); }}
                />
              )}
              {viewState === "player" && (
                <PlayerView key={`player-${active!.id}`} presentation={active!} />
              )}
              {viewState === "failed" && (
                <FailedView key="failed" presentation={active!} onRetry={goToSelector} />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── RIGHT: history ── */}
        <HistorySidebar
          presentations={presentations}
          activeId={active?.id ?? null}
          isGenerating={isGenerating}
          onSelect={(p) => {
            setActive(p);
            setIsGenerating(p.status === "queued" || p.status === "generating");
          }}
          onDelete={(id) => setDeletingId(id)}
          onNew={goToSelector}
          isAtLimit={isAtLimit}
        />
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete presentation?</AlertDialogTitle>
            <AlertDialogDescription>
              This presentation and its video will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) {
                  handleDelete(deletingId);
                  setDeletingId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── LoadingView ─── */

function LoadingView() {
  return (
    <motion.div
      className="flex items-center justify-center h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50">
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin text-muted-foreground" />
        </div>
        <p className="text-[13px] text-muted-foreground">Loading presentations…</p>
      </div>
    </motion.div>
  );
}

/* ─── NoProjectView ─── */

function NoProjectView() {
  return (
    <motion.div
      className="flex items-center justify-center h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="py-10 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
          <HugeiconsIcon icon={Video01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
        </div>
        <p className="text-[13px] font-medium text-foreground mb-1">No project selected</p>
        <p className="text-xs text-muted-foreground">Select a project from the sidebar to start.</p>
      </div>
    </motion.div>
  );
}

/* ─── StyleSelectorView ─── */

function StyleSelectorView({
  selectedStyle,
  onSelectStyle,
  onGenerate,
  isGenerating,
  isAtLimit,
  successCount,
  error,
}: {
  selectedStyle: VideoStyle;
  onSelectStyle: (s: VideoStyle) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isAtLimit: boolean;
  successCount: number;
  error: string | null;
}) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-lg px-6 py-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="text-center mb-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground mb-1">Choose a style</h2>
          <p className="text-xs text-muted-foreground">
            Each presentation generates 5 cinematic 8-second clips
          </p>
        </motion.div>

        {/* Style cards */}
        <div className="space-y-2 mb-6">
          {(Object.entries(STYLE_CONFIG) as [VideoStyle, (typeof STYLE_CONFIG)[VideoStyle]][]).map(
            ([style, cfg]) => {
              const isSelected = selectedStyle === style;
              return (
                <motion.button
                  key={style}
                  variants={item}
                  whileTap={{ scale: 0.995 }}
                  onClick={() => onSelectStyle(style)}
                  className={`
                    w-full flex items-center gap-3.5 p-3.5 rounded-xl text-left transition-all duration-150 border
                    ${
                      isSelected
                        ? "bg-accent border-border/60 shadow-sm"
                        : "border-border/40 hover:bg-accent/50"
                    }
                  `}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    <HugeiconsIcon
                      icon={cfg.icon}
                      strokeWidth={2}
                      className={`size-[18px] transition-colors ${isSelected ? cfg.accent : "text-muted-foreground"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{cfg.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {cfg.description}
                    </p>
                  </div>
                  <div
                    className={`size-4 rounded-full border-2 shrink-0 transition-all duration-200 ${
                      isSelected ? "border-foreground bg-foreground" : "border-border"
                    }`}
                  >
                    {isSelected && (
                      <svg className="size-full text-background" viewBox="0 0 16 16" fill="none">
                        <path d="M4.5 8L7 10.5L11.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </motion.button>
              );
            },
          )}
        </div>

        {/* Generate / Limit */}
        <motion.div variants={item}>
          {isAtLimit ? (
            <div className="text-center py-3 px-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <div className="h-1.5 flex-1 max-w-30 rounded-full bg-amber-500/20 overflow-hidden">
                  <div className="h-full w-full rounded-full bg-amber-500" />
                </div>
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                  {successCount}/{MAX_PRESENTATIONS}
                </span>
              </div>
              <p className="text-[13px] font-medium text-foreground mb-0.5">Presentation limit reached</p>
              <p className="text-xs text-muted-foreground">
                Delete an existing presentation from the history panel to create a new one.
              </p>
            </div>
          ) : (
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="w-full gap-2 h-10 text-[13px] font-medium"
            >
              {isGenerating ? (
                <>
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-4" />
                  Generate Presentation
                </>
              )}
            </Button>
          )}
        </motion.div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-1.5 mt-3 text-[12px] text-destructive"
          >
            <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-3.5" />
            {error}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─── GeneratingView ─── */

function GeneratingView({ presentation, onStop, error, onResume }: { presentation: VideoPresentation; onStop: () => void; error: string | null; onResume: () => void }) {
  const completed = presentation.segments.filter((s) => s.video_url).length;
  const total = Math.max(presentation.segments.length, 5);
  const progress = (completed / total) * 100;
  const cfg = STYLE_CONFIG[presentation.style];
  const currentSeg = presentation.segments[completed];

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm text-center"
      >
        {/* Icon */}
        <motion.div variants={item} className="mb-6">
          <motion.div
            className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted/50"
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <HugeiconsIcon icon={cfg.icon} strokeWidth={1.8} className={`size-6 ${cfg.accent}`} />
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.div variants={item}>
          <h3 className="text-[15px] font-semibold text-foreground mb-1">
            Generating {cfg.title}
          </h3>
          <p className="text-xs text-muted-foreground mb-6">
            {completed}/{total} segments complete
          </p>
        </motion.div>

        {/* Progress bar */}
        <motion.div variants={item} className="mb-6">
          <div className="h-1.5 rounded-full bg-muted/80 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-foreground/80"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(progress, 2)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* Current segment name */}
        <motion.div variants={item}>
          <AnimatePresence mode="wait">
            {currentSeg && (
              <motion.p
                key={completed}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-[12px] text-muted-foreground"
              >
                {presentation.status === "generating" ? "Rendering" : "Queued"}:{" "}
                <span className="font-medium text-foreground">
                  {currentSeg.title}
                </span>
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Error / Stop */}
        {error ? (
          <motion.div variants={item} className="mt-6 space-y-3">
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-3.5" />
              {error}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={onResume} className="gap-1.5 h-8 text-xs">
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
                Resume
              </Button>
              <Button variant="ghost" size="sm" onClick={onStop} className="gap-1.5 h-8 text-xs text-muted-foreground">
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                Stop
              </Button>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div variants={item} className="mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={onStop}
                className="gap-1.5 h-8 text-xs text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                Stop Generation
              </Button>
            </motion.div>
            <motion.p
              variants={item}
              className="text-[11px] text-muted-foreground/50 mt-4"
            >
              Each segment is an 8-second AI-generated clip — this may take a few minutes
            </motion.p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─── FailedView ─── */

function FailedView({
  presentation,
  onRetry,
}: {
  presentation: VideoPresentation;
  onRetry: () => void;
}) {
  const cfg = STYLE_CONFIG[presentation.style];
  const failedSegments = presentation.segments.filter((s) => !s.video_url).length;

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full px-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 mx-auto mb-4">
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.8} className="size-6 text-destructive" />
        </div>
        <h3 className="text-[15px] font-semibold text-foreground mb-1">Generation failed</h3>
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-2">
          {presentation.error ?? "Something went wrong during video generation."}
        </p>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/60 mb-6">
          <span>{cfg.title}</span>
          <span>&middot;</span>
          {failedSegments > 0 && (
            <>
              <span>{failedSegments} segment{failedSegments !== 1 ? "s" : ""} failed</span>
              <span>&middot;</span>
            </>
          )}
          <span>{timeAgo(presentation.created_at)}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 h-8 text-xs">
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
          Try Again
        </Button>
      </div>
    </motion.div>
  );
}

/* ─── PlayerView ─── */

function PlayerView({ presentation }: { presentation: VideoPresentation }) {
  const validSegments = presentation.segments.filter((s) => s.video_url);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const current = validSegments[currentIndex];
  const cfg = STYLE_CONFIG[presentation.style];

  function handleEnded() {
    if (currentIndex < validSegments.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  React.useEffect(() => {
    const video = videoRef.current;
    if (video && current?.video_url) {
      video.load();
      video.play().catch(() => {});
    }
  }, [currentIndex, current?.video_url]);

  if (validSegments.length === 0) {
    return (
      <motion.div className="flex items-center justify-center h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
            <HugeiconsIcon icon={Video01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          </div>
          <p className="text-[13px] font-medium text-foreground mb-1">No segments available</p>
          <p className="text-xs text-muted-foreground">All video segments failed to generate.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Video */}
      <div className="relative bg-black shrink-0" style={{ aspectRatio: "16/9", maxHeight: "55%" }}>
        {/* Segment progress bar */}
        <div className="absolute top-0 left-0 right-0 flex z-10 px-3 pt-2.5 gap-1">
          {validSegments.map((_, i) => (
            <div key={i} className="flex-1">
              <div
                className={`h-[2px] rounded-full transition-all duration-300 ${
                  i === currentIndex ? "bg-white" : i < currentIndex ? "bg-white/50" : "bg-white/15"
                }`}
              />
            </div>
          ))}
        </div>

        {current?.video_url && (
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onEnded={handleEnded}
            controls
            playsInline
            autoPlay
          >
            <source src={current.video_url} type="video/mp4" />
          </video>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 shrink-0">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          <HugeiconsIcon icon={cfg.icon} strokeWidth={2} className={`size-3.5 ${cfg.accent}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">
            {current?.title ?? `Segment ${currentIndex + 1}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {cfg.title} &middot; {currentIndex + 1} of {validSegments.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => i - 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={currentIndex === validSegments.length - 1}
            onClick={() => setCurrentIndex((i) => i + 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em] mb-2 px-1">
          Segments
        </p>
        <div className="space-y-0 divide-y divide-border/40">
          {validSegments.map((seg, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-full flex items-center gap-3 py-3 px-2 -mx-1 rounded-lg text-left transition-colors group ${
                  isActive ? "bg-accent" : "hover:bg-muted/30"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
                    isActive ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-medium truncate ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                    {seg.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50">8s clip</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── HistorySidebar ─── */

function HistorySidebar({
  presentations,
  activeId,
  isGenerating,
  onSelect,
  onDelete,
  onNew,
  isAtLimit,
}: {
  presentations: VideoPresentation[];
  activeId: string | null;
  isGenerating: boolean;
  onSelect: (p: VideoPresentation) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  isAtLimit: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-foreground">History</h2>
          {presentations.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 font-medium tabular-nums">
              {presentations.length}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onNew}
          disabled={isGenerating || isAtLimit}
          className="gap-1.5 h-7 text-xs"
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3" />
          New
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {presentations.length === 0 ? (
          <div className="py-10 text-center px-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
            </div>
            <p className="text-[13px] font-medium text-foreground mb-1">No presentations yet</p>
            <p className="text-xs text-muted-foreground">
              Generated presentations will appear here.
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {presentations.map((p, i) => (
              <HistoryCard
                key={p.id}
                presentation={p}
                index={i}
                isActive={p.id === activeId}
                onSelect={() => onSelect(p)}
                onDelete={() => onDelete(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── HistoryCard ─── */

function HistoryCard({
  presentation,
  index,
  isActive,
  onSelect,
  onDelete,
}: {
  presentation: VideoPresentation;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const cfg = STYLE_CONFIG[presentation.style];
  const inProgress = presentation.status === "queued" || presentation.status === "generating";
  const clipCount = presentation.segments.filter((s) => s.video_url).length;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      onDelete();
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onSelect}
      className={`
        relative group flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-all duration-150
        ${isActive ? "bg-accent" : "hover:bg-accent/50"}
        ${isDeleting ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      {/* Style icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <HugeiconsIcon
          icon={cfg.icon}
          strokeWidth={2}
          className={`size-3.5 ${isActive ? cfg.accent : "text-muted-foreground"}`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground">{cfg.title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {timeAgo(presentation.created_at)}
        </p>

        {/* Status */}
        <div className="flex items-center gap-1.5 mt-1.5">
          {inProgress && (
            <>
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/40" />
                <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">Generating…</span>
            </>
          )}
          {presentation.status === "done" && (
            <>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">{clipCount} clips</span>
            </>
          )}
          {presentation.status === "failed" && (
            <>
              <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} className="size-3 text-destructive" />
              <span className="text-[10px] text-destructive">Failed</span>
            </>
          )}
        </div>
      </div>

      {/* Delete button — visible on hover */}
      {!inProgress && (
        <button
          onClick={handleDelete}
          className="absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
          title="Delete presentation"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </motion.div>
  );
}
