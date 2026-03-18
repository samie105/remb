"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Notification02Icon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  Alert02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ─── Types ─── */
export interface AppNotification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  read: boolean;
  timestamp: Date;
  action?: { label: string; onClick: () => void };
}

/* ─── External store ─── */
let listeners: Array<() => void> = [];
let notifications: AppNotification[] = [];

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return notifications;
}

const SERVER_SNAPSHOT: AppNotification[] = [];
function getServerSnapshot(): AppNotification[] {
  return SERVER_SNAPSHOT;
}

export function addNotification(
  notification: Omit<AppNotification, "id" | "read" | "timestamp">
) {
  const newNotification: AppNotification = {
    ...notification,
    id: crypto.randomUUID(),
    read: false,
    timestamp: new Date(),
  };
  notifications = [newNotification, ...notifications];
  emitChange();

  // Fire push notification via service worker if permitted
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    Notification.permission === "granted"
  ) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(notification.title, {
        body: notification.message,
        icon: "/icons/icon-192x192.svg",
        badge: "/icons/icon-72x72.svg",
        tag: newNotification.id,
      });
    }).catch(() => {
      // Fallback to basic notification
      new Notification(notification.title, { body: notification.message });
    });
  }
}

export function markAsRead(id: string) {
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  emitChange();
}

export function markAllAsRead() {
  notifications = notifications.map((n) => ({ ...n, read: true }));
  emitChange();
}

export function removeNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id);
  emitChange();
}

export function clearAllNotifications() {
  notifications = [];
  emitChange();
}

/* ─── Hook ─── */
export function useNotifications() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ─── Icon map ─── */
function notificationIcon(type: AppNotification["type"]) {
  switch (type) {
    case "success":
      return CheckmarkCircle01Icon;
    case "warning":
      return Alert02Icon;
    case "error":
      return Alert02Icon;
    default:
      return InformationCircleIcon;
  }
}

function notificationColor(type: AppNotification["type"]) {
  switch (type) {
    case "success":
      return "text-blue-600 dark:text-blue-400 bg-blue-500/10";
    case "warning":
      return "text-amber-600 dark:text-amber-400 bg-amber-500/10";
    case "error":
      return "text-red-600 dark:text-red-400 bg-red-500/10";
    default:
      return "text-blue-600 dark:text-blue-400 bg-blue-500/10";
  }
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Component ─── */
export function NotificationCenter() {
  const allNotifications = useNotifications();
  const unreadCount = allNotifications.filter((n) => !n.read).length;
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        >
          <HugeiconsIcon
            icon={Notification02Icon}
            strokeWidth={2}
            className="size-4"
          />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-3.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/30" />
              <span className="relative inline-flex size-3.5 items-center justify-center rounded-full bg-foreground text-[8px] font-bold text-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-semibold text-foreground">Notifications</h4>
            {unreadCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                {unreadCount}
              </span>
            )}
          </div>
          {allNotifications.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="text-[11px] text-muted-foreground"
              onClick={() => markAllAsRead()}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-80">
          {allNotifications.length > 0 ? (
            <div className="p-1">
              <AnimatePresence>
                {allNotifications.map((notification) => {
                  const Icon = notificationIcon(notification.type);
                  const colorClass = notificationColor(notification.type);

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn(
                        "group flex gap-2.5 rounded-md px-3 py-2.5 transition-colors",
                        !notification.read && "bg-muted/30"
                      )}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colorClass)}>
                        <HugeiconsIcon icon={Icon} strokeWidth={2} className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-[13px] leading-tight", !notification.read ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {notification.title}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 -mt-0.5 -mr-1 size-5"
                            aria-label="Dismiss notification"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNotification(notification.id);
                            }}
                          >
                            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          {timeAgo(notification.timestamp)}
                        </p>
                        {notification.action && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="mt-1 h-5 text-[11px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              notification.action!.onClick();
                            }}
                          >
                            {notification.action.label}
                          </Button>
                        )}
                      </div>
                      {!notification.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="py-10 text-center">
              <HugeiconsIcon
                icon={Notification02Icon}
                strokeWidth={1.5}
                className="mx-auto size-8 text-muted-foreground/30 mb-2"
              />
              <p className="text-[13px] font-medium text-foreground mb-0.5">All caught up</p>
              <p className="text-[11px] text-muted-foreground">No new notifications.</p>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {allNotifications.length > 0 && (
          <div className="px-4 py-2 border-t border-border/40">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-[11px] text-muted-foreground"
              onClick={() => clearAllNotifications()}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
