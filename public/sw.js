/*
 * WitUS Triage Agent — service worker (offline-first, STYLEGUIDE §2).
 *
 * Deliberately conservative:
 *  - immutable static assets (/_next/static, /brand) are cached-first;
 *  - navigations are network-first with an offline fallback page;
 *  - API requests are never intercepted (always fresh; the UI handles offline
 *    explicitly so a stale approval can never be shown or queued).
 */
const CACHE = "witus-triage-v1";
const PRECACHE = [
  "/offline.html",
  "/brand/witus/logomark.svg",
  "/brand/witus/wordmark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable static assets — cache-first.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/brand")
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations — network-first, offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline.html")
          .then((r) => r || new Response("Offline", { status: 503 })),
      ),
    );
  }
});
