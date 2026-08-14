/* Gradr service worker — offline support.
 *
 * Strategy
 * - Navigations: network-first, fall back to the cached app shell, then /offline.html.
 * - Hashed build assets (/assets/*): cache-first (immutable, content-hashed).
 * - Static brand/icon files: stale-while-revalidate.
 * - Everything else (API, auth, functions, analytics): never cached, never intercepted.
 */

const VERSION = "gradr-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const STATIC_CACHE = `${VERSION}-static`;

const SHELL_URL = "/index.html";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/favicon.png",
  "/gradr-logo.png",
  "/gradr-logo.svg",
  "/site.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE).catch(() => {});
      const shell = await caches.open(SHELL_CACHE);
      await shell.add(SHELL_URL).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStatic(pathname) {
  return /\.(png|jpg|jpeg|svg|webp|ico|woff2?|webmanifest|txt|xml)$/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle same-origin traffic; APIs/CDNs stay untouched.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/functions/") || url.pathname.startsWith("/rest/")) return;

  // App shell navigations
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(SHELL_URL, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return (
            (await caches.match(SHELL_URL)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  // Immutable hashed build output
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })(),
    );
    return;
  }

  // Static brand assets: serve cached instantly, refresh in background
  if (isStatic(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()).catch(() => {}));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});
