// main.js v2.0 - Word Traps

(() => {
  "use strict";

  function escapeHtmlSafe(str) {
    const s = String(str == null ? "" : str);
    const fn = window.WT_UTILS && typeof window.WT_UTILS.escapeHtml === "function"
      ? window.WT_UTILS.escapeHtml
      : null;

    if (!fn) {
      throw new Error("WT_UTILS.escapeHtml missing. config.js must load before main.js.");
    }

    return String(fn(s));
  }


  // ============================================
  // Logger (like TYF)
  // ============================================
  const Logger = {
    debug: (...args) =>
      window.WT_CONFIG?.debug?.enabled &&
      window.WT_CONFIG.debug.logLevel === "debug" &&
      console.log("[WT Debug]", ...args),

    log: (...args) =>
      window.WT_CONFIG?.debug?.enabled &&
      ["debug", "log"].includes(window.WT_CONFIG.debug.logLevel) &&
      console.log("[WT]", ...args),

    warn: (...args) =>
      window.WT_CONFIG?.debug?.enabled &&
      console.warn("[WT Warning]", ...args),

    error: (...args) => console.error("[WT Error]", ...args)
  };

  window.Logger = Logger;

  // ============================================
  // Error display
  // ============================================
  function showFatal(message) {
    const root = document.getElementById("app");
    if (!root) return;

    const safeMsg = escapeHtmlSafe(message);
    const appName = escapeHtmlSafe(String(window.WT_CONFIG?.identity?.appName || "Game").trim());

    root.innerHTML = `
      <div class="wt-card wt-card--error">
        <h1 class="wt-h1">${appName}</h1>
        <p class="wt-muted">${safeMsg}</p>
        <button id="wtFatalReloadBtn" class="wt-btn wt-btn--secondary" type="button">Reload</button>
      </div>
    `;

    const btn = document.getElementById("wtFatalReloadBtn");
    if (btn) btn.addEventListener("click", () => location.reload());
  }



  window.showFatal = showFatal;

  // ============================================
  // Global error handlers
  // ============================================
  window.addEventListener("error", (event) => {
    Logger.error("Global error:", event.error || event);

    if (window.__WT_APP_BOOTED__ === true) return;

    const isDev = window.WT_CONFIG?.debug?.enabled;
    const errorMsg = event.message || event.error?.message || "Unknown error";
    showFatal(
      isDev
        ? `JavaScript Error: ${errorMsg}`
        : "Unable to load the game. Please refresh the page."
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    Logger.error("Unhandled promise rejection:", event.reason);

    if (window.__WT_APP_BOOTED__ === true) return;

    const isDev = window.WT_CONFIG?.debug?.enabled;
    const errorMsg = event.reason?.message || "Promise rejection";
    showFatal(
      isDev
        ? `Promise Error: ${errorMsg}`
        : "An unexpected issue occurred. Please refresh the page."
    );
  });
  // ============================================
  // Content loader
  // ============================================
  async function loadJson(url) {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Invalid JSON response for ${url} (content-type: ${contentType})`);
    }

    return await res.json();
  }



  // ============================================
  // Service Worker registration
  // ============================================
  function initServiceWorker() {
    const cfg = window.WT_CONFIG;
    if (!cfg || typeof cfg !== "object") return;
    if (cfg?.serviceWorker?.enabled !== true) return;
    if (cfg.environment === "development") return;

    if (!("serviceWorker" in navigator)) {
      Logger.warn("Service Worker not supported");
      return;
    }

    function showUpdateToast(message) {
      const msg = String(message || "").trim();
      if (!msg) return;

      // KISS: reuse the existing #update-toast shell from index.html
      const node = document.getElementById("update-toast");
      if (!node) return;

      // Mark update ready so UI can decide when to reload (user-controlled)
      window.__WT_SW_UPDATE_READY__ = true;

      const text = node.querySelector("[data-wt-update-text]");
      if (text) text.textContent = msg;

      node.classList.add("wt-toast--visible");
    }


    window.addEventListener("load", () => {
      const version = String(cfg.version || "").trim();
      if (!version) {
        Logger.warn("WT_CONFIG.version missing/empty: skipping Service Worker registration (fail-closed)");
        return;
      }

      const v = encodeURIComponent(version);
      const swUrl = `./sw.js?v=${v}`;

      navigator.serviceWorker
        .register(swUrl, { scope: "./" })
        .then((registration) => {
          Logger.log("✅ Service Worker registered:", registration.scope);

          // Auto-update check
          if (cfg.serviceWorker.autoUpdate) {
            if (window.__WT_SW_AUTO_UPDATE_INTERVAL__) {
              window.clearInterval(window.__WT_SW_AUTO_UPDATE_INTERVAL__);
            }

            window.__WT_SW_AUTO_UPDATE_INTERVAL__ = window.setInterval(() => {
              registration.update().catch(() => { });
            }, 10 * 60 * 1000); // Every 10 min
          }

          // Update notification (config: showUpdateNotifications)
          // IMPORTANT: never auto-reload (can kill an active run). User-controlled reload only.
          if (cfg.serviceWorker.showUpdateNotifications) {
            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;
              if (!newWorker) return;

              newWorker.addEventListener("statechange", () => {
                // Only notify when updating an already-controlled page
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  const msg = String(window.WT_WORDING?.system?.updateAvailable || "").trim();
                  if (msg) showUpdateToast(msg);
                }
              });
            });
          }

        })
        .catch((err) => {
          Logger.warn("Service Worker registration failed:", err?.message || err);
        });
    });
  }


  // ============================================
  // Validation
  // ============================================
  function validatePrerequisites() {
    if (!window.WT_CONFIG) {
      Logger.error("WT_CONFIG not found");
      showFatal("Configuration error: Application settings not loaded.");
      return false;
    }

    let storageOk = false;
    try {
      const ls = window.localStorage;
      if (ls) {
        const probeKey = "__wt_storage_probe__";
        ls.setItem(probeKey, "1");
        ls.removeItem(probeKey);
        storageOk = true;
      }
    } catch (_) {
      storageOk = false;
    }

    if (!storageOk) {
      Logger.error("localStorage not supported or unavailable");
      showFatal("Your browser doesn't support local storage. Please use a modern browser.");
      return false;
    }

    const appContainer = document.getElementById("app");
    if (!appContainer) {
      Logger.error("App container not found");
      showFatal("Critical error: App container not found.");
      return false;
    }

    return true;
  }

  function validateModules() {
    // IMPORTANT:
    // StorageManager is a reserved native name in browsers (Storage API).
    // Our app storage class must NOT use that global name.
    const required = ["WT_StorageManager", "WT_Game", "WT_UI"];
    const missing = required.filter((name) => !window[name]);

    if (missing.length > 0) {
      Logger.error(`Missing modules: ${missing.join(", ")}`);
      showFatal(`Unable to load game components: ${missing.join(", ")}. Please refresh the page.`);
      return false;
    }

    return true;
  }


  // ============================================
  // Loading screen
  // ============================================
  function showLoadingScreen() {
    const root = document.getElementById("app");
    if (!root) return;

    const wording = window.WT_WORDING;
    const sys = (wording && typeof wording === "object" && wording.system && typeof wording.system === "object")
      ? wording.system
      : null;

    if (!sys) return;

    const title = String(sys.loadingTitle || "").trim();
    const hint = String(sys.loadingHint || "").trim();

    root.innerHTML = `
    <div class="wt-loading">
      <div class="wt-loading-icon">🇫🇷</div>
      <div class="wt-loading-spinner"></div>
      <h2 class="wt-h2">${escapeHtmlSafe(title)}</h2>
      <p class="wt-muted">${escapeHtmlSafe(hint)}</p>
    </div>
  `;
  }



  // ============================================
  // ============================================
  // Main application start
  // ============================================
  async function startApplication() {
    showLoadingScreen();

    // UX guard: if loading takes too long, show reassurance message
    const slowLoadTimer = setTimeout(() => {
      const root = document.getElementById("app");
      if (!root) return;

      const wording = window.WT_WORDING;
      const sys = (wording && typeof wording === "object" && wording.system && typeof wording.system === "object")
        ? wording.system
        : null;

      if (!sys) return;

      const slowHint = String(sys.loadingSlowHint || "").trim();
      if (!slowHint) return;

      const hint = root.querySelector(".wt-muted");
      if (hint) {
        hint.textContent = slowHint;
      }
    }, 3000);


    try {

      const config = window.WT_CONFIG;
      if (!config || typeof config !== "object") {
        clearTimeout(slowLoadTimer);
        Logger.error("WT_CONFIG missing or invalid");
        showFatal("Configuration error: Application settings not loaded.");
        return;
      }

      const wording = window.WT_WORDING;
      if (!wording || typeof wording !== "object") {
        clearTimeout(slowLoadTimer);
        Logger.error("WT_WORDING missing or invalid");
        showFatal("Configuration error: UI wording not loaded.");
        return;
      }

      // Init storage
      const storage = new window.WT_StorageManager(config);
      storage.init();
      window.storageManager = storage; // Global for debug

      // Init game engine
      const game = new window.WT_Game.GameEngine();

      // Init UI immediately (LANDING is not content-dependent)
      const ui = new window.WT_UI({ storage, game, config, wording });
      if (ui && typeof ui.setContentLoading === "function") ui.setContentLoading(true);

      // Listen for storage updates (KISS)
      // Contract (intentional): StorageManager emits a single global event "storage-updated".
      // UI refresh strategy is FULL re-render on any mutation (no granular diffs).
      // Reason: preserve inter-module coherence and avoid partial UI desync bugs.
      if (window.__WT_ON_STORAGE_UPDATED__) {
        window.removeEventListener("storage-updated", window.__WT_ON_STORAGE_UPDATED__);
      }
      window.__WT_ON_STORAGE_UPDATED__ = () => ui.onStorageUpdated();
      window.addEventListener("storage-updated", window.__WT_ON_STORAGE_UPDATED__);

      if (window.__WT_ON_STORAGE_SAVE_FAILED__) {
        window.removeEventListener("storage-save-failed", window.__WT_ON_STORAGE_SAVE_FAILED__);
      }
      window.__WT_ON_STORAGE_SAVE_FAILED__ = () => {
        if (ui && typeof ui.onStorageSaveFailed === "function") ui.onStorageSaveFailed();
      };
      window.addEventListener("storage-save-failed", window.__WT_ON_STORAGE_SAVE_FAILED__);

      ui.init();

      // Boot optimization: if a premium code was saved by success.html, prompt instant activation.
      // Single source of truth: ui.js (promptAutoRedeemIfReady + howto.autoActivate* wording).
      if (ui && typeof ui.promptAutoRedeemIfReady === "function") {
        try { ui.promptAutoRedeemIfReady(); } catch (_) { /* silent */ }
      }


      // Load content in parallel during boot
      loadJson(config.contentUrl)

        .then((content) => {
          clearTimeout(slowLoadTimer);

          const items = Array.isArray(content.items) ? content.items : [];

          if (!items.length) {
            if (ui && typeof ui.setContentLoading === "function") ui.setContentLoading(false);
            showFatal("Content not available. Please check your connection and reload.");
            return;
          }

          ui.setContent(items);
          if (ui && typeof ui.setContentLoading === "function") ui.setContentLoading(false);
          ui.render();

          window.__WT_APP_BOOTED__ = true;
          Logger.log(`Content loaded: ${items.length} items`);
        })
        .catch((error) => {
          clearTimeout(slowLoadTimer);
          Logger.error("Content load error:", error);
          showFatal(
            `Unable to load game data. Please check your connection and refresh. ${window.WT_CONFIG?.debug?.enabled ? `Error: ${error.message}` : ""
            }`
          );
        });

      // Secret bonus (END chest) - orchestration lives in main.js (KISS)
      // ui.js dispatches: "wt-secret-bonus-requested"
      if (window.__WT_ON_OPEN_SUPPORT__) {
        document.removeEventListener("wt-open-support", window.__WT_ON_OPEN_SUPPORT__);
      }
      window.__WT_ON_OPEN_SUPPORT__ = () => {
        try { ui.openSupportModal(); } catch (_) { /* silent */ }
      };
      document.addEventListener("wt-open-support", window.__WT_ON_OPEN_SUPPORT__);

      if (window.__WT_ON_SECRET_BONUS_REQUESTED__) {
        window.removeEventListener("wt-secret-bonus-requested", window.__WT_ON_SECRET_BONUS_REQUESTED__);
      }
      window.__WT_ON_SECRET_BONUS_REQUESTED__ = () => {
        try {
          // The UI owns gameplay screens; main.js just triggers the entry point.
          if (ui && typeof ui.startSecretBonusRun === "function") {
            ui.startSecretBonusRun();
          }

        } catch (_) {
          // Never break gameplay for a hidden bonus hook
        }
      };
      window.addEventListener("wt-secret-bonus-requested", window.__WT_ON_SECRET_BONUS_REQUESTED__);

      // Init email links
      if (window.WT_Email && typeof window.WT_Email.initEmailLinks === "function") {
        window.WT_Email.initEmailLinks();
      }

      // Init PWA
      if (typeof window.WT_PWA !== "undefined" && window.WT_PWA.initPWA) {
        window.WT_PWA.initPWA(storage, ui);
      }

      Logger.log(`✅ ${config.identity.appName} v${config.version} started successfully`);
    } catch (error) {
      clearTimeout(slowLoadTimer);
      Logger.error("Startup error:", error);
      showFatal(
        `Unable to load game data. Please check your connection and refresh. ${window.WT_CONFIG?.debug?.enabled ? `Error: ${error.message}` : ""
        }`
      );
    }
  }



  // ============================================
  // DOMContentLoaded
  // ============================================
  document.addEventListener("DOMContentLoaded", () => {
    const cfg = window.WT_CONFIG;
    const version = String(cfg?.version || "").trim();
    const env = String(cfg?.environment || "").trim();

    if (!version) Logger.warn("WT_CONFIG.version missing/empty");
    if (!env) Logger.warn("WT_CONFIG.environment missing/empty");

    const appName = String(cfg?.identity?.appName || "Game").trim();

    if (version && env) Logger.log(`Initializing ${appName} v${version} (${env})`);
    else if (version) Logger.log(`Initializing ${appName} v${version}`);
    else Logger.log(`Initializing ${appName}`);

    if (!validatePrerequisites()) return;
    if (!validateModules()) return;

    startApplication();
  });


  // Init service worker immediately (before DOMContentLoaded)
  initServiceWorker();

  // ============================================
  // Debug tools
  // ============================================
  if (window.WT_CONFIG?.debug?.enabled) {
    window.WT_DEBUG = {
      Logger,
      config: window.WT_CONFIG,
      wording: window.WT_WORDING,
      get storage() { return window.storageManager; },
      resetStorage() {
        if (window.storageManager && typeof window.storageManager.resetAll === "function") {
          window.storageManager.resetAll();
        }

        location.reload();
      }


    };
  }
})();
