"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  ArrowExpand01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  ViewIcon,
  Move01Icon,
  Loading03Icon,
  AlertCircleIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/* ─── shared mermaid render ─── */

async function renderMermaid(code: string): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
    securityLevel: "strict",
    fontFamily: "inherit",
  });
  const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}

/* ─── Inline diagram (click to expand) ─── */

interface InlineDiagramProps {
  code: string;
  title?: string;
}

export function InlineDiagram({ code, title }: InlineDiagramProps) {
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    renderMermaid(code)
      .then((result) => { if (!cancelled) setSvg(result); })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs mb-1">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" />
          <span className="font-medium">Diagram error</span>
        </div>
        <pre className="text-[10px] text-red-500/70 font-mono whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center gap-2 text-muted-foreground text-xs">
        <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
        Rendering diagram...
      </div>
    );
  }

  return (
    <>
      {/* Inline preview */}
      <div className="my-3 group relative">
        {title && (
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{title}</p>
        )}
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full rounded-xl border border-border/50 bg-muted/20 p-3 transition-all hover:border-border hover:bg-muted/40 hover:shadow-sm cursor-pointer text-left"
        >
          <div
            className="[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:max-h-64"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1.5 text-background text-xs font-medium shadow-lg">
              <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
              Click to expand
            </div>
          </div>
        </button>
      </div>

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {isExpanded && (
          <DiagramFullscreen
            svg={svg}
            code={code}
            title={title}
            onClose={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Fullscreen diagram with pan/zoom ─── */

interface DiagramFullscreenProps {
  svg: string;
  code: string;
  title?: string;
  onClose: () => void;
}

function DiagramFullscreen({ svg, code, title, onClose }: DiagramFullscreenProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0 });
  const panStart = React.useRef({ x: 0, y: 0 });
  const [copied, setCopied] = React.useState(false);

  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.2, Math.min(5, prev + delta)));
  }, []);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [isDragging]);

  const handlePointerUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  const fitToView = React.useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "=" || e.key === "+") setZoom((z) => Math.min(5, z + 0.2));
      if (e.key === "-") setZoom((z) => Math.max(0.2, z - 0.2));
      if (e.key === "0") fitToView();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fitToView]);

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-sm font-semibold text-foreground">{title}</span>
          )}
          <span className="text-[11px] text-muted-foreground/60">{(zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.2))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Zoom in (+)"
          >
            <HugeiconsIcon icon={ZoomInAreaIcon} className="size-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Zoom out (-)"
          >
            <HugeiconsIcon icon={ZoomOutAreaIcon} className="size-4" />
          </button>
          <button
            onClick={fitToView}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Fit to view (0)"
          >
            <HugeiconsIcon icon={ViewIcon} className="size-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-border/40" />
          <button
            onClick={copyCode}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Copy Mermaid code"
          >
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} className={cn("size-4", copied && "text-emerald-500")} />
          </button>
          <div className="mx-1 h-4 w-px bg-border/40" />
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 overflow-hidden",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <div
            className="[&_svg]:max-w-none [&_svg]:h-auto p-8"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>

      {/* Bottom hint */}
      <div className="flex items-center justify-center gap-3 border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground/40 shrink-0">
        <span className="flex items-center gap-1">
          <HugeiconsIcon icon={Move01Icon} className="size-3" />
          Drag to pan
        </span>
        <span>Scroll to zoom</span>
        <span>
          <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">Esc</kbd> to close
        </span>
      </div>
    </motion.div>
  );
}
