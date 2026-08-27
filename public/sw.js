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
