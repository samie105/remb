"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Radar01Icon,
  BrainIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface NewScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: (includeMemories: boolean) => void;
}

export function NewScanModal({
  open,
  onOpenChange,
  projectName,
  onConfirm,
}: NewScanModalProps) {
  const [includeMemories, setIncludeMemories] = React.useState(true);

  React.useEffect(() => {
    if (open) setIncludeMemories(true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader className="gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5 border border-border/40">
                <HugeiconsIcon
                  icon={Radar01Icon}
                  strokeWidth={2}
                  className="size-5 text-foreground/70"
                />
              </div>
              <div className="text-left">
                <DialogTitle className="text-[15px]">New Scan</DialogTitle>
                <DialogDescription className="text-[12px] mt-0.5">
                  Scan {projectName} for codebase changes
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <Separator />

        {/* Memory generation toggle */}
        <div className="px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-foreground/5 border border-border/40 shrink-0 mt-0.5">
              <HugeiconsIcon
                icon={BrainIcon}
                strokeWidth={2}
                className="size-4 text-foreground/60"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Generate AI Memories
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    After the scan completes, analyze code patterns to create
                    reusable memories for AI agents.
                  </p>
                </div>
                <Switch
                  checked={includeMemories}
                  onCheckedChange={setIncludeMemories}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              onConfirm(includeMemories);
              onOpenChange(false);
            }}
          >
            <HugeiconsIcon
              icon={Radar01Icon}
              strokeWidth={2}
              className="size-3"
            />
            Start Scan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
