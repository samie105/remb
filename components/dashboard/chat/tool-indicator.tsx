"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  Search01Icon,
  PlusSignCircleIcon,
  Layers01Icon,
  ArrowUp01Icon,
  AnalyticsUpIcon,
  StructureCheckIcon,
  FlowIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface ToolCallEvent {
  id: string;
  name: string;
  status: "calling" | "done";
}

const TOOL_LABELS: Record<string, { label: string; icon: typeof SparklesIcon }> = {
  get_project_context: { label: "Loading context", icon: Search01Icon },
  search_projects: { label: "Searching projects", icon: Search01Icon },
  search_across_projects: { label: "Searching", icon: Search01Icon },
  change_theme: { label: "Changing theme", icon: SparklesIcon },
  navigate: { label: "Navigating", icon: ArrowUp01Icon },
  create_plan: { label: "Creating plan", icon: PlusSignCircleIcon },
  create_phase: { label: "Adding phase", icon: PlusSignCircleIcon },
  list_plans: { label: "Listing plans", icon: Layers01Icon },
  query_knowledge_graph: { label: "Querying graph", icon: Search01Icon },
  search_memories: { label: "Searching memories", icon: Search01Icon },
  get_impact_analysis: { label: "Analyzing impact", icon: AnalyticsUpIcon },
  get_thread_history: { label: "Finding threads", icon: Search01Icon },
  show_plan_tree: { label: "Showing plan", icon: Layers01Icon },
  show_architecture: { label: "Building diagram", icon: StructureCheckIcon },
  show_diagram: { label: "Rendering diagram", icon: FlowIcon },
  trigger_scan: { label: "Triggering scan", icon: AnalyticsUpIcon },
};

/**
 * Minimal tool activity indicator.
 * Shows "Working..." with current tool label while running.
 * Shows "Used N tools" when done. No expandable details.
 */
export function ToolIndicator({ toolCalls, compact }: { toolCalls: ToolCallEvent[]; compact?: boolean }) {
  const allDone = toolCalls.every((tc) => tc.status === "done");
  const currentTool = toolCalls.find((tc) => tc.status === "calling");
  const currentLabel = currentTool
    ? (TOOL_LABELS[currentTool.name]?.label ?? "Working")
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground",
        compact ? "ml-0" : "ml-9",
      )}
    >
      {allDone ? (
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-emerald-500 shrink-0" />
      ) : (
        <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin shrink-0" />
      )}
      <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
        {allDone
          ? `Used ${toolCalls.length} tool${toolCalls.length !== 1 ? "s" : ""}`
          : `${currentLabel}…`}
      </span>
    </motion.div>
  );
}

export type { ToolCallEvent };
