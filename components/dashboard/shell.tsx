"use client";

import * as React from "react";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectsProvider } from "@/lib/project-store";
import type { ProjectWithCounts } from "@/lib/project-actions";

export interface DashboardUser {
  name: string;
  login: string;
  avatarUrl: string;
  email?: string;
  plan: string;
}

export function DashboardShell({
  children,
  user,
  initialProjects,
}: {
  children: React.ReactNode;
  user: DashboardUser;
  initialProjects: ProjectWithCounts[];
}) {
  return (
    <ProjectsProvider initialProjects={initialProjects}>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <TopNav user={user} />
          {/* Content area */}
          <div className="flex-1 p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ProjectsProvider>
  );
}
