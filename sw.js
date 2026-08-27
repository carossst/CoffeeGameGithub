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

const APP_SCOPE = (() => {
  try {
    const v = new URL(self.location.href).searchParams.get("app");
    if (typeof v !== "string" || !v.trim()) return "";
    const s = v.trim();
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) return "";
    return s;
  } catch (_) {
    return "";
  }
})();

const CACHE_PREFIX = APP_SCOPE ? `wt-${APP_SCOPE}` : "";
const CACHE_NAME = (SW_VERSION && CACHE_PREFIX) ? `${CACHE_PREFIX}-cache-${SW_VERSION}` : "";

// 8.1 Assets to cache (spec section 8.1)
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./404.html",
  "./success.html",
  "./privacy.html",
  "./terms.html",
  "./press.html",
  "./style.css",
  "./config.js",
  "./storage.js",
  "./game.js",
  "./leaderboard-logic.js",
  "./leaderboard.js",
  "./ui.js",
  "./pwa.js",
  "./email.js",
  "./footer.js",
  "./main.js",
  "./icons.js",
  "./content.json",
  "./manifest.json",
  "./og-image.jpg",
  "./icons/brand-logo-512.png",
  "./icons/favicon-32x32.png",
  "./icons/favicon-16x16.png",
  "./icons/favicon.ico",
  "./icons/icon-180x180.png",
  "./icons/icon-192x192.png",
  "./icons/icon-192x192-maskable.png",
  "./icons/icon-512x512.png",
  "./icons/icon-512x512-maskable.png"
];

// Critical assets: if any of these fail to pre-cache, do NOT force-activate immediately.
// Intentionally excludes non-blocking helpers such as pwa.js and email.js:
// the core game must still boot even if install or mail flows are unavailable on first load.
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

function getOfflineDocumentFallback(pathname) {
  const p = String(pathname || "").trim();
  switch (p) {
    case "/":
    case "/index.html":
      return "./index.html";
    case "/success.html":
      return "./success.html";
    case "/privacy.html":
      return "./privacy.html";
    case "/terms.html":
      return "./terms.html";
    case "/press.html":
      return "./press.html";
    case "/404.html":
      return "./404.html";
    default:
      return "";
  }
}

function getAssetPathname(url) {
  try {
    const scopePath = new URL(self.registration.scope).pathname || "/";
    let path = String(url.pathname || "");

    if (scopePath !== "/" && path.startsWith(scopePath)) {
      path = path.slice(scopePath.length - 1);
    }

    return path || "/";
  } catch (_) {
    return String(url && url.pathname ? url.pathname : "");
  }
}

function isNetworkFirstAppShellRequest(req, url) {
  if (!req || !url) return false;

  if (req.mode === "navigate") return true;

  const path = getAssetPathname(url);

  if (
    path === "/" ||
    path === "/index.html" ||
    path === "/404.html" ||
    path === "/success.html" ||
    path === "/privacy.html" ||
    path === "/terms.html" ||
    path === "/press.html"
  ) {
    return true;
  }

  if (
    path === "/style.css" ||
    path === "/config.js" ||
    path === "/storage.js" ||
    path === "/game.js" ||
    path === "/leaderboard-logic.js" ||
    path === "/leaderboard.js" ||
    path === "/ui.js" ||
    path === "/pwa.js" ||
    path === "/email.js" ||
    path === "/footer.js" ||
    path === "/main.js" ||
    path === "/icons.js" ||
    path === "/manifest.json"
  ) {
    return true;
  }

  return false;
}

async function matchCacheWithSearchFallback(cache, req) {
  if (!cache || !req) return null;

  const exact = await cache.match(req);
  if (exact) return exact;

  try {
    const loose = await cache.match(req, { ignoreSearch: true });
    if (loose) return loose;
  } catch (_) {
    // ignoreSearch is broadly supported, but keep the SW defensive.
  }

  return null;
}

async function networkFirstWithCacheFallback(req, url) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const res = await fetch(req, { cache: "reload" });
    if (res && res.ok) {
      await cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    const cached = await matchCacheWithSearchFallback(cache, req);
    if (cached) return cached;

    if (req.mode === "navigate") {
      const fallbackUrl = getOfflineDocumentFallback(url.pathname) || "./404.html";
      const doc = await cache.match(fallbackUrl);
      if (doc) return doc;

      const shell = await cache.match("./index.html");
      if (shell && (url.pathname === "/" || url.pathname.endsWith("/index.html"))) return shell;

      return new Response("Offline", { status: 503 });
    }

    return new Response("", { status: 504 });
  }
}

async function cacheFirstWithNetworkFallback(req, url) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await matchCacheWithSearchFallback(cache, req);
  if (cached) return cached;

  try {
    const res = await fetch(req, { cache: "reload" });
    if (res && res.ok) {
      await cache.put(req, res.clone());
    }
    return res;
  } catch (_) {
    if (req.mode === "navigate") {
      const fallbackUrl = getOfflineDocumentFallback(url.pathname) || "./404.html";
      const doc = await cache.match(fallbackUrl);
      if (doc) return doc;

      const shell = await cache.match("./index.html");
      if (shell && (url.pathname === "/" || url.pathname.endsWith("/index.html"))) return shell;

      return new Response("Offline", { status: 503 });
    }

    return new Response("", { status: 504 });
  }
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

  // App shell files are network-first so deployed fixes are not trapped behind an old cache.
  // Offline still works through the cached fallback path.
  if (isNetworkFirstAppShellRequest(req, url)) {
    event.respondWith(networkFirstWithCacheFallback(req, url));
    return;
  }

  // Media and other static assets: cache-first, then network.
  event.respondWith(cacheFirstWithNetworkFallback(req, url));
});

self.addEventListener("message", (event) => {
  const data = event && event.data ? event.data : null;
  if (!data || data.type !== "SKIP_WAITING") return;

  self.skipWaiting();
});
