"use client";

import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Edit02Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Image01Icon,
  MoreVerticalIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_CONFIG, staggerItem } from "./memory-constants";
import type { MemoryWithProject } from "@/lib/memory-actions";
import type { MemoryTier } from "@/lib/supabase/types";

export function MemoryRow({
  memory,
  onEdit,
  onDelete,
  onChangeTier,
  showProject,
}: {
  memory: MemoryWithProject;
  onEdit: () => void;
  onDelete: () => void;
  onChangeTier: (tier: MemoryTier) => void;
  showProject?: boolean;
}) {
  const catConf = CATEGORY_CONFIG[memory.category];
  const displayContent =
    memory.tier === "archive" && memory.compressed_content
      ? memory.compressed_content
      : memory.content;

  const isGlobal = !memory.project_id;

  return (
    <motion.div
      layout
      variants={staggerItem}
      exit={{ opacity: 0, x: -8 }}
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 rounded-lg"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-medium text-foreground truncate">
            {memory.title}
          </p>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 h-4.5 shrink-0"
          >
            {catConf.label}
          </Badge>
          {showProject && memory.project_name && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 h-4.5 shrink-0 border-border/40"
            >
              {memory.project_name}
            </Badge>
          )}
          {showProject && isGlobal && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 h-4.5 shrink-0 border-border/40 text-muted-foreground/60"
            >
              Global
            </Badge>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">
          {displayContent}
        </p>
        {memory.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {memory.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-muted-foreground/60"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="text-[10px] tabular-nums text-muted-foreground/50 shrink-0 pt-0.5">
        {memory.token_count}t
      </span>

      {memory.image_count > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 shrink-0 pt-0.5">
          <HugeiconsIcon icon={Image01Icon} className="size-3" />
          {memory.image_count}
        </span>
      )}

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit memory">
          <HugeiconsIcon
            icon={Edit02Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Memory options">
              <HugeiconsIcon
                icon={MoreVerticalIcon}
                strokeWidth={2}
                className="size-3.5"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {memory.tier !== "core" && (
              <DropdownMenuItem onClick={() => onChangeTier("core")}>
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="mr-2 size-3.5" />
                Move to Core
              </DropdownMenuItem>
            )}
            {memory.tier !== "active" && (
              <DropdownMenuItem onClick={() => onChangeTier("active")}>
                {memory.tier === "archive" ? (
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="mr-2 size-3.5" />
                ) : (
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="mr-2 size-3.5" />
                )}
                Move to Active
              </DropdownMenuItem>
            )}
            {memory.tier !== "archive" && (
              <DropdownMenuItem onClick={() => onChangeTier("archive")}>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="mr-2 size-3.5" />
                Move to Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="mr-2 size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
