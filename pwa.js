// pwa.js v2.0 - PWA helpers
// Install prompt logic (A2HS) - KISS
// UI owns when to show; copy is in WT_WORDING.installPrompt.*

(() => {
  "use strict";

  let deferredPrompt = null;

  // Capture the beforeinstallprompt event (Chrome/Edge/Android)
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  // If app gets installed, clear prompt handle (KISS)
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });

  // Check if running as standalone (already installed)
  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  }

  // V2 counter name is runCompletes
  function getCompletedCount(storage) {
    if (!storage || typeof storage.getCounters !== "function") return 0;
    const c = storage.getCounters() || {};

    const runCompletes = Number(c.runCompletes || 0);
    return (Number.isFinite(runCompletes) && runCompletes > 0) ? runCompletes : 0;
  }

  // Check if we can show the install prompt (platform-aware)
  function canPrompt(config, storage) {
    if (!config?.installPrompt?.enabled) return false;
    if (isStandalone()) return false;

    const completed = getCompletedCount(storage);

    // V2 key: triggerAfterFirstCompletedRun
    const gateAfterFirst =
      (config.installPrompt && config.installPrompt.triggerAfterFirstCompletedRun === true);

    if (gateAfterFirst) {
      if (completed < 1) return false;
    }

    // iOS: no beforeinstallprompt; UI can still show instructions modal
    if (isIOS()) return true;

    // Non-iOS: need deferredPrompt
    return !!deferredPrompt;
  }

  // Initialize PWA features
  // In V2, UI calls WT_PWA.promptInstall(storage) directly.
  // Keep signature (storage, ui) for compatibility, but do not require UI hooks.
  function initPWA(storage, ui) {
    const config = window.WT_CONFIG;

    // pwa.js is strictly limited to install-prompt wiring (KISS).
    if (!config?.installPrompt?.enabled) return;

    void storage;
    void ui;
  }

  // Show the native install prompt when available (Chrome/Edge/Android)
  // iOS returns IOS_NO_NATIVE_PROMPT so UI can show instructions.
  async function promptInstall(storage) {
    const config = window.WT_CONFIG;

    if (!canPrompt(config, storage)) {
      return { ok: false, reason: "NOT_AVAILABLE" };
    }

    // iOS: no native prompt
    if (isIOS()) {
      if (storage && typeof storage.markInstallPromptShown === "function") {
        storage.markInstallPromptShown();
      }
      return { ok: false, reason: "IOS_NO_NATIVE_PROMPT" };
    }

    if (!deferredPrompt) return { ok: false, reason: "NOT_AVAILABLE" };

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;

      // Anti-spam: treat prompt as "shown" whether accepted or dismissed
      if (storage && typeof storage.markInstallPromptShown === "function") {
        storage.markInstallPromptShown();
      }

      if (choice && choice.outcome === "accepted") {
        return { ok: true };
      }
      return { ok: false, reason: "DISMISSED" };
    } catch (_) {
      return { ok: false, reason: "ERROR" };
    }
  }

  // Export
  window.WT_PWA = {
    initPWA,
    canPrompt,
    isStandalone,
    promptInstall
  };
})();
