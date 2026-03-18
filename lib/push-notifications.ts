"use client";

import * as React from "react";
import { addNotification } from "@/components/dashboard/notification-center";

/* ─── Push Notification Utilities ─── */

/**
 * Check if push notifications are supported in the current browser.
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Get the current notification permission status.
 */
export function getPermissionStatus(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Request notification permission from the user.
 * Returns the resulting permission status.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";

  const result = await Notification.permission;
  if (result === "granted") return "granted";

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribe the user to push notifications via the service worker.
 * Returns the PushSubscription if successful.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) return existingSubscription;

    // Create a new subscription with a placeholder VAPID key
    // In production, replace with your actual VAPID public key
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn("VAPID public key not configured. Push notifications will use local notifications only.");
      return null;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });

    return subscription;
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      return await subscription.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a local notification (bypassing push, for in-app use).
 */
export function sendLocalNotification(title: string, options?: NotificationOptions) {
  if (!isPushSupported() || Notification.permission !== "granted") return;

  navigator.serviceWorker.ready.then((registration) => {
    registration.showNotification(title, {
      icon: "/icons/icon-192x192.svg",
      badge: "/icons/icon-72x72.svg",
      ...options,
    });
  });
}

/* ─── Helpers ─── */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* ─── Hook: useNotificationPermission ─── */
export function useNotificationPermission() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("unsupported");

  React.useEffect(() => {
    setPermission(getPermissionStatus());
  }, []);

  const requestPermission = React.useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);

    if (result === "granted") {
      addNotification({
        type: "success",
        title: "Notifications enabled",
        message: "You'll now receive push notifications for important updates.",
      });

      // Try to subscribe to push
      await subscribeToPush();
    }

    return result;
  }, []);

  return { permission, requestPermission, isPushSupported: isPushSupported() };
}
