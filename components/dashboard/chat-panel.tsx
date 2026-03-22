"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Layers01Icon,
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

          <div className="h-full">
            {panel.type === "plan" && <PlanTreePanel data={panel.data} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
