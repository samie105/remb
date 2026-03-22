"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function EmptyState({ variant = "mini" }: { variant?: "mini" | "full" }) {
  const isFull = variant === "full";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center", isFull ? "py-24" : "h-full")}>
      <div className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/10",
        isFull ? "size-14" : "size-10",
      )}>
        <HugeiconsIcon icon={SparklesIcon} className={cn("text-violet-600 dark:text-violet-400", isFull ? "size-6" : "size-5")} />
      </div>
      <div className="space-y-1">
        {isFull && <p className="text-sm font-medium text-foreground/80">Remb AI</p>}
        <p className={cn("text-muted-foreground/50", isFull ? "text-xs" : "text-[11px]")}>
          Ask about your projects, get diagrams, navigate — anything.
        </p>
      </div>
    </div>
  );
}
