"use client";

import * as React from "react";

/**
 * Registers the push notification service worker alongside next-pwa's main SW.
 * This component should be rendered once in the app layout.
 */
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // next-pwa handles the main service worker registration.
    // We import the push handler script into the existing SW scope via postMessage,
    // or we can rely on next-pwa's custom worker support.
    // For now, just ensure SW is ready and handle any pending push state.

    navigator.serviceWorker.ready.then((registration) => {
      // Listen for messages from the service worker
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "PUSH_RECEIVED") {
          // Could dispatch to in-app notification store here
          console.log("[SW] Push received:", event.data.payload);
        }
      });
    });
  }, []);

  return null;
}
