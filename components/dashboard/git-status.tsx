"use client";

import * as React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GithubIcon,
  GitBranchIcon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface GitStatusProps {
  isConnected: boolean;
  repo?: string | null;
  repoUrl?: string | null;
  branch?: string | null;
}

export function GitStatus({
  isConnected,
  repo,
  repoUrl,
  branch,
}: GitStatusProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label={isConnected ? "Git repository (connected)" : "Git repository"}
        >
          <HugeiconsIcon
            icon={GithubIcon}
            strokeWidth={2}
            className="size-4"
          />
          {isConnected && (
            <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400/50 duration-1000" />
              <span className="relative inline-flex size-2.5 rounded-full bg-blue-500 ring-2 ring-background" />
              <span className="sr-only">Connected</span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-lg",
                isConnected
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <HugeiconsIcon
                icon={isConnected ? CheckmarkCircle01Icon : Cancel01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {isConnected ? "Connected" : "Not Connected"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isConnected
                  ? "Repository linked"
                  : "No project selected"}
              </p>
            </div>
          </div>
        </div>
        {isConnected && repo ? (
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Repo
              </span>
              {repoUrl ? (
                <Link
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-mono text-foreground hover:underline flex items-center gap-1.5"
                >
                  <HugeiconsIcon icon={GithubIcon} strokeWidth={2} className="size-3 text-muted-foreground" />
                  {repo}
                </Link>
              ) : (
                <span className="text-[12px] font-mono text-foreground">
                  {repo}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Branch
              </span>
              <span className="text-[12px] font-mono text-foreground flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  strokeWidth={2}
                  className="size-3 text-muted-foreground"
                />
                {branch ?? "main"}
              </span>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[12px] text-muted-foreground">
              {isConnected
                ? "This project has no linked GitHub repository."
                : "Select a project to view its repository status."}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
