"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MessageMultiple02Icon, PencilEdit02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ConversationSummary } from "@/lib/chat-store";

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (c: ConversationSummary) => void;
  onNew: () => void;
  onDelete?: (c: ConversationSummary) => void;
  compact?: boolean;
}

export function ConversationList({ conversations, activeId, onSelect, onNew, onDelete, compact }: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center p-4">
        <HugeiconsIcon icon={MessageMultiple02Icon} className="size-6 text-muted-foreground/30" />
        <p className="text-[11px] text-muted-foreground/50">No conversations yet</p>
      </div>
    );
  }

  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  const groups: { label: string; items: ConversationSummary[] }[] = [];
  let currentLabel = "";
  let currentItems: ConversationSummary[] = [];

  for (const c of conversations) {
    const d = new Date(c.createdAt).toDateString();
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (label !== currentLabel) {
      if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });
      currentLabel = label;
      currentItems = [c];
    } else {
      currentItems.push(c);
    }
  }
  if (currentItems.length > 0) groups.push({ label: currentLabel, items: currentItems });

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.label}>
          <div className={cn("px-4 pt-3 pb-1", compact ? "text-[10px]" : "text-[11px]")}>
            <span className="font-medium text-muted-foreground/50 uppercase tracking-wider">{group.label}</span>
          </div>
          {group.items.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group relative w-full text-left px-4 py-2.5 transition-colors hover:bg-accent/50",
                c.id === activeId && "bg-accent/70",
              )}
            >
              <button
                onClick={() => onSelect(c)}
                className="w-full text-left"
              >
                <p className={cn("font-medium text-foreground truncate pr-6", compact ? "text-[12px]" : "text-[13px]")}>
                  {c.title}
                </p>
                <p className={cn("text-muted-foreground/60 truncate mt-0.5", compact ? "text-[10px]" : "text-[11px]")}>
                  {c.preview}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-muted-foreground/40">
                    {new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {c.source !== "web" && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground/40">
                      {c.source}
                    </Badge>
                  )}
                </div>
              </button>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                  className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 rounded-md p-1 text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-all"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ConversationListHeader({ onNew, compact }: { onNew: () => void; compact?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-4 border-b border-border/30", compact ? "py-2.5" : "py-3")}>
      <span className={cn("font-medium text-muted-foreground", compact ? "text-xs" : "text-xs font-semibold text-foreground")}>
        Conversations
      </span>
      <button
        onClick={onNew}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3" />
        {compact ? "New" : "New chat"}
      </button>
    </div>
  );
}
