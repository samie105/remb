"use client";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatModel, ModelUsage } from "@/lib/chat-store";

interface ModelSelectorProps {
  modelMode: ChatModel;
  usage: ModelUsage[];
  onModelChange: (model: ChatModel) => void;
  compact?: boolean;
}

export function ModelSelector({ modelMode, usage, onModelChange, compact }: ModelSelectorProps) {
  const models: { key: ChatModel; label: string; shortLabel: string }[] = [
    { key: "gpt-4.1", label: "GPT-4.1", shortLabel: "4.1" },
    { key: "o4-mini", label: "o4-mini", shortLabel: "o4" },
  ];

  return (
    <div className={cn("flex items-center gap-1", compact ? "scale-90 origin-left" : "")}>
      <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
        {models.map((m) => {
          const isActive = modelMode === m.key;
          const u = usage.find((x) => x.model === m.key);
          const exhausted = u ? u.remaining <= 0 : false;

          return (
            <Tooltip key={m.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !exhausted && onModelChange(m.key)}
                  disabled={exhausted}
                  className={cn(
                    "relative rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : exhausted
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                  )}
                >
                  {compact ? m.shortLabel : m.label}
                  {u && (
                    <span className={cn(
                      "ml-1 text-[9px] tabular-nums",
                      u.remaining <= 1 ? "text-amber-500" : "text-muted-foreground/50",
                    )}>
                      {u.remaining}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                {m.label} — {u ? `${u.remaining}/${u.limit} remaining today` : "Loading..."}
                {exhausted && " (exhausted)"}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
