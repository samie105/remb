/// <reference lib="webworker" />

// This service worker handles push notifications
// next-pwa generates the main sw.js; this file provides push event handling

self.addEventListener("push", (event) => {
  /** @type {PushEvent} */
  const pushEvent = event;
  
  let data = {
    title: "Remb",
    body: "You have a new notification.",
    icon: "/icons/icon-192x192.svg",
    badge: "/icons/icon-72x72.svg",
    url: "/dashboard",
  };

  try {
    if (pushEvent.data) {
      const payload = pushEvent.data.json();
      data = { ...data, ...payload };
    }
  } catch {
    // Use defaults if JSON parsing fails
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [100, 50, 100],
    data: {
      url: data.url,
    },
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  pushEvent.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  /** @type {NotificationEvent} */
  const notifEvent = event;
  
  notifEvent.notification.close();

  if (notifEvent.action === "dismiss") return;

  const url = notifEvent.notification.data?.url || "/dashboard";

  notifEvent.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

// Background sync for offline notification queuing
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-notifications") {
    event.waitUntil(Promise.resolve());
  }
});
