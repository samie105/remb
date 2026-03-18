# Remb Dashboard — Context Tracker

> This file tracks all changes across files. Update after each prompt.

---

## Tech Stack

| Layer        | Choice                                      |
| ------------ | ------------------------------------------- |
| Framework    | Next.js 16.1.6 (App Router, Turbopack)      |
| React        | 19.2.3                                      |
| Styling      | Tailwind CSS v4, Shadcn (radix-mira style)  |
| Icons        | @hugeicons/react + @hugeicons/core-free-icons |
| Animation    | framer-motion 12.34.2                        |
| Theming      | next-themes 0.4.6                           |
| Visualizer   | @xyflow/react 12.10.1                       |
| State        | nuqs (URL state), @tanstack/react-query      |

---

## File Map

### App Routes

| Route                          | File                                  | Purpose                                      |
| ------------------------------ | ------------------------------------- | -------------------------------------------- |
| `/`                            | `app/page.tsx`                        | Redirects to `/dashboard`                    |
| `/dashboard`                   | `app/dashboard/page.tsx`              | Main dashboard overview                      |
| `/dashboard/projects`          | `app/dashboard/projects/page.tsx`     | Project cards grid with search/filter        |
| `/dashboard/visualizer`        | `app/dashboard/visualizer/page.tsx`   | n8n-style feature dependency graph           |
| `/dashboard/scanner`           | `app/dashboard/scanner/page.tsx`      | Code scanner stats & history                 |
| `/dashboard/cli`               | `app/dashboard/cli/page.tsx`          | CLI reference with commands/flags/examples   |
| `/dashboard/docs`              | `app/dashboard/docs/page.tsx`         | Documentation hub with search                |
| `/dashboard/settings`          | `app/dashboard/settings/page.tsx`     | Profile, notifications, MCP, CLI config      |

### Layouts

| File                            | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `app/layout.tsx`                | Root — fonts, ThemeProvider, TooltipProvider  |
| `app/dashboard/layout.tsx`      | Dashboard — DashboardShell wrapper           |

### Components — Dashboard

| File                                          | Purpose                                       |
| --------------------------------------------- | --------------------------------------------- |
| `components/dashboard/app-sidebar.tsx`         | Shadcn sidebar, HugeIcons, Dicebear avatar    |
| `components/dashboard/top-nav.tsx`             | SidebarTrigger + Breadcrumb + ThemeToggle      |
| `components/dashboard/shell.tsx`               | SidebarProvider + AppSidebar + SidebarInset    |
| `components/dashboard/dashboard-content.tsx`   | Dashboard overview cards & quick actions       |

### Components — UI (Shadcn)

| File                          | Customisations                                 |
| ----------------------------- | ---------------------------------------------- |
| `components/ui/sidebar.tsx`   | Shadcn sidebar (unmodified)                    |
| `components/ui/breadcrumb.tsx`| Shadcn breadcrumb, ArrowRight01Icon            |
| `components/ui/button.tsx`    | rounded-lg, active:scale-[0.97]               |
| `components/ui/card.tsx`      | rounded-xl, shadow hover lift                  |
| `components/ui/badge.tsx`     | rounded-md, uppercase tracking                 |
| `components/ui/input.tsx`     | rounded-lg, shadow-sm                          |
| `components/ui/textarea.tsx`  | rounded-lg                                     |
| `components/ui/separator.tsx` | bg-border/60                                   |
| `components/ui/sonner.tsx`    | Toast with next-themes integration             |
| `components/ui/tooltip.tsx`   | no arrow, shadow-lg, sideOffset=6              |
| `components/ui/select.tsx`    | Standard shadcn                                |
| `components/ui/label.tsx`     | Standard shadcn                                |
| `components/ui/field.tsx`     | Standard shadcn                                |
| `components/ui/alert-dialog.tsx`| Standard shadcn                              |
| `components/ui/combobox.tsx`  | Standard shadcn                                |
| `components/ui/dropdown-menu.tsx`| Standard shadcn                              |
| `components/ui/input-group.tsx`| Standard shadcn                               |

### Components — Shared

| File                              | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `components/theme-provider.tsx`   | next-themes ThemeProvider wrapper          |
| `components/theme-toggle.tsx`     | Sun/Moon toggle with HugeIcons            |

### Other

| File                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `lib/utils.ts`      | `cn()` helper (clsx + tailwind-merge)          |
| `hooks/use-mobile.ts`| Mobile breakpoint hook (768px)               |
| `app/globals.css`   | oklch theme tokens, scrollbar, font-features   |

---

## Changelog

### Session 1 — Initial Scaffold
- Scaffolded Next.js 16.1.6 project with shadcn radix-mira style
- Installed deps: framer-motion, lucide-react, @tanstack/react-query, nuqs
- Customised shadcn components (button, card, badge, input, etc.)
- Built custom sidebar, top-nav, breadcrumb, shell, dashboard-content
- Build passed

### Session 2 — Major Overhaul
- Replaced all lucide-react icons with HugeIcons (@hugeicons/react + core-free-icons)
- Switched from custom sidebar to shadcn `SidebarProvider` with collapsible="icon"
- Added `next-themes` dark/light mode with ThemeProvider + ThemeToggle
- Rewrote top-nav: SidebarTrigger + shadcn Breadcrumb + ThemeToggle + notifications
- Rewrote shell: SidebarProvider → AppSidebar + SidebarInset pattern
- Added Dicebear avatar in sidebar footer with profile dropdown + logout
- Added framer-motion `layoutId` active indicator on sidebar items
- Fixed breadcrumb always showing (removed `crumbs.length <= 1` early return)
- Set TooltipProvider `delayDuration=0` for instant tooltips on collapsed sidebar
- Built 6 new pages:
  - **Projects** — search/filter, responsive grid, status badges, "Add Project" card
  - **Visualizer** — @xyflow/react with custom FeatureNode, 2 project datasets, drag-drop
  - **Scanner** — stat cards, scan history list, loading animation
  - **CLI Reference** — installation, 6 commands with usage/flags/examples, copy buttons
  - **Docs** — search, 6 sections × 3 articles each
  - **Settings** — profile form, notification toggles, MCP config, CLI config, danger zone
- Fixed Terminal01Icon → CommandLineIcon (Terminal01Icon doesn't exist in HugeIcons)
- Fixed all Tailwind v4 lint warnings (`!class` → `class!` suffix, arbitrary values → utility classes)
- Removed unused imports across all files
- Deleted orphaned old `sidebar.tsx` and `breadcrumb.tsx`
- Build passes: all 11 routes generated as static
