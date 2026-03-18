"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Notification02Icon,
  CheckmarkCircle01Icon,
  Alert01Icon,
  InformationCircleIcon,
  ScanIcon,
  FolderLibraryIcon,
  TaskEdit01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  useNotificationPermission,
  isPushSupported,
} from "@/lib/push-notifications";

const NOTIFICATION_CHANNELS = [
  {
    id: "notify-scan",
    label: "Scan completions",
    description: "Get notified when a project scan finishes.",
    icon: ScanIcon,
  },
  {
    id: "notify-project",
    label: "Project updates",
    description: "Activity and status changes in your projects.",
    icon: FolderLibraryIcon,
  },
  {
    id: "notify-feature",
    label: "Feature changes",
    description: "When features are added, updated, or archived.",
    icon: TaskEdit01Icon,
  },
] as const;

export function NotificationSettings() {
  const { permission, requestPermission } = useNotificationPermission();
  const supported = isPushSupported();

  /* ── Not supported ── */
  if (!supported) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">Not available</p>
          <p className="text-[11px] text-muted-foreground">
            Push notifications are not supported in this browser.
          </p>
        </div>
      </div>
    );
  }

  /* ── Permission denied ── */
  if (permission === "denied") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 border border-destructive/20">
          <HugeiconsIcon
            icon={Alert01Icon}
            strokeWidth={2}
            className="size-3.5 text-destructive"
          />
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">Notifications blocked</p>
          <p className="text-[11px] text-muted-foreground">
            Notifications are blocked by your browser. Open browser settings to allow notifications for this site.
          </p>
        </div>
      </div>
    );
  }

  /* ── Permission not granted yet ── */
  if (permission !== "granted") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-xl border border-dashed border-border/60">
        <div className="flex size-10 items-center justify-center rounded-xl bg-foreground/5 border border-border/40">
          <HugeiconsIcon
            icon={Notification02Icon}
            strokeWidth={1.6}
            className="size-5 text-foreground/50"
          />
        </div>
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-foreground">Enable push notifications</p>
          <p className="text-[12px] text-muted-foreground max-w-xs">
            Get notified about scan completions, project updates, and feature changes.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 mt-1" onClick={requestPermission}>
          <HugeiconsIcon icon={Notification02Icon} strokeWidth={2} className="size-3.5" />
          Allow notifications
        </Button>
      </div>
    );
  }

  /* ── Granted — channel toggles ── */
  return (
    <div className="space-y-5">
      {/* Status row */}
      <div className="flex items-center gap-2.5 px-1">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          strokeWidth={2}
          className="size-3.5 text-emerald-500"
        />
        <p className="text-[12px] text-muted-foreground">
          Push notifications are enabled for this browser.
        </p>
      </div>

      {/* Channel toggles */}
      <div className="rounded-xl border border-border/40 divide-y divide-border/40 overflow-hidden">
        {NOTIFICATION_CHANNELS.map((channel, i) => (
          <React.Fragment key={channel.id}>
            <label
              htmlFor={channel.id}
              className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-foreground/5">
                  <HugeiconsIcon
                    icon={channel.icon}
                    strokeWidth={2}
                    className="size-3.5 text-foreground/60"
                  />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">{channel.label}</p>
                  <p className="text-[11px] text-muted-foreground">{channel.description}</p>
                </div>
              </div>
              <Switch id={channel.id} defaultChecked />
            </label>
            {i < NOTIFICATION_CHANNELS.length - 1 && <Separator className="opacity-0" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ─── Prompt Banner (shown at top of dashboard) ─── */
export function NotificationPromptBanner() {
  const { permission, requestPermission } = useNotificationPermission();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const wasDismissed = localStorage.getItem("remb:notification-prompt-dismissed");
    if (wasDismissed) setDismissed(true);
  }, []);

  if (!isPushSupported() || permission !== "default" || dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("remb:notification-prompt-dismissed", "true");
  }

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
          <HugeiconsIcon
            icon={Notification02Icon}
            strokeWidth={2}
            className="size-4 text-blue-600 dark:text-blue-400"
          />
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">
            Stay up to date
          </p>
          <p className="text-[11px] text-muted-foreground">
            Enable push notifications to get alerts about scan completions and project updates.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="xs"
          className="text-[11px] text-muted-foreground"
          onClick={handleDismiss}
        >
          Later
        </Button>
        <Button
          size="xs"
          className="gap-1"
          onClick={async () => {
            await requestPermission();
            handleDismiss();
          }}
        >
          Enable
        </Button>
      </div>
    </div>
  );
}
