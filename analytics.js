// analytics.js
// Minimal GoatCounter funnel tracking for the paid-conversion path.
// Ported from Pickleball Rules Quiz. English-only; event paths are namespaced
// by app slug so one GoatCounter site can host several apps (filter on
// /event/<app-slug>/...).

(() => {
  "use strict";

  const QUEUE_LIMIT = 50;
  const POLL_MS = 500;
  const MAX_POLL_ATTEMPTS = 20;
  const queue = [];
  let pollTimer = null;
  let pollAttempts = 0;

  function slugify(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function getAppSlug() {
    try {
      const name = slugify(window.WT_CONFIG?.identity?.appName);
      if (name) return name;
    } catch (_) {
      /* ignore */
    }
    return "app";
  }

  function getGoatCounter() {
    const gc = window.goatcounter;
    return gc && typeof gc.count === "function" ? gc : null;
  }

  function getLocale() {
    try {
      const docLang = slugify(
        document.documentElement && document.documentElement.getAttribute
          ? document.documentElement.getAttribute("lang")
          : ""
      );
      if (docLang) return docLang;
    } catch (_) {
      /* ignore */
    }
    return "en";
  }

  function getEntrySource() {
    try {
      const params = new URLSearchParams(window.location.search);
      const wtSource = slugify(params.get("wt-source"));
      if (wtSource) return wtSource;
      const utmSource = slugify(params.get("utm_source"));
      if (utmSource) return utmSource;
    } catch (_) {
      /* ignore */
    }
    return "direct";
  }

  function isPremium(storage) {
    try {
      if (storage && typeof storage.isPremium === "function") {
        return storage.isPremium() === true;
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function getFreeRunsUsed(storage) {
    try {
      if (storage && typeof storage.getRunsUsed === "function") {
        const n = Number(storage.getRunsUsed());
        if (Number.isFinite(n) && n >= 0) return Math.floor(n);
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function buildEventPath(name, props) {
    const safeName = slugify(name) || "event";
    const p = props && typeof props === "object" ? props : {};
    const parts = ["event", getAppSlug(), safeName];

    if (p.mode) {
      const mode = slugify(p.mode);
      if (mode) parts.push(mode);
    }
    if (p.from_state) {
      const fromState = slugify(p.from_state);
      if (fromState) parts.push(`from-${fromState}`);
    }
    if (p.price_key) {
      const priceKey = slugify(p.price_key);
      if (priceKey) parts.push(`price-${priceKey}`);
    }
    if (p.run_type) {
      const rt = slugify(p.run_type);
      if (rt) parts.push(`run-${rt}`);
    }
    if (p.entry_source) {
      const entrySource = slugify(p.entry_source);
      if (entrySource) parts.push(`src-${entrySource}`);
    }
    if (typeof p.premium === "boolean") {
      parts.push(p.premium ? "premium" : "free");
    }
    if (Number.isFinite(Number(p.free_runs_used))) {
      parts.push(`runs-${Math.max(0, Math.floor(Number(p.free_runs_used)))}`);
    }

    return `/${parts.join("/")}`;
  }

  function buildEventTitle(name, props) {
    const p = props && typeof props === "object" ? props : {};
    const chunks = [`${getAppSlug()} ${String(name || "event").trim()}`];
    Object.keys(p)
      .sort()
      .forEach((key) => {
        const value = p[key];
        if (value == null || value === "") return;
        chunks.push(`${key}=${String(value)}`);
      });
    return chunks.join(" | ");
  }

  function enqueue(payload) {
    if (!payload || typeof payload !== "object") return;
    queue.push(payload);
    while (queue.length > QUEUE_LIMIT) queue.shift();
  }

  function sendPayload(payload) {
    const gc = getGoatCounter();
    if (!gc) return false;
    try {
      gc.count({ path: payload.path, title: payload.title, event: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  function flushQueue() {
    if (!queue.length) return;
    if (!getGoatCounter()) return;
    while (queue.length) {
      const payload = queue[0];
      if (!sendPayload(payload)) break;
      queue.shift();
    }
  }

  function ensurePoller() {
    if (pollTimer) return;
    pollTimer = window.setInterval(() => {
      pollAttempts += 1;
      if (getGoatCounter()) {
        flushQueue();
        window.clearInterval(pollTimer);
        pollTimer = null;
        pollAttempts = 0;
        return;
      }
      if (pollAttempts >= MAX_POLL_ATTEMPTS) {
        window.clearInterval(pollTimer);
        pollTimer = null;
        pollAttempts = 0;
      }
    }, POLL_MS);
  }

  function inferUiContext(ui, extras) {
    const p = extras && typeof extras === "object" ? extras : {};
    const storage = ui && ui.storage ? ui.storage : null;
    const out = {
      lang: getLocale(),
      entry_source: getEntrySource(),
      premium: isPremium(storage)
    };
    const freeRunsUsed = getFreeRunsUsed(storage);
    if (freeRunsUsed != null) out.free_runs_used = freeRunsUsed;
    Object.keys(p).forEach((key) => {
      const value = p[key];
      if (value == null || value === "") return;
      out[key] = value;
    });
    return out;
  }

  function inferPageContext(extras) {
    const p = extras && typeof extras === "object" ? extras : {};
    return { lang: getLocale(), entry_source: getEntrySource(), ...p };
  }

  function trackFunnel(name, props) {
    const payload = {
      path: buildEventPath(name, props),
      title: buildEventTitle(name, props)
    };
    if (sendPayload(payload)) return true;
    enqueue(payload);
    ensurePoller();
    return false;
  }

  window.WT_Analytics = {
    buildEventPath,
    buildEventTitle,
    getEntrySource,
    getLocale,
    inferPageContext,
    inferUiContext,
    trackFunnel
  };

  try {
    window.addEventListener("load", flushQueue);
  } catch (_) {
    /* ignore */
  }
})();
