"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  PresentationBarChart01Icon,
  Video01Icon,
  CodeIcon,
  ComputerIcon,
  Layers01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  requestVideoPresentation,
  getVideoPresentation,
  listVideoPresentations,
  type VideoPresentation,
  type VideoStyle,
  type VideoSegment,
} from "@/lib/video-actions";

/* ─── style config ─── */

const STYLE_CONFIG: Record<
  VideoStyle,
  {
    title: string;
    description: string;
    icon: typeof PresentationBarChart01Icon;
    accentClass: string;
    bgClass: string;
    ringClass: string;
  }
> = {
  slideshow: {
    title: "Slideshow",
    description: "Animated slides with architecture diagrams, feature breakdowns & tech visuals",
    icon: PresentationBarChart01Icon,
    accentClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
    ringClass: "ring-blue-500/30",
  },
  pitch: {
    title: "Pitch",
    description: "Cinematic tech trailer — dramatic visuals, bold narrative, high production",
    icon: Video01Icon,
    accentClass: "text-violet-500",
    bgClass: "bg-violet-500/10",
    ringClass: "ring-violet-500/30",
  },
  "code-tour": {
    title: "Code Tour",
    description: "Developer walkthrough of repo structure, architecture layers & data flows",
    icon: CodeIcon,
    accentClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    ringClass: "ring-emerald-500/30",
  },
};

/* ─── animations ─── */

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.07 } },
};

/* ─── component ─── */

interface VideoPresentationTabProps {
  projectId: string;
  projectName: string;
}

export function VideoPresentationTab({ projectId, projectName }: VideoPresentationTabProps) {
  const [presentations, setPresentations] = React.useState<VideoPresentation[]>([]);
  const [activePresentation, setActivePresentation] = React.useState<VideoPresentation | null>(null);
  const [selectedStyle, setSelectedStyle] = React.useState<VideoStyle>("slideshow");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const pollerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const list = await listVideoPresentations(projectId);
        setPresentations(list);
        const inProgress = list.find((p) => p.status === "queued" || p.status === "generating");
        if (inProgress) {
          setActivePresentation(inProgress);
          setIsGenerating(true);
        } else if (list.length > 0) {
          setActivePresentation(list[0]);
        }
      } catch {
        // Fresh state
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [projectId]);

  React.useEffect(() => {
    if (!isGenerating || !activePresentation) return;

    pollerRef.current = setInterval(async () => {
      try {
        const updated = await getVideoPresentation(activePresentation.id);
        if (!updated) return;
        setActivePresentation(updated);

        if (updated.status === "done" || updated.status === "failed") {
          setIsGenerating(false);
          if (pollerRef.current) clearInterval(pollerRef.current);
          const list = await listVideoPresentations(projectId);
          setPresentations(list);
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, 4000);

    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [isGenerating, activePresentation, projectId]);

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      const presentation = await requestVideoPresentation(projectId, selectedStyle);
      setActivePresentation(presentation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setIsGenerating(false);
    }
  }

  function handleRegenerate() {
    setActivePresentation(null);
    setIsGenerating(false);
    setError(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[420px]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 text-muted-foreground"
        >
          <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center">
            <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.8} className="size-5 animate-spin" />
          </div>
          <span className="text-[13px]">Loading presentations…</span>
        </motion.div>
      </div>
    );
  }

  if (activePresentation) {
    return (
      <AnimatePresence mode="wait">
        {activePresentation.status === "queued" || activePresentation.status === "generating" ? (
          <GeneratingView
            key="generating"
            presentation={activePresentation}
            projectName={projectName}
          />
        ) : activePresentation.status === "failed" ? (
          <FailedView
            key="failed"
            presentation={activePresentation}
            onRetry={handleRegenerate}
          />
        ) : (
          <PlayerView
            key="player"
            presentation={activePresentation}
            projectName={projectName}
            onRegenerate={handleRegenerate}
            allPresentations={presentations}
            onSelectPresentation={setActivePresentation}
          />
        )}
      </AnimatePresence>
    );
  }

  // ─── Style Selection (empty state) ───
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full min-h-[420px] p-6 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <motion.div className="text-center mb-10" {...fadeUp}>
        <motion.div
          className="mx-auto mb-4 size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-sm"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <HugeiconsIcon icon={Video01Icon} strokeWidth={1.5} className="size-6 text-primary" />
        </motion.div>
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground mb-1.5">
          AI Video Presentation
        </h2>
        <p className="text-[13px] text-muted-foreground max-w-md leading-relaxed">
          Generate a cinematic video walkthrough of{" "}
          <span className="font-medium text-foreground">{projectName}</span>{" "}
          powered by Veo 3. Choose a style to get started.
        </p>
      </motion.div>

      {/* Style cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[640px] w-full mb-8"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {(Object.entries(STYLE_CONFIG) as [VideoStyle, (typeof STYLE_CONFIG)[VideoStyle]][]).map(
          ([style, config]) => {
            const isSelected = selectedStyle === style;
            return (
              <motion.button
                key={style}
                variants={fadeUp}
                onClick={() => setSelectedStyle(style)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  relative group text-left rounded-xl border p-4
                  transition-colors duration-200 cursor-pointer
                  ${
                    isSelected
                      ? `border-primary/40 bg-primary/[0.04] ring-1 ${config.ringClass} shadow-sm dark:border-transparent`
                      : "border-border/50 bg-card hover:border-border hover:bg-muted/20 dark:border-transparent dark:hover:border-transparent"
                  }
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className={`
                      size-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200
                      ${isSelected ? `${config.bgClass}` : "bg-muted/60 group-hover:bg-muted"}
                    `}
                  >
                    <HugeiconsIcon
                      icon={config.icon}
                      strokeWidth={1.6}
                      className={`size-[18px] transition-colors duration-200 ${
                        isSelected ? config.accentClass : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[13px] font-semibold text-foreground">{config.title}</span>
                      {isSelected && (
                        <motion.div
                          layoutId="style-indicator"
                          className="size-[18px] rounded-full bg-primary flex items-center justify-center"
                          transition={{ type: "spring", damping: 25, stiffness: 400 }}
                        >
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-[1.5]">
                      {config.description}
                    </p>
                  </div>
                </div>
              </motion.button>
            );
          },
        )}
      </motion.div>

      {/* Generate button */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          size="lg"
          className="gap-2.5 px-7 h-11 text-[13px] font-semibold shadow-sm"
        >
          {isGenerating ? (
            <>
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <HugeiconsIcon icon={SparklesIcon} strokeWidth={1.8} className="size-4" />
              Generate Presentation
            </>
          )}
        </Button>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 mt-3"
        >
          <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.8} className="size-3.5 text-destructive" />
          <p className="text-[12px] text-destructive">{error}</p>
        </motion.div>
      )}

      {/* Previous presentations */}
      {presentations.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-10 w-full max-w-[640px]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
              Previous
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="space-y-1">
            {presentations.slice(0, 5).map((p, i) => {
              const cfg = STYLE_CONFIG[p.style];
              return (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => setActivePresentation(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-card/50 hover:bg-muted/30 hover:border-border/50 transition-all duration-200 text-left group dark:border-transparent dark:hover:border-transparent"
                >
                  <div className={`size-7 rounded-md ${cfg?.bgClass ?? "bg-muted/60"} flex items-center justify-center`}>
                    <HugeiconsIcon
                      icon={cfg?.icon ?? Video01Icon}
                      strokeWidth={1.6}
                      className={`size-3.5 ${cfg?.accentClass ?? "text-muted-foreground"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-medium text-foreground">
                      {cfg?.title ?? p.style}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {new Date(p.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <Badge
                    variant={p.status === "done" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                    className="text-[9px] h-[18px] px-1.5 font-medium"
                  >
                    {p.status}
                  </Badge>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors"
                  />
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── Generating View ─── */

function GeneratingView({
  presentation,
  projectName,
}: {
  presentation: VideoPresentation;
  projectName: string;
}) {
  const completedSegments = presentation.segments.filter((s) => s.video_url).length;
  const totalSegments = Math.max(presentation.segments.length, 5);
  const progress = totalSegments > 0 ? (completedSegments / totalSegments) * 100 : 0;
  const styleConfig = STYLE_CONFIG[presentation.style];

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full min-h-[420px] p-6 sm:p-8"
      {...fadeUp}
      transition={{ duration: 0.4 }}
    >
      {/* Pulsing icon */}
      <div className="relative mb-8">
        <motion.div
          className="absolute -inset-4 rounded-full bg-primary/8 blur-2xl"
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative size-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-sm"
          animate={{ rotate: [0, 3, -3, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <HugeiconsIcon
            icon={styleConfig?.icon ?? Video01Icon}
            strokeWidth={1.5}
            className={`size-7 ${styleConfig?.accentClass ?? "text-primary"}`}
          />
        </motion.div>
      </div>

      <h3 className="text-[15px] font-semibold text-foreground mb-1">
        Generating {styleConfig?.title ?? "Video"} Presentation
      </h3>
      <p className="text-[12px] text-muted-foreground mb-7">
        Creating a cinematic walkthrough of{" "}
        <span className="font-medium text-foreground">{projectName}</span>
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-5">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-2">
          <span className="font-medium">Progress</span>
          <span>
            {completedSegments}/{totalSegments} segments
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Segment indicators */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: totalSegments }).map((_, i) => {
          const segment = presentation.segments[i];
          const isDone = !!segment?.video_url;
          const isActive = i === completedSegments && !isDone;

          return (
            <motion.div
              key={i}
              className={`
                size-9 rounded-xl border flex items-center justify-center text-[10px] font-semibold
                transition-all duration-300
                ${
                  isDone
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : isActive
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground/40"
                }
              `}
              animate={
                isActive ? { scale: [1, 1.06, 1] } : {}
              }
              transition={isActive ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : {}}
            >
              {isDone ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.8} className="size-4" />
              ) : isActive ? (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
              ) : (
                i + 1
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Current segment title */}
      <AnimatePresence mode="wait">
        {presentation.segments[completedSegments] && (
          <motion.div
            key={completedSegments}
            className="flex items-center gap-1.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.8} className="size-3 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium">
                {presentation.status === "generating" ? "Generating" : "Queued"}:
              </span>{" "}
              {presentation.segments[completedSegments]?.title ?? `Segment ${completedSegments + 1}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.p
        className="text-[10px] text-muted-foreground/50 mt-6"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        Each segment is an 8-second AI-generated clip — this may take a few minutes
      </motion.p>
    </motion.div>
  );
}

/* ─── Failed View ─── */

function FailedView({
  presentation,
  onRetry,
}: {
  presentation: VideoPresentation;
  onRetry: () => void;
}) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full min-h-[420px] p-6"
      {...fadeUp}
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 200 }}
        className="mb-5 size-14 rounded-2xl bg-destructive/10 border border-destructive/10 flex items-center justify-center"
      >
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="size-6 text-destructive" />
      </motion.div>
      <h3 className="text-[15px] font-semibold text-foreground mb-1.5">Generation Failed</h3>
      <p className="text-[12px] text-muted-foreground mb-1 max-w-sm text-center leading-relaxed">
        {presentation.error ?? "Something went wrong during video generation."}
      </p>
      <p className="text-[11px] text-muted-foreground/50 mb-6">
        {STYLE_CONFIG[presentation.style]?.title} &middot;{" "}
        {new Date(presentation.created_at).toLocaleString()}
      </p>
      <Button
        variant="outline"
        onClick={onRetry}
        className="gap-2 h-9 px-4 text-[12px] font-medium"
      >
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
        Try Again
      </Button>
    </motion.div>
  );
}

/* ─── Player View ─── */

function PlayerView({
  presentation,
  projectName,
  onRegenerate,
  allPresentations,
  onSelectPresentation,
}: {
  presentation: VideoPresentation;
  projectName: string;
  onRegenerate: () => void;
  allPresentations: VideoPresentation[];
  onSelectPresentation: (p: VideoPresentation) => void;
}) {
  const validSegments = presentation.segments.filter((s) => s.video_url);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(true);

  const current = validSegments[currentIndex];

  function handleEnded() {
    if (currentIndex < validSegments.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setIsPlaying(false);
    }
  }

  React.useEffect(() => {
    const video = videoRef.current;
    if (video && current?.video_url) {
      video.load();
      if (isPlaying) {
        video.play().catch(() => {});
      }
    }
  }, [currentIndex, current?.video_url, isPlaying]);

  function handleSegmentClick(index: number) {
    setCurrentIndex(index);
    setIsPlaying(true);
  }

  function handlePlayAll() {
    setCurrentIndex(0);
    setIsPlaying(true);
  }

  if (validSegments.length === 0) {
    return (
      <motion.div className="flex flex-col items-center justify-center h-full min-h-[420px]" {...fadeUp}>
        <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
          <HugeiconsIcon icon={Video01Icon} strokeWidth={1.5} className="size-5 text-muted-foreground" />
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">No video segments available</p>
        <Button variant="outline" onClick={onRegenerate} className="gap-2 h-9 px-4 text-[12px] font-medium">
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
          Generate New
        </Button>
      </motion.div>
    );
  }

  const styleConfig = STYLE_CONFIG[presentation.style];
  const otherPresentations = allPresentations.filter((p) => p.id !== presentation.id && p.status === "done");

  return (
    <motion.div
      className="flex flex-col lg:flex-row gap-4 h-full min-h-[420px] p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Main video area */}
      <div className="flex-1 flex flex-col min-w-0">
        <motion.div
          className="relative rounded-xl overflow-hidden bg-black aspect-video shadow-lg ring-1 ring-white/[0.06]"
          {...scaleIn}
          transition={{ duration: 0.4 }}
        >
          {current?.video_url && (
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              onEnded={handleEnded}
              controls
              playsInline
              autoPlay={isPlaying}
            >
              <source src={current.video_url} type="video/mp4" />
            </video>
          )}

          {/* Progress bar overlay at top */}
          <div className="absolute top-0 left-0 right-0 flex">
            {validSegments.map((_, i) => (
              <div key={i} className="flex-1 px-[1px] pt-2">
                <motion.div
                  className={`h-[3px] rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? "bg-white"
                      : i < currentIndex
                        ? "bg-white/60"
                        : "bg-white/15"
                  }`}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Info bar */}
        <motion.div
          className="flex items-center justify-between mt-3 px-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`size-8 rounded-lg ${styleConfig?.bgClass ?? "bg-muted/60"} flex items-center justify-center shrink-0`}
            >
              <HugeiconsIcon
                icon={styleConfig?.icon ?? Video01Icon}
                strokeWidth={1.6}
                className={`size-4 ${styleConfig?.accentClass ?? "text-muted-foreground"}`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-foreground truncate">
                {projectName} — {styleConfig?.title}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {current?.title ?? `Segment ${currentIndex + 1}`} &middot; {currentIndex + 1}/
                {validSegments.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePlayAll}
              className="gap-1.5 text-[11px] h-8 px-3"
            >
              <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className="shrink-0">
                <path d="M0 0v12l10-6z" />
              </svg>
              Play All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              className="gap-1.5 text-[11px] h-8 px-3"
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="size-3.5" />
              New
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Segment sidebar */}
      <motion.div
        className="w-full lg:w-60 shrink-0 flex flex-col"
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
      >
        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em] mb-2 px-0.5">
          Segments
        </p>
        <div className="space-y-1 flex-1 overflow-y-auto">
          {validSegments.map((seg, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={i}
                onClick={() => handleSegmentClick(i)}
                className={`
                  w-full text-left rounded-lg px-3 py-2.5 transition-all duration-200 group
                  ${
                    isActive
                      ? "bg-primary/[0.06] border border-primary/20 shadow-sm dark:border-transparent"
                      : "border border-transparent hover:bg-muted/40 dark:border-transparent"
                  }
                `}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`
                      text-[10px] font-bold mt-0.5 size-6 rounded-md flex items-center justify-center shrink-0 transition-colors duration-200
                      ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : i < currentIndex
                            ? "bg-muted text-muted-foreground"
                            : "bg-muted/50 text-muted-foreground/50"
                      }
                    `}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11px] font-medium truncate transition-colors duration-200 ${
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {seg.title}
                    </p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">8s clip</p>
                  </div>
                  {isActive && (
                    <motion.div
                      layoutId="segment-active"
                      className="mt-1 size-1.5 rounded-full bg-primary shrink-0"
                      transition={{ type: "spring", damping: 25, stiffness: 400 }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Other presentations */}
        {otherPresentations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em] mb-2 px-0.5">
              Other Versions
            </p>
            {otherPresentations.slice(0, 3).map((p) => {
              const cfg = STYLE_CONFIG[p.style];
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectPresentation(p)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/30 transition-colors text-left group"
                >
                  <div className={`size-6 rounded-md ${cfg?.bgClass ?? "bg-muted/60"} flex items-center justify-center`}>
                    <HugeiconsIcon
                      icon={cfg?.icon ?? Video01Icon}
                      strokeWidth={1.6}
                      className={`size-3 ${cfg?.accentClass ?? "text-muted-foreground"}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground group-hover:text-foreground truncate flex-1 transition-colors">
                    {cfg?.title} &middot;{" "}
                    {new Date(p.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
