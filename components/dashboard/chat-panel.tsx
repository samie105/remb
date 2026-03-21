"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Layers01Icon,
  ArrowRight01Icon,
  AlertCircleIcon,
  StructureCheckIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  useChatStore,
  closePanel,
  updatePanelData,
  type ChatPanel as ChatPanelType,
} from "@/lib/chat-store";

/* ─── Plan tree panel ─── */

interface PlanNode {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  children?: PlanNode[];
}

function PlanTreePanel({ data }: { data: Record<string, unknown> }) {
  const phases = (data.phases ?? []) as PlanNode[];
  const title = (data.title as string) ?? "Plan";

  if (phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <HugeiconsIcon icon={Layers01Icon} className="size-8 opacity-30" />
        <p className="text-xs">No phases yet</p>
      </div>
    );
  }

  const completed = phases.filter((p) => p.status === "completed").length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {completed}/{phases.length} phases completed
        </p>
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${phases.length ? (completed / phases.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {phases.map((phase, i) => (
          <PhaseNode key={phase.id} phase={phase} index={i} depth={0} />
        ))}
      </div>
    </div>
  );
}

function PhaseNode({ phase, index, depth }: { phase: PlanNode; index: number; depth: number }) {
  const statusIcon = {
    completed: <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-emerald-500" />,
    in_progress: <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 text-blue-500" />,
    pending: <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-muted-foreground/50" />,
    skipped: <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-muted-foreground/30" />,
  };

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div className={cn(
        "flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors",
        phase.status === "in_progress" && "bg-blue-500/5 border border-blue-500/15",
        phase.status === "completed" && "opacity-70",
        phase.status === "skipped" && "opacity-40",
      )}>
        <div className="shrink-0 mt-0.5">
          {statusIcon[phase.status]}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-xs font-medium",
            phase.status === "completed" && "line-through text-muted-foreground",
            phase.status === "skipped" && "line-through text-muted-foreground/50",
          )}>
            <span className="text-muted-foreground/50 mr-1.5">{index + 1}.</span>
            {phase.title}
          </p>
          {phase.description && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">
              {phase.description}
            </p>
          )}
        </div>
      </div>
      {phase.children?.map((child, ci) => (
        <PhaseNode key={child.id} phase={child} index={ci} depth={depth + 1} />
      ))}
    </div>
  );
}

/* ─── Mermaid / architecture panel ─── */

function MermaidPanel({ data }: { data: Record<string, unknown> }) {
  const code = (data.code as string) ?? "";
  const title = (data.title as string) ?? "Diagram";
  const [svg, setSvg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!code) return;
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          securityLevel: "strict",
        });
        const id = `mermaid-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
            <pre className="whitespace-pre-wrap font-mono">{error}</pre>
          </div>
        ) : svg ? (
          <div
            className="[&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            Rendering diagram...
          </div>
        )}

        {/* Show raw code for copy */}
        <details className="mt-4">
          <summary className="text-[10px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground">
            View source
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-muted/50 text-[10px] font-mono text-muted-foreground overflow-x-auto">
            {code}
          </pre>
        </details>
      </div>
    </div>
  );
}

/* ─── Architecture panel (interactive XY Flow) ─── */

function ArchitecturePanel({ data }: { data: Record<string, unknown> }) {
  const title = (data.title as string) ?? "Architecture";
  const description = (data.description as string) ?? "";
  const nodes = (data.nodes ?? []) as Array<{ id: string; label: string; type?: string; description?: string }>;
  const edges = (data.edges ?? []) as Array<{ source: string; target: string; label?: string }>;

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        </div>
        <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
          <HugeiconsIcon icon={StructureCheckIcon} className="size-8 opacity-30" />
          <p className="text-xs">Architecture will appear here</p>
        </div>
      </div>
    );
  }

  // Render as a structured list with connections (lightweight — no React Flow for simple views)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const typeColors: Record<string, string> = {
    frontend: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    backend: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    database: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    service: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
    external: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {nodes.map((node) => {
          const outgoing = edges.filter((e) => e.source === node.id);
          const colorClass = typeColors[node.type ?? "service"] ?? typeColors.service;

          return (
            <div key={node.id} className={cn("rounded-lg border p-2.5", colorClass)}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{node.label}</span>
                {node.type && (
                  <span className="text-[9px] opacity-60 uppercase tracking-wider">{node.type}</span>
                )}
              </div>
              {node.description && (
                <p className="text-[10px] opacity-70 mt-0.5">{node.description}</p>
              )}
              {outgoing.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {outgoing.map((edge, i) => {
                    const target = nodeMap.get(edge.target);
                    return (
                      <span key={i} className="inline-flex items-center gap-0.5 text-[9px] opacity-50">
                        <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5" />
                        {target?.label ?? edge.target}
                        {edge.label && <span className="opacity-60">({edge.label})</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main panel wrapper ─── */

export function ChatPanelRenderer() {
  const { panel } = useChatStore();

  return (
    <AnimatePresence mode="wait">
      {panel && (
        <motion.div
          key={panel.id}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className="relative shrink-0 border-l border-border/40 bg-background overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={closePanel}
            className="absolute top-3 right-3 z-10 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>

          {/* Panel content */}
          <div className="h-full">
            {panel.type === "plan" && <PlanTreePanel data={panel.data} />}
            {panel.type === "mermaid" && <MermaidPanel data={panel.data} />}
            {panel.type === "architecture" && <ArchitecturePanel data={panel.data} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
