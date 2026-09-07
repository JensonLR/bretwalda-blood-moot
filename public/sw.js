// The PWA shell's worker (backlog 8.9) — deliberately MINIMAL: it exists so
// the install prompt has a worker to point at, and it caches NOTHING. This
// game is a live wire to an authoritative server; a cache serving a stale
// bundle against a moved wire protocol is a whole class of defect this file
// refuses to be able to have. Offline play is not a thing a server-
// authoritative moot can honestly offer, and pretending with a cached shell
// would trade a clear "no connection" for a broken lobby.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// No fetch handler AT ALL: the browser's own network stack serves everything,
// byte for byte, exactly as without this file.

// THE MOOT'S CALL — added 7 Sep 2026 (docs/ONE-CLIENT.md §6.3).
//
// NOTE WHAT IS STILL NOT HERE: a fetch handler. The law above stands whole —
// the browser's own network stack serves everything byte for byte, and no
// cache in this worker can ever serve a stale bundle against a moved wire
// protocol. Push needs a worker to exist; it does not need a cache.
self.addEventListener("push", (event) => {
  let body = "The Moot convenes. Every blow counts for half again.";
  // A push with no body is still a call, and a malformed one must not throw
  // inside a service worker where nobody would ever see the error.
  try { const d = event.data && event.data.json(); if (d && d.body) body = String(d.body); } catch { /* keep the default */ }
  event.waitUntil(self.registration.showNotification("Bretwalda: Blood Moot", {
    body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "moot",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Focus a window this game already has open rather than opening a second
  // one: a live WebSocket against an authoritative server does not want two.
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) return c.focus();
    return self.clients.openWindow("/factions");
  }));
});
