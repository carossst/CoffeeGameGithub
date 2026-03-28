/* global self, caches */
/* sw.js - Service Worker v2.1 */
/* Spec section 8: PWA / Offline / Service Worker */
/**
 * Single source of truth for version:
 * - sw.js is registered with a query string ?v=<WT_CONFIG.version>
 * - the SW reads its own URL to derive the cache version
 */
const SW_VERSION = (() => {
  try {
    const v = new URL(self.location.href).searchParams.get("v");
    if (typeof v !== "string" || !v.trim()) return "";
    const s = v.trim();
    if (!s) return "";
    if (!/^[a-zA-Z0-9._-]{1,32}$/.test(s)) return "";
    return s;
  } catch (_) {
    return "";
  }
})();

const CACHE_PREFIX = "wt";
const CACHE_NAME = SW_VERSION ? `${CACHE_PREFIX}-cache-${SW_VERSION}` : "";

// 8.1 Assets to cache (spec section 8.1)
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./storage.js",
  "./game.js",
  "./ui.js",
  "./pwa.js",
  "./email.js",
  "./footer.js",
  "./main.js",
  "./content.json",
  "./manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-192x192-maskable.png",
  "./icons/icon-512x512.png",
  "./icons/icon-512x512-maskable.png",
  "./icons/icon512x512-rond.png"
];

// Critical assets: if any of these fail to pre-cache, do NOT force-activate immediately.
const CRITICAL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./storage.js",
  "./game.js",
  "./ui.js",
  "./main.js",
  "./content.json"
];
// Install event: cache app shell (resilient: one missing asset must not brick install)
self.addEventListener("install", (event) => {
  if (!CACHE_NAME) return;

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Bust HTTP cache on install: force fresh copies from server.
      // Without this, GitHub Pages' aggressive caching serves stale files.
      const okByUrl = new Map();

      for (const url of ASSETS_TO_CACHE) {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          await cache.put(url, res.clone());
          okByUrl.set(url, true);
        } catch (_) {
          okByUrl.set(url, false);
        }
      }
      const criticalOk = CRITICAL_ASSETS.every((u) => okByUrl.get(u) === true);
      if (criticalOk) {
        await self.skipWaiting();
      }
    })().catch(() => {
      // Fail-closed: don't block the existing SW.
    })
  );
});


// Activate event: clean old caches
self.addEventListener("activate", (event) => {
  if (!CACHE_NAME) return;

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(`${CACHE_PREFIX}-`) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helper: check if request is for Stripe
function isStripeRequest(href) {
  return href.includes("stripe.com") || href.includes("buy.stripe.com");
}

function isContentJson(pathname) {
  return pathname.endsWith("/content.json") || pathname.endsWith("content.json");
}

self.addEventListener("fetch", (event) => {
  if (!CACHE_NAME) return;

  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache Stripe (spec)
  if (isStripeRequest(url.href)) return;

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  // content.json: true stale-while-revalidate
  // Return cached instantly → revalidate in background → next visit gets fresh data.
  if (isContentJson(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);

        // Background revalidation (fire-and-forget)
        const fetchPromise = fetch(req)
          .then(async (res) => {
            if (res && res.ok) await cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        // Stale: return cache immediately if available
        if (cached) return cached;

        // Cold start (first visit, no cache): wait for network
        const res = await fetchPromise;
        if (res && res.ok) return res;

        return new Response(
          JSON.stringify({ error: "CONTENT_UNAVAILABLE" }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store"
            }
          }
        );
      })()
    );
    return;
  }

  // App shell + static: cache-first, then network, then fallback navigation
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        // cache: "reload" reduces “weird” intermediary caching issues on updates.
        const res = await fetch(req, { cache: "reload" });
        if (res && res.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, res.clone());
        }
        return res;
      } catch (_) {
        if (req.mode === "navigate") {
          const shell = await caches.match("./index.html");
          if (shell) return shell;

          return new Response("Offline", { status: 503 });
        }
        return new Response("", { status: 504 });
      }
    })()
  );
});

// No message-based skipWaiting: SW activates via install skipWaiting().

