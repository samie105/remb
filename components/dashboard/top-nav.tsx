"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Notification02Icon,
  Home01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { GitStatus } from "@/components/dashboard/git-status";
import { ProjectSwitcher } from "@/components/dashboard/project-switcher";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { useProjectStore } from "@/lib/project-store";
import type { DashboardUser } from "@/components/dashboard/shell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbEntry {
  label: string;
  href?: string;
}

function generateBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbEntry[] = [];

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const label = segments[i]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    crumbs.push({
      label,
      href: i < segments.length - 1 ? currentPath : undefined,
    });
  }

  return crumbs;
}

/** Static routes that are NOT dynamic project routes */
const STATIC_DASHBOARD_ROUTES = new Set(["settings", "memory", "api", "cli", "docs", "mcp", "auth"]);

function extractProjectSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0] === "dashboard" && !STATIC_DASHBOARD_ROUTES.has(segments[1])) {
    return segments[1];
  }
  return null;
}

export function TopNav({ user }: { user: DashboardUser }) {
  const pathname = usePathname();
  const crumbs = generateBreadcrumbs(pathname);
  const { projects } = useProjectStore();

  // Derive active project from URL route
  const slug = extractProjectSlug(pathname);
  const activeProject = slug ? projects.find((p) => p.slug === slug) ?? null : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-border/40 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60">
      <div className="flex w-full items-center justify-between gap-2 px-4">
        {/* Left: trigger + project switcher + breadcrumbs */}
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="mr-1 h-4 shrink-0" />

          <ProjectSwitcher />

          <Separator orientation="vertical" className="mx-1 h-4 hidden sm:block shrink-0" />

          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                const isFirst = index === 0;

                return (
                  <React.Fragment key={crumb.label + index}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage className="text-[13px] font-medium">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link
                            href={crumb.href!}
                            className="flex items-center gap-1.5 text-[13px]"
                          >
                            {isFirst && (
                              <HugeiconsIcon
                                icon={Home01Icon}
                                strokeWidth={2}
                                className="size-3.5"
                              />
                            )}
                            {crumb.label}
                          </Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {isLast && <BreadcrumbSeparator className="hidden md:flex" />}
                  </React.Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <ThemeToggle />

          <GitStatus
            isConnected={!!activeProject?.repo_name}
            repo={activeProject?.repo_name}
            repoUrl={activeProject?.repo_url}
            branch={activeProject?.branch}
          />

          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}
