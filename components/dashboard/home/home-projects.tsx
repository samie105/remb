"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  ArrowUpRight01Icon,
  Clock01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { item, timeAgo } from "./shared";
import type { ProjectWithCounts } from "@/lib/project-actions";

function getFaviconUrl(websiteUrl: string): string {
  try {
    const { hostname } = new URL(websiteUrl);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return "";
  }
}

function ProjectAvatar({ project }: { project: ProjectWithCounts }) {
  const [imgError, setImgError] = React.useState(false);
  const faviconUrl = project.website_url && !imgError ? getFaviconUrl(project.website_url) : "";

  if (faviconUrl) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 overflow-hidden">
        <Image
          src={faviconUrl}
          alt={project.name}
          width={32}
          height={32}
          className="size-8 object-contain"
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-foreground">
      <span className="text-xs font-semibold">
        {project.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

interface HomeProjectsProps {
  projects: ProjectWithCounts[];
}

export function HomeProjects({ projects }: HomeProjectsProps) {
  return (
    <motion.div variants={item} className="lg:col-span-3">
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <HugeiconsIcon
                icon={Folder01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              Projects
            </CardTitle>
            {projects.length > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px] px-2">
                {projects.length}
              </Badge>
            )}
          </div>
          <CardDescription className="text-[12px]">
            Your active projects and context health.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-16">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/5 mb-3">
                <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs text-center">
                Import a repo from the project switcher to get started.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
              {projects.slice(0, 5).map((project) => (
                <Link key={project.id} href={`/dashboard/${project.slug}`}>
                  <div className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-200 hover:bg-muted/30">
                    <ProjectAvatar project={project} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-medium text-foreground truncate">
                          {project.name}
                        </h3>
                        {project.status === "scanning" && (
                          <span className="flex items-center gap-1">
                            <span className="relative flex size-1.5">
                              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500/40" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {project.repo_name ?? project.description ?? "No description"}
                      </p>
                    </div>
                    <div className="hidden sm:flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-foreground">{project.feature_count}</p>
                        <p className="text-[10px]">features</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-foreground">{project.entry_count}</p>
                        <p className="text-[10px]">entries</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                        <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-2.5" />
                        {timeAgo(project.updated_at)}
                      </span>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      className="size-3.5 text-muted-foreground/30 transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
