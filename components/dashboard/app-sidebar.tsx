"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  WorkflowSquare10Icon,
  Search01Icon,
  CommandLineIcon,
  ApiIcon,
  BookOpen01Icon,
  Settings01Icon,
  Logout01Icon,
  PlusSignIcon,
  PlugSocketIcon,
  BrainIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth";
import type { DashboardUser } from "@/components/dashboard/shell";

/** Static routes that are NOT dynamic project routes */
const STATIC_DASHBOARD_ROUTES = new Set(["settings", "memory", "api", "cli", "docs", "mcp", "auth"]);

/** Extract project slug from pathname like /dashboard/[slug] or /dashboard/[slug]/visualizer */
function extractProjectSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  // segments[0] = "dashboard", segments[1] = slug or static route
  if (segments.length >= 2 && segments[0] === "dashboard" && !STATIC_DASHBOARD_ROUTES.has(segments[1])) {
    return segments[1];
  }
  return null;
}

const mainNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: DashboardSquare01Icon,
    projectAware: true, // becomes /dashboard/[slug] when project active
  },
  {
    label: "Visualizer",
    href: "/dashboard/visualizer",
    icon: WorkflowSquare10Icon,
    badge: "Beta",
    projectAware: true, // becomes /dashboard/[slug]/visualizer
  },
  {
    label: "MCP Hub",
    href: "/dashboard/mcp",
    icon: PlugSocketIcon,
    badge: "New",
  },
  {
    label: "Memory",
    href: "/dashboard/memory",
    icon: BrainIcon,
    badge: "New",
    projectAware: true, // becomes /dashboard/[slug]/memory when project active
  },
  // {
  //   label: "Presentation",
  //   href: "/dashboard/presentation",
  //   icon: Video01Icon,
  //   projectAware: true,
  // },
];

const resourceNavItems = [
  // { label: "API", href: "/dashboard/api", icon: ApiIcon },
  // { label: "CLI Reference", href: "/dashboard/cli", icon: CommandLineIcon },
  // { label: "Docs", href: "/dashboard/docs", icon: BookOpen01Icon },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings01Icon,
    projectAware: true,
  },
];

export function AppSidebar({ user }: { user: DashboardUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const activeSlug = extractProjectSlug(pathname);

  // ⌘K keyboard shortcut
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setSearchQuery("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const allNavItems = [...mainNavItems, ...resourceNavItems] as Array<{ label: string; href: string; icon: typeof Search01Icon; badge?: string; projectAware?: boolean }>;

  /** Build a nav href that preserves the active project in the path */
  function navHref(item: { href: string; projectAware?: boolean }) {
    if (activeSlug && item.projectAware) {
      // /dashboard → /dashboard/[slug], /dashboard/visualizer → /dashboard/[slug]/visualizer
      const suffix = item.href === "/dashboard" ? "" : item.href.replace("/dashboard", "");
      return `/dashboard/${activeSlug}${suffix}`;
    }
    return item.href;
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/auth");
  }

  return (
    <>
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="px-3 pt-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden px-1"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground">
            <span className="text-xs font-bold text-background">C</span>
          </div>
          {!isCollapsed && (
            <span className="text-[15px] font-semibold tracking-[-0.03em] text-sidebar-foreground whitespace-nowrap">
              Remb
            </span>
          )}
        </Link>
      </SidebarHeader>

      {/* Search action */}
      <div className="px-3 pb-1">
        {!isCollapsed ? (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2 text-muted-foreground"
              onClick={() => { setSearchOpen(true); setSearchQuery(""); }}
            >
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-3.5" />
              <span className="text-xs">Search...</span>
              <kbd className="pointer-events-none ml-auto inline-flex h-4 select-none items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-1 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Settings"
              onClick={() => router.push(activeSlug ? `/dashboard/${activeSlug}/settings` : "/dashboard/settings")}
            >
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="size-3.5" />
            </Button>
          </div>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Search ⌘K" asChild>
                <button>
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4" />
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </div>

      <SidebarSeparator />

      {/* Navigation */}
      <SidebarContent>
        {/* Main group */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((navItem) => {
                const resolvedHref = navHref(navItem);
                // Dashboard is active when on /dashboard or /dashboard/[slug] (not sub-pages)
                // Visualizer active when path ends with /visualizer
                const isActive = navItem.label === "Dashboard"
                  ? pathname === "/dashboard" || (!!activeSlug && pathname === `/dashboard/${activeSlug}`)
                  : pathname === resolvedHref || pathname.startsWith(resolvedHref + "/");

                return (
                  <SidebarMenuItem key={navItem.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={navItem.label}
                      className={cn(
                        "relative transition-all duration-200",
                        isActive && "font-medium"
                      )}
                    >
                      <Link href={resolvedHref}>
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-active-indicator"
                            className="absolute inset-0 rounded-[calc(var(--radius-sm)+2px)] bg-sidebar-accent"
                            transition={{
                              type: "spring",
                              stiffness: 380,
                              damping: 30,
                            }}
                          />
                        )}
                        <HugeiconsIcon
                          icon={navItem.icon}
                          strokeWidth={2}
                          className="relative z-10 size-4"
                        />
                        <span className="relative z-10">{navItem.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {navItem.badge && !isCollapsed && (
                      <SidebarMenuBadge>
                        <Badge
                          variant="secondary"
                          className="h-4 text-[9px] px-1.5"
                        >
                          {navItem.badge}
                        </Badge>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Resources group */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Resources
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {resourceNavItems.map((navItem) => {
                const resolvedHref = navHref(navItem);
                const isActive = pathname === resolvedHref || pathname.startsWith(resolvedHref + "/");

                return (
                  <SidebarMenuItem key={navItem.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={navItem.label}
                      className={cn(
                        "transition-all duration-200",
                        isActive && "font-medium"
                      )}
                    >
                      <Link href={resolvedHref}>
                        <HugeiconsIcon
                          icon={navItem.icon}
                          strokeWidth={2}
                          className="size-4"
                        />
                        <span>{navItem.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: Profile + Logout */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={user.name}
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar size="sm">
                    <AvatarImage
                      src={user.avatarUrl}
                      alt={user.name}
                    />
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-xs leading-tight">
                    <span className="truncate font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="truncate text-muted-foreground text-[11px]">
                      {user.email ?? `@${user.login}`}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isCollapsed ? "right" : "top"}
                align="start"
                className="w-52"
              >
                <div className="px-2 py-2">
                  <p className="text-[13px] font-medium text-foreground">
                    {user.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.email ?? `@${user.login}`}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <HugeiconsIcon
                      icon={Settings01Icon}
                      strokeWidth={2}
                      className="mr-2 size-3.5"
                    />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <HugeiconsIcon
                    icon={Logout01Icon}
                    strokeWidth={2}
                    className="mr-2 size-3.5"
                  />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    {/* ⌘K Search palette */}
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search pages, features, settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 h-8 text-[13px] px-0"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-75 overflow-y-auto p-1.5">
          {allNavItems
            .filter((item) =>
              searchQuery
                ? item.label.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            )
            .map((item) => {
              const resolvedHref = navHref(item);
              return (
                <button
                  key={item.label}
                  type="button"
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    router.push(resolvedHref);
                    setSearchOpen(false);
                  }}
                >
                  <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-4 text-muted-foreground" />
                  <span className="text-[13px] text-foreground">{item.label}</span>
                  {item.badge && (
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5 ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          {searchQuery && allNavItems.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
            <div className="py-8 text-center">
              <p className="text-[12px] text-muted-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
