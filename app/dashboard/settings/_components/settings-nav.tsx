"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserCircleIcon,
  Key01Icon,
  Notification02Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const SETTINGS_TABS = [
  { id: "account", label: "Account", icon: UserCircleIcon, segment: "account" },
  { id: "api-keys", label: "API Keys", icon: Key01Icon, segment: "api-keys" },
  { id: "notifications", label: "Notifications", icon: Notification02Icon, segment: "notifications" },
  { id: "security", label: "Security", icon: ShieldKeyIcon, segment: "security" },
] as const;

export function SettingsNav({ basePath }: { basePath: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-border/40 -mx-1 px-1">
      {SETTINGS_TABS.map(({ id, label, icon, segment }) => {
        const href = `${basePath}/${segment}`;
        const isActive =
          pathname === href || pathname.startsWith(href + "/");

        return (
          <Link
            key={id}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-[13px] transition-colors relative",
              "hover:text-foreground",
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            <HugeiconsIcon
              icon={icon}
              strokeWidth={2}
              className="size-3.5 shrink-0"
            />
            {label}
            {isActive && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-foreground" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
