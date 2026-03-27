/* Word Traps - storage (V2 RUN) */

(() => {
  "use strict";

  const EVT = "storage-updated";
  const EVT_SAVE_FAILED = "storage-save-failed";


  // ============================================
  // Helpers
  // ============================================
  function now() {
    return Date.now();
  }

  function safeJsonParse(str) {
    if (!str || typeof str !== "string") return null;
    try {
      return JSON.parse(str);
    } catch (_) {
      return null;
    }
  }

  function clampNonNegativeInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.floor(x));
  }

  function safeBool(x) {
    return (x === true || x === false) ? x : null;
  }
  function safeIdNum(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    if (!Number.isInteger(n)) return null;
    if (n < 0) return null;
    return n;
  }

  function deepCopy(obj) {
    // Prefer structuredClone to preserve `undefined` (JSON stringify drops it).
    // Fallback keeps legacy behavior on older browsers.
    try {
      if (typeof structuredClone === "function") return structuredClone(obj);
    } catch (_) { /* fall through */ }

    return JSON.parse(JSON.stringify(obj));
  }

  // ============================================
  // StorageManager Constructor (V2 clean, no legacy)
  // ============================================

  function StorageManager(config) {
    if (!config || typeof config !== "object") {
      throw new Error("StorageManager: missing or invalid config (no fallback to window.WT_CONFIG)");
    }

    const rawStorageKey = config?.storage?.storageKey;
    if (typeof rawStorageKey !== "string") {
      throw new Error("StorageManager: missing config.storage.storageKey");
    }
    const resolvedStorageKey = rawStorageKey.trim();
    if (!resolvedStorageKey) {
      throw new Error("StorageManager: empty config.storage.storageKey");
    }

    this.config = config;
    this.storageKey = resolvedStorageKey;

    this.initialized = false;
    this.data = null;

    // One-shot per session: persistence failure signal to UI
    this._saveFailedOnce = false;

    // Cache compiled regex (premium codes)
    this._premiumCodeRe = undefined;

    const rawSchemaVersion = config.storageSchemaVersion;
    if (typeof rawSchemaVersion !== "string" && typeof rawSchemaVersion !== "number") {
      throw new Error("StorageManager: missing config.storageSchemaVersion");
    }
    const schemaVersion = String(rawSchemaVersion).trim();
    if (!schemaVersion) {
      throw new Error("StorageManager: empty config.storageSchemaVersion");
    }
    // INVARIANT (intentional):
    // freeRuns is read from WT_CONFIG.limits.freeRuns at initialization time.
    // If WT_CONFIG changes AFTER init, StorageManager does NOT live-sync it.
    // Rationale: avoid retroactive entitlement changes and mid-run UX inconsistencies.
    const freeRuns = clampNonNegativeInt(config?.limits?.freeRuns);


    const gameId = String(config.identity?.appName || "").trim();
    if (!gameId) throw new Error("StorageManager: missing config.identity.appName");

    this.defaultData = {
      version: schemaVersion,
      gameId: gameId,
      createdAt: 0,
      updatedAt: 0,

      // Premium
      isPremium: false,

      // Premium codes (device-local)
      codes: {
        redeemedOnce: false,
        code: ""
      },

      // Economy gate (config-driven: see WT_CONFIG.limits.freeRuns)
      runs: {
        balance: freeRuns,
        freeRuns: freeRuns,
        limitReachedCount: 0
      },


      // Settings
      settings: {
        mistakesOnly: false,
        mistakesOnlyCompletedOnce: false,

        // House Ad hide (timestamp ms). 0 = not hidden.
        houseAdHiddenUntil: 0
      },

      // UI device-only flags
      uiDeviceFlags: {
        firstRunFramingSeen: false,
        premiumFirstRunFramingSeen: false,
        secretChestHintSolved: false,
        secretChestWelcomeShown: false
      },

      // House Ad (post-completion) — persisted state
      houseAd: {
        introSeen: false,
        state: "never_seen" // never_seen | remind_later
      },

      // Waitlist (END screen only) — persisted state
      waitlist: {
        status: "not_seen", // not_seen | seen | joined
        draftIdea: ""
      },

      // Counters
      counters: {
        runNumber: 0,
        runStarts: 0,
        runCompletes: 0,

        // BONUS completes (device-local)
        bonusCompletes: 0,

        // Secret bonus (teaser premium): free bonus runs used (lifetime, device-local)
        secretBonusFreeRunsUsed: 0,

        // Practice (Mistakes only): free practice runs used (lifetime, device-local)
        practiceFreeRunsUsed: 0,

        // Funnel (local-only, aggregated)
        landingViewed: 0,
        landingPlayClicked: 0,

        shareClicked: 0,
        installPromptShown: 0,
        paywallShown: 0,
        checkoutStarted: 0,
        codeRedeemed: 0,
        houseAdShown: 0,
        houseAdClicked: 0,
        premiumUnlockedCount: 0
      },




      // Personal best (V2 = best FP in a run) — RUN only
      personalBest: {
        bestScoreFP: 0,
        achievedAt: 0
      },

      // Bonus best (V1 = best FP in a bonus run) — BONUS only
      bonusBest: {
        bestScoreFP: 0,
        achievedAt: 0
      },

      // Run history (lightweight, local-only)
      history: {
        lastRuns: [],
        runPaceTotals: {
          runCount: 0,
          totalNewSeen: 0
        }
      },

      // Per-item stats (anti-repetition + practice)
      statsByItem: {},

      // Early price window (timer UX)
      // Source of truth: startedAt (persisted). Window length comes from config (not persisted).
      earlyPrice: {
        startedAt: 0,
        used: false
      },

      // Endgame flags
      postCompletion: {
        postCompletionShown: false,
        postCompletionAt: 0,

        // Milestone: halfway through the pool (one-shot).
        halfwayMilestoneShown: false,
        halfwayMilestoneShownAt: 0,

        // One-shot: celebrate "seen all 200" once, then never again (even if user reaches 400+).
        poolCompleteCelebrated: false,
        poolCompleteCelebratedAt: 0,

        // One-shot: celebrate "mastered" once (pool exhausted + 0 active mistakes)
        masteredCelebrated: false,
        masteredCelebratedAt: 0
      },

      endgame: {
        endgameShown: false,
        endgameShownAt: 0
      },



      analytics: {
        firstSeenAt: 0,
        lastSeenAt: 0,
        fpEmptyCount: 0,
        replayBeforePaywall: 0,

        // Anonymous stats sharing prompt (END-only)
        // Legacy stage (kept for backwards compatibility)
        // -1 = never prompted
        statsSharingPromptStage: -1,

        // New: per-trigger bitmask (each trigger shown at most once)
        // bit0: 30%, bit1: 50%, bit2: last free run, bit3: power user
        statsSharingPromptFlags: 0,

        // New: "Show me later" snooze (do not reprompt until at least this many runCompletes)
        statsSharingSnoozeUntilRunCompletes: 0,

        // Checkout / premium analytics
        checkoutStartedAt: 0,
        checkoutPriceKey: "",
        premiumUnlockedAt: 0
      }


    };
  }


  StorageManager.prototype.init = function () {
    if (this.initialized) return;

    const cfg = this.config || {};
    const schemaVersion = String(
      cfg.storageSchemaVersion != null ? cfg.storageSchemaVersion : ""
    ).trim();

    if (!schemaVersion) throw new Error("StorageManager: missing config.storageSchemaVersion");

    const loaded = this._load();

    // No legacy support: mismatch => reset
    if (!loaded || typeof loaded !== "object" || String(loaded.version || "") !== schemaVersion) {
      this._wipeAndReset();

      // If success page already generated a code, keep it across wipes (data alignment only).
      if (this._syncVanityCodeToCodes()) {
        this._save();
      }

      // Multi-tab sync (read-only listener)
      this._addStorageListener();

      this.initialized = true;
      return;
    }


    this.data = loaded;

    // Harden required blocks (V2 shapes)
    if (!this.data.runs) this.data.runs = deepCopy(this.defaultData.runs);
    if (!this.data.settings) this.data.settings = deepCopy(this.defaultData.settings);
    if (!this.data.uiDeviceFlags) this.data.uiDeviceFlags = deepCopy(this.defaultData.uiDeviceFlags);
    if (!this.data.houseAd) this.data.houseAd = deepCopy(this.defaultData.houseAd);
    if (!this.data.waitlist) this.data.waitlist = deepCopy(this.defaultData.waitlist);
    if (!this.data.counters) this.data.counters = deepCopy(this.defaultData.counters);
    if (!this.data.history) this.data.history = deepCopy(this.defaultData.history);
    if (!this.data.statsByItem) this.data.statsByItem = {};
    if (!this.data.personalBest) this.data.personalBest = deepCopy(this.defaultData.personalBest);
    if (!this.data.bonusBest) this.data.bonusBest = deepCopy(this.defaultData.bonusBest);
    if (!this.data.earlyPrice) this.data.earlyPrice = deepCopy(this.defaultData.earlyPrice);
    if (!this.data.postCompletion) this.data.postCompletion = deepCopy(this.defaultData.postCompletion);
    if (!this.data.endgame) this.data.endgame = deepCopy(this.defaultData.endgame);
    if (!this.data.analytics) this.data.analytics = deepCopy(this.defaultData.analytics);

    if (this._migrateUiDeviceFlagsFromLegacyKeys()) {
      this._save();
    }
    if (!Number.isFinite(Number(this.data.analytics.statsSharingPromptStage))) {
      this.data.analytics.statsSharingPromptStage = -1;
    } else {
      this.data.analytics.statsSharingPromptStage = Math.floor(Number(this.data.analytics.statsSharingPromptStage));
    }

    if (!Number.isFinite(Number(this.data.analytics.statsSharingPromptFlags))) {
      this.data.analytics.statsSharingPromptFlags = 0;
    } else {
      this.data.analytics.statsSharingPromptFlags = Math.floor(Number(this.data.analytics.statsSharingPromptFlags));
    }

    if (!Number.isFinite(Number(this.data.analytics.statsSharingSnoozeUntilRunCompletes))) {
      this.data.analytics.statsSharingSnoozeUntilRunCompletes = 0;
    } else {
      this.data.analytics.statsSharingSnoozeUntilRunCompletes = Math.floor(Number(this.data.analytics.statsSharingSnoozeUntilRunCompletes));
    }

    if (!Number.isFinite(Number(this.data.analytics.checkoutStartedAt))) {
      this.data.analytics.checkoutStartedAt = 0;
    } else {
      this.data.analytics.checkoutStartedAt = Math.floor(Number(this.data.analytics.checkoutStartedAt));
    }

    if (typeof this.data.analytics.checkoutPriceKey !== "string") {
      this.data.analytics.checkoutPriceKey = "";
    }

    if (!Number.isFinite(Number(this.data.analytics.premiumUnlockedAt))) {
      this.data.analytics.premiumUnlockedAt = 0;
    } else {
      this.data.analytics.premiumUnlockedAt = Math.floor(Number(this.data.analytics.premiumUnlockedAt));
    }

    // Legacy migration: UI used to bypass StorageManager and write localStorage directly.
    // Sync once into StorageManager, then delete legacy key to stop drift.
    if (this._syncLegacyStatsSharingPromptStage()) {
      this._save();
    }

    // Stage -> Flags (best-effort, avoids re-prompting existing users)
    // stage>=1 => 30%, stage>=2 => 50%, stage>=3 => power user (approx)
    try {
      const st = Math.floor(Number(this.data.analytics.statsSharingPromptStage));
      if (Number.isFinite(st) && st > 0) {
        let f = Math.floor(Number(this.data.analytics.statsSharingPromptFlags));
        if (!Number.isFinite(f)) f = 0;

        if (st >= 1) f = (f | 1);
        if (st >= 2) f = (f | 2);
        if (st >= 3) f = (f | 8);

        this.data.analytics.statsSharingPromptFlags = f;
      }
    } catch (_) { /* silent */ }


    if (!this.data.codes) this.data.codes = deepCopy(this.defaultData.codes);

    // Harden runs (sync with config)

    const r = this.data.runs;

    const freeRunsCfg = clampNonNegativeInt(cfg?.limits?.freeRuns);
    const isPrem = (this.data && this.data.isPremium === true);

    // Always sync the configured free runs (single source of truth) AT INIT TIME.
    // NOTE: This is NOT a reactive binding. If WT_CONFIG changes after init,
    // storage keeps the previously loaded value until the next init (reload).
    r.freeRuns = freeRunsCfg;


    // Balance must be a non-negative int
    r.balance = clampNonNegativeInt(r.balance);

    // Keep economy consistent: for non-premium, balance must equal (freeRuns - runStarts).
    // This prevents drift and makes config changes (e.g., 3 -> 2 free runs) behave predictably.
    if (!isPrem) {
      const used = clampNonNegativeInt(this.data?.counters?.runStarts);
      r.balance = Math.max(0, freeRunsCfg - used);
    }

    if (!Number.isFinite(r.limitReachedCount)) r.limitReachedCount = 0;

    // Harden settings
    const st = this.data.settings;
    if (typeof st.mistakesOnly !== "boolean") st.mistakesOnly = false;
    if (typeof st.mistakesOnlyCompletedOnce !== "boolean") st.mistakesOnlyCompletedOnce = false;
    if (!Number.isFinite(st.houseAdHiddenUntil)) st.houseAdHiddenUntil = 0;

    // Harden House Ad state
    const ha = this.data.houseAd || {};
    if (typeof ha.introSeen !== "boolean") ha.introSeen = false;
    if (typeof ha.state !== "string") ha.state = "never_seen";
    if (ha.state !== "never_seen" && ha.state !== "remind_later") {
      ha.state = "never_seen";
    }
    this.data.houseAd = ha;


    // Harden Waitlist state
    const wl = this.data.waitlist || {};
    if (typeof wl.status !== "string") wl.status = "not_seen";
    if (wl.status !== "not_seen" && wl.status !== "seen" && wl.status !== "joined") {
      wl.status = "not_seen";
    }
    if (typeof wl.draftIdea !== "string") wl.draftIdea = "";
    this.data.waitlist = wl;
    // Harden counters
    const c = this.data.counters;
    for (const k in this.defaultData.counters) {
      if (!Number.isFinite(c[k])) c[k] = 0;
    }
    c.premiumUnlockedCount = clampNonNegativeInt(c.premiumUnlockedCount);
    // Harden personal best (RUN)
    if (!Number.isFinite(this.data.personalBest.bestScoreFP)) this.data.personalBest.bestScoreFP = 0;
    if (!Number.isFinite(this.data.personalBest.achievedAt)) this.data.personalBest.achievedAt = 0;

    // Harden bonus best (BONUS)
    if (!Number.isFinite(this.data.bonusBest.bestScoreFP)) this.data.bonusBest.bestScoreFP = 0;
    if (!Number.isFinite(this.data.bonusBest.achievedAt)) this.data.bonusBest.achievedAt = 0;
    // Harden early price (V2+)
    const ep = this.data.earlyPrice || {};
    if (!Number.isFinite(ep.startedAt)) ep.startedAt = 0;
    if (typeof ep.used !== "boolean") ep.used = false;
    this.data.earlyPrice = ep;

    // Harden endgame
    if (typeof this.data.endgame.endgameShown !== "boolean") this.data.endgame.endgameShown = false;
    if (!Number.isFinite(this.data.endgame.endgameShownAt)) this.data.endgame.endgameShownAt = 0;

    // Harden codes
    const cd = this.data.codes;
    if (typeof cd.redeemedOnce !== "boolean") cd.redeemedOnce = false;
    if (typeof cd.code !== "string") cd.code = "";

    // If success page already generated a code, align vanity storage with the main storage object.
    this._syncVanityCodeToCodes();

    // Analytics timestamps
    if (!Number.isFinite(this.data.analytics.firstSeenAt) || this.data.analytics.firstSeenAt <= 0) {
      this.data.analytics.firstSeenAt = now();
    }

    this.data.analytics.lastSeenAt = now();

    // Multi-tab sync (read-only listener)
    this._addStorageListener();

    this._save();
    this.initialized = true;
  };

  StorageManager.prototype._load = function () {
    // Read-only load. No side effects, no _save(), no events.
    try {
      if (typeof window.localStorage === "undefined") return null;

      const raw = window.localStorage.getItem(this.storageKey);
      const parsed = safeJsonParse(raw);

      return (parsed && typeof parsed === "object") ? parsed : null;
    } catch (_) {
      return null;
    }
  };

  StorageManager.prototype._emit = function () {
    try {
      window.dispatchEvent(new CustomEvent(EVT));
    } catch (_) {
      // silent
    }
  };




  StorageManager.prototype._save = function () {
    if (!this.data) return;
    this.data.updatedAt = now();

    try {
      if (typeof window.localStorage === "undefined") return;

      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch (err) {
        // Fail closed: no auto-delete, no recursion, no surprises.
        // One-shot UI signal: persistence is currently broken (quota/private mode/etc).
        try { console.warn("[WT Storage] Save failed (quota?):", err?.name || err); } catch (_) { }

        if (this._saveFailedOnce !== true) {
          this._saveFailedOnce = true;
          try { window.dispatchEvent(new CustomEvent(EVT_SAVE_FAILED)); } catch (_) { /* silent */ }
        }

        return;
      }


      this._emit();
    } catch (_) {
      // silent
    }
  };





  StorageManager.prototype._addStorageListener = function () {
    if (this._storageListenerAdded) return;

    window.addEventListener("storage", (event) => {
      if (!event || event.key !== this.storageKey) return;

      if (event.newValue == null) {
        this.data = deepCopy(this.defaultData);
        this.data.createdAt = now();
        this.data.updatedAt = now();
        this.data.analytics.firstSeenAt = now();
        this.data.analytics.lastSeenAt = now();
        this._emit();
        return;
      }

      const updatedData = safeJsonParse(event.newValue);
      if (!updatedData || typeof updatedData !== "object") return;
      if (String(updatedData.version || "") !== String(this.defaultData.version || "")) return;

      // Mise à jour locale uniquement (ne jamais _save() ici)
      this.data = updatedData;

      // Notifie l'UI de CET onglet
      this._emit();
    });

    this._storageListenerAdded = true;
  };







  StorageManager.prototype._clearOldData = function () {
    // Disabled: storage must not delete user data silently.
    // Keep method for backward compatibility; no-op by design.
    return;
  };






  StorageManager.prototype._wipeAndReset = function () {
    this.data = deepCopy(this.defaultData);
    this.data.createdAt = now();
    this.data.updatedAt = now();

    // initialize analytics timestamps
    this.data.analytics.firstSeenAt = now();
    this.data.analytics.lastSeenAt = now();

    this._save();
  };

  StorageManager.prototype._ensureItemStats = function (idNum) {
    const k = String(idNum);
    if (!this.data.statsByItem) this.data.statsByItem = {};
    if (!this.data.statsByItem[k]) {
      this.data.statsByItem[k] = {
        seenCount: 0,
        correctCount: 0,
        wrongCount: 0,
        lastSeenAt: 0,
        lastWrongAt: 0,
        lastCorrectAt: 0
      };
    }
    const s = this.data.statsByItem[k];
    if (!Number.isFinite(s.seenCount)) s.seenCount = 0;
    if (!Number.isFinite(s.correctCount)) s.correctCount = 0;
    if (!Number.isFinite(s.wrongCount)) s.wrongCount = 0;
    if (!Number.isFinite(s.lastSeenAt)) s.lastSeenAt = 0;
    if (!Number.isFinite(s.lastWrongAt)) s.lastWrongAt = 0;
    if (!Number.isFinite(s.lastCorrectAt)) s.lastCorrectAt = 0;
    return s;
  };


  StorageManager.prototype._compileCodeRegex = function () {
    if (this._premiumCodeRe !== undefined) return;

    const cfg = this.config || {};
    const raw = String(cfg?.premiumCodeRegex || "").trim();

    if (!raw) {
      this._premiumCodeRe = null;
      return;
    }

    try {
      this._premiumCodeRe = new RegExp(raw);
    } catch (_) {
      this._premiumCodeRe = null;
    }
  };

  // Minimal sync: if success page wrote a valid code into vanity localStorage key,
  // persist it into storage's single source of truth (data.codes.code).
  // No business logic: does NOT unlock premium, does NOT set redeemedOnce, does NOT touch counters.
  StorageManager.prototype._syncVanityCodeToCodes = function () {
    if (!this.data) return false;

    const cfg = this.config || {};
    const vanityKey = String(cfg?.storage?.vanityCodeStorageKey || "").trim();
    if (!vanityKey) return false;

    // Ensure codes shape exists
    if (!this.data.codes || typeof this.data.codes !== "object") {
      this.data.codes = deepCopy(this.defaultData.codes);
    }
    const cd = this.data.codes;
    if (typeof cd.redeemedOnce !== "boolean") cd.redeemedOnce = false;
    if (typeof cd.code !== "string") cd.code = "";

    // Validate vanity code with config regex
    this._compileCodeRegex();
    const re = this._premiumCodeRe;
    if (!re) return false;

    // Defensive: RegExp.test() is stateful with /g or /y
    try { re.lastIndex = 0; } catch (_) { }

    let vanity = "";
    try {
      vanity = String(window.localStorage.getItem(vanityKey) || "").trim();
    } catch (_) {
      vanity = "";
    }

    try { re.lastIndex = 0; } catch (_) { }
    if (!vanity || !re.test(vanity)) return false;

    // Only write if missing or invalid in storage
    const current = String(cd.code || "").trim();
    try { re.lastIndex = 0; } catch (_) { }
    if (current && re.test(current)) return false;

    cd.code = vanity;
    this.data.codes = cd;

    try { window.localStorage.removeItem(vanityKey); } catch (_) { }

    return true;
  };

  StorageManager.prototype.getVanityCode = function () {
    this._compileCodeRegex();
    const re = this._premiumCodeRe;
    if (!re) return "";

    const stored = String(this.data?.codes?.code || "").trim();
    try { re.lastIndex = 0; } catch (_) { }
    if (stored && re.test(stored)) return stored;

    const cfg = this.config || {};
    const vanityKey = String(cfg?.storage?.vanityCodeStorageKey || "").trim();
    if (!vanityKey) return "";

    let code = "";
    try {
      code = String(window.localStorage.getItem(vanityKey) || "").trim();
    } catch (_) {
      code = "";
    }

    try { re.lastIndex = 0; } catch (_) { }
    if (!code || !re.test(code)) return "";

    return code;
  };

  // Legacy migration: stats sharing prompt stage was previously stored outside StorageManager.
  // Old key: `${storageKey}:statsSharingPromptStage`

  StorageManager.prototype._syncLegacyStatsSharingPromptStage = function () {
    if (!this.data) return false;

    const base = String(this.storageKey || "").trim();
    if (!base) return false;

    const legacyKey = `${base}:statsSharingPromptStage`;

    let raw = null;
    try { raw = window.localStorage.getItem(legacyKey); } catch (_) { raw = null; }
    if (raw == null) return false;

    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (!this.data.analytics || typeof this.data.analytics !== "object") {
        this.data.analytics = deepCopy(this.defaultData.analytics);
      }
      this.data.analytics.statsSharingPromptStage = Math.floor(n);
    }

    try { window.localStorage.removeItem(legacyKey); } catch (_) { }
    return true;
  };

  StorageManager.prototype._getUiDeviceFlagKey = function (suffix) {
    const base = String(this.storageKey || "").trim();
    const s = String(suffix || "").trim();
    if (!base || !s) return "";
    return `${base}:${s}`;
  };

  StorageManager.prototype._readLegacyUiDeviceFlag = function (suffix) {
    const key = this._getUiDeviceFlagKey(suffix);
    if (!key) return false;
    try { return window.localStorage.getItem(key) === "1"; } catch (_) { return false; }
  };

  StorageManager.prototype._readUiDeviceFlag = function (suffix) {
    const s = String(suffix || "").trim();
    if (!s) return false;

    if (!this.data || !this.data.uiDeviceFlags || typeof this.data.uiDeviceFlags !== "object") {
      return false;
    }

    return this.data.uiDeviceFlags[s] === true;
  };

  StorageManager.prototype._writeUiDeviceFlag = function (suffix) {
    const s = String(suffix || "").trim();
    if (!s || !this.data) return;

    if (!this.data.uiDeviceFlags || typeof this.data.uiDeviceFlags !== "object") {
      this.data.uiDeviceFlags = deepCopy(this.defaultData.uiDeviceFlags);
    }

    if (this.data.uiDeviceFlags[s] === true) return;

    this.data.uiDeviceFlags[s] = true;
    this._save();
  };

  StorageManager.prototype._migrateUiDeviceFlagsFromLegacyKeys = function () {
    if (!this.data) return false;

    if (!this.data.uiDeviceFlags || typeof this.data.uiDeviceFlags !== "object") {
      this.data.uiDeviceFlags = deepCopy(this.defaultData.uiDeviceFlags);
    }

    const map = [
      "firstRunFramingSeen",
      "premiumFirstRunFramingSeen",
      "secretChestHintSolved",
      "secretChestWelcomeShown"
    ];

    let changed = false;

    map.forEach((suffix) => {
      if (this.data.uiDeviceFlags[suffix] === true) return;
      if (this._readLegacyUiDeviceFlag(suffix) !== true) return;

      this.data.uiDeviceFlags[suffix] = true;
      changed = true;
    });

    map.forEach((suffix) => {
      const key = this._getUiDeviceFlagKey(suffix);
      if (!key) return;
      try { window.localStorage.removeItem(key); } catch (_) { }
    });

    return changed;
  };

  StorageManager.prototype.hasSeenFirstRunFraming = function () {
    return this._readUiDeviceFlag("firstRunFramingSeen");
  };

  StorageManager.prototype.markSeenFirstRunFraming = function () {
    this._writeUiDeviceFlag("firstRunFramingSeen");
  };

  StorageManager.prototype.hasSeenPremiumFirstRunFraming = function () {
    return this._readUiDeviceFlag("premiumFirstRunFramingSeen");
  };

  StorageManager.prototype.markSeenPremiumFirstRunFraming = function () {
    this._writeUiDeviceFlag("premiumFirstRunFramingSeen");
  };

  StorageManager.prototype.hasSolvedSecretChestHint = function () {
    return this._readUiDeviceFlag("secretChestHintSolved");
  };

  StorageManager.prototype.markSolvedSecretChestHint = function () {
    this._writeUiDeviceFlag("secretChestHintSolved");
  };

  StorageManager.prototype.hasShownSecretChestWelcome = function () {
    return this._readUiDeviceFlag("secretChestWelcomeShown");
  };

  StorageManager.prototype.markShownSecretChestWelcome = function () {
    this._writeUiDeviceFlag("secretChestWelcomeShown");
  };

  StorageManager.prototype.resetUiDeviceFlags = function () {
    if (!this.data) return;

    this.data.uiDeviceFlags = deepCopy(this.defaultData.uiDeviceFlags);
    this._save();

    const keys = [
      this._getUiDeviceFlagKey("firstRunFramingSeen"),
      this._getUiDeviceFlagKey("premiumFirstRunFramingSeen"),
      this._getUiDeviceFlagKey("secretChestHintSolved"),
      this._getUiDeviceFlagKey("secretChestWelcomeShown")
    ];

    keys.forEach((key) => {
      if (!key) return;
      try { window.localStorage.removeItem(key); } catch (_) { }
    });
  };


  // ============================================
  // Getters
  // ============================================
  StorageManager.prototype.isPremium = function () {
    return !!(this.data && this.data.isPremium);
  };

  StorageManager.prototype.getStatsSharingPromptStage = function () {
    const a = this.data?.analytics || {};
    const n = Number(a.statsSharingPromptStage);
    return Number.isFinite(n) ? Math.floor(n) : -1;
  };

  StorageManager.prototype.setStatsSharingPromptStage = function (stageIndex) {
    if (!this.data) return;

    const n = Number(stageIndex);
    if (!Number.isFinite(n)) return;

    if (!this.data.analytics || typeof this.data.analytics !== "object") {
      this.data.analytics = deepCopy(this.defaultData.analytics);
    }

    this.data.analytics.statsSharingPromptStage = Math.floor(n);
    this._save();
  };


  StorageManager.prototype.getStatsSharingPromptFlags = function () {
    const a = this.data?.analytics || {};
    const n = Number(a.statsSharingPromptFlags);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };

  StorageManager.prototype.setStatsSharingPromptFlags = function (flags) {
    if (!this.data) return;

    const n = Number(flags);
    if (!Number.isFinite(n)) return;

    if (!this.data.analytics || typeof this.data.analytics !== "object") {
      this.data.analytics = deepCopy(this.defaultData.analytics);
    }

    this.data.analytics.statsSharingPromptFlags = Math.floor(n);
    this._save();
  };

  StorageManager.prototype.markStatsSharingPromptFlag = function (flagBit) {
    if (!this.data) return;

    const b = Number(flagBit);
    if (!Number.isFinite(b) || b <= 0) return;

    const cur = this.getStatsSharingPromptFlags();
    const next = (cur | Math.floor(b));
    if (next === cur) return;

    this.setStatsSharingPromptFlags(next);
  };

  StorageManager.prototype.getStatsSharingSnoozeUntilRunCompletes = function () {
    const a = this.data?.analytics || {};
    const n = Number(a.statsSharingSnoozeUntilRunCompletes);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  };

  StorageManager.prototype.setStatsSharingSnoozeUntilRunCompletes = function (n) {
    if (!this.data) return;

    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return;

    if (!this.data.analytics || typeof this.data.analytics !== "object") {
      this.data.analytics = deepCopy(this.defaultData.analytics);
    }

    this.data.analytics.statsSharingSnoozeUntilRunCompletes = Math.floor(v);
    this._save();
  };

  StorageManager.prototype.snoozeStatsSharingPromptNextEnd = function () {
    if (!this.data) return;

    const runs = clampNonNegativeInt(this.data?.counters?.runCompletes);
    this.setStatsSharingSnoozeUntilRunCompletes(runs + 1);
  };


  StorageManager.prototype.getRunsBalance = function () {
    return clampNonNegativeInt(this.data?.runs?.balance);
  };




  // Runs used in the economy sense: how many runs were actually started (consumeRunOrBlock increments runStarts).
  StorageManager.prototype.getRunsUsed = function () {
    return clampNonNegativeInt(this.data?.counters?.runStarts);
  };

  StorageManager.prototype.getRunNumber = function () {
    return clampNonNegativeInt(this.data?.counters?.runNumber);
  };

  StorageManager.prototype.getSecretBonusFreeRunsUsed = function () {
    return clampNonNegativeInt(this.data?.counters?.secretBonusFreeRunsUsed);
  };

  StorageManager.prototype.incrementSecretBonusFreeRunsUsed = function () {
    if (!this.data) return;

    if (!this.data.counters || typeof this.data.counters !== "object") {
      this.data.counters = deepCopy(this.defaultData.counters);
    }

    const cur = clampNonNegativeInt(this.data.counters.secretBonusFreeRunsUsed);
    this.data.counters.secretBonusFreeRunsUsed = cur + 1;
    this._save();
  };


  StorageManager.prototype.getCounters = function () {
    return deepCopy(this.data?.counters || {});
  };

  StorageManager.prototype.getStoredPremiumCode = function () {
    return String(this.data?.codes?.code || "").trim();
  };


  StorageManager.prototype.getData = function () {
    return deepCopy(this.data || {});
  };

  // Return a defensive copy (prevents accidental mutation outside storage.js)
  StorageManager.prototype.getItemStats = function (id) {
    const s = this.data?.statsByItem?.[String(id)] || null;
    if (!s || typeof s !== "object") return null;
    return {
      seenCount: clampNonNegativeInt(s.seenCount),
      correctCount: clampNonNegativeInt(s.correctCount),
      wrongCount: clampNonNegativeInt(s.wrongCount),
      lastSeenAt: clampNonNegativeInt(s.lastSeenAt),
      lastWrongAt: clampNonNegativeInt(s.lastWrongAt),
      lastCorrectAt: clampNonNegativeInt(s.lastCorrectAt)
    };
  };

  // Return a defensive copy of the full stats map (for game.js deck rebuild hook)
  StorageManager.prototype.getStatsByItem = function () {
    const src = this.data?.statsByItem;
    const out = {};
    if (!src || typeof src !== "object") return out;

    for (const k in src) {
      const s = src[k];
      if (!s || typeof s !== "object") continue;
      out[String(k)] = {
        seenCount: clampNonNegativeInt(s.seenCount),
        correctCount: clampNonNegativeInt(s.correctCount),
        wrongCount: clampNonNegativeInt(s.wrongCount),
        lastSeenAt: clampNonNegativeInt(s.lastSeenAt),
        lastWrongAt: clampNonNegativeInt(s.lastWrongAt),
        lastCorrectAt: clampNonNegativeInt(s.lastCorrectAt)
      };
    }
    return out;
  };

  // Secret bonus: pool strictly limited to "already seen" items.
  // Source of truth: statsByItem[id].seenCount > 0
  // (Selection logic belongs to game.js; storage provides the fact.)
  StorageManager.prototype.getSeenItemIds = function () {
    const stats = this.data?.statsByItem;
    const out = [];
    if (!stats || typeof stats !== "object") return out;

    for (const k in stats) {
      const s = stats[k];
      if (!s || typeof s !== "object") continue;

      if (clampNonNegativeInt(s.seenCount) > 0) {
        const idNum = safeIdNum(k);
        if (idNum != null) out.push(idNum);
      }
    }

    return out;
  };


  StorageManager.prototype.getWrongCountTotal = function () {
    const stats = this.data?.statsByItem || {};
    let total = 0;
    for (const k in stats) {
      total += clampNonNegativeInt(stats[k]?.wrongCount);
    }
    return total;
  };

  // Unique pool coverage: number of distinct items where seenCount > 0.
  StorageManager.prototype.getUniqueSeenCount = function () {
    const stats = this.data?.statsByItem || {};
    let seen = 0;
    for (const k in stats) {
      if (clampNonNegativeInt(stats[k]?.seenCount) > 0) seen += 1;
    }
    return seen;
  };

  StorageManager.prototype.hasSeenAllItems = function (totalCount) {
    const stats = this.data?.statsByItem || {};
    const n = clampNonNegativeInt(totalCount);
    if (n <= 0) return false;

    let seen = 0;
    for (const k in stats) {
      if (clampNonNegativeInt(stats[k]?.seenCount) > 0) seen += 1;
    }
    return seen >= n;
  };


  // Convenience getter: "pool exhausted" using config as source of truth.
  // UI/game should not invent a number; it comes from WT_CONFIG.game.poolSize.
  StorageManager.prototype.hasSeenAllWordTraps = function () {
    return this.isPoolExhausted();
  };

  // Pool exhausted (single source of truth): seenDistinct >= config.game.poolSize
  StorageManager.prototype.isPoolExhausted = function () {
    if (!this.data) return false;
    const total = clampNonNegativeInt(this.config?.game?.poolSize);
    if (total <= 0) return false;
    return this.hasSeenAllItems(total);
  };


  // Active mistakes: items where the last interaction is wrong (lw > lc).
  StorageManager.prototype.getActiveMistakesCount = function () {
    const stats = this.data?.statsByItem || {};
    let count = 0;

    for (const k in stats) {
      const s = stats[k];
      if (!s || typeof s !== "object") continue;

      const lw = Number(s.lastWrongAt || 0);
      const lc = Number(s.lastCorrectAt || 0);

      if (lw > lc) count += 1;
    }

    return count;
  };


  StorageManager.prototype.isMastered = function () {
    return this.isPoolExhausted() && this.getActiveMistakesCount() === 0;
  };


  // Persisted "revealed at least once" flag for post-completion UX (END -> LANDING)
  StorageManager.prototype.hasPostCompletionSeenOnce = function () {
    return !!(this.data?.postCompletion?.postCompletionShown);
  };

  StorageManager.prototype.markPostCompletionSeenOnce = function () {
    if (!this.data) return;
    if (!this.data.postCompletion || typeof this.data.postCompletion !== "object") {
      this.data.postCompletion = deepCopy(this.defaultData.postCompletion);
    }

    if (this.data.postCompletion.postCompletionShown === true) return;

    this.data.postCompletion.postCompletionShown = true;
    this.data.postCompletion.postCompletionAt = now();
    this._save();
  };

  // One-shot: halfway milestone (pool midpoint)
  StorageManager.prototype.hasHalfwayMilestoneShown = function () {
    return !!(this.data?.postCompletion?.halfwayMilestoneShown);
  };

  StorageManager.prototype.markHalfwayMilestoneShown = function () {
    if (!this.data) return;

    if (!this.data.postCompletion || typeof this.data.postCompletion !== "object") {
      this.data.postCompletion = deepCopy(this.defaultData.postCompletion);
    }

    if (this.data.postCompletion.halfwayMilestoneShown === true) return;

    this.data.postCompletion.halfwayMilestoneShown = true;
    this.data.postCompletion.halfwayMilestoneShownAt = now();
    this._save();
  };

  // One-shot: did we already celebrate "seen all 200"?
  StorageManager.prototype.hasPoolCompleteCelebrated = function () {
    return !!(this.data?.postCompletion?.poolCompleteCelebrated);
  };

  StorageManager.prototype.markPoolCompleteCelebrated = function () {
    if (!this.data) return;

    if (!this.data.postCompletion || typeof this.data.postCompletion !== "object") {
      this.data.postCompletion = deepCopy(this.defaultData.postCompletion);
    }

    if (this.data.postCompletion.poolCompleteCelebrated === true) return;

    this.data.postCompletion.poolCompleteCelebrated = true;
    this.data.postCompletion.poolCompleteCelebratedAt = now();
    this._save();
  };


  StorageManager.prototype.hasMasteredCelebrated = function () {
    return !!(this.data?.postCompletion?.masteredCelebrated);
  };

  StorageManager.prototype.markMasteredCelebrated = function () {
    if (!this.data) return;

    if (!this.data.postCompletion || typeof this.data.postCompletion !== "object") {
      this.data.postCompletion = deepCopy(this.defaultData.postCompletion);
    }

    if (this.data.postCompletion.masteredCelebrated === true) return;

    this.data.postCompletion.masteredCelebrated = true;
    this.data.postCompletion.masteredCelebratedAt = now();
    this._save();
  };

  StorageManager.prototype.getPersonalBest = function () {
    const pb = this.data?.personalBest || {};
    return {
      bestScoreFP: clampNonNegativeInt(pb.bestScoreFP),
      achievedAt: clampNonNegativeInt(pb.achievedAt)
    };
  };

  // LANDING stats (UI-only consumer): last runs (most recent first)
  // Source of truth: storage.data.history.lastRuns (max 20)
  StorageManager.prototype.getLastRuns = function (maxCount) {
    const n = clampNonNegativeInt(maxCount);
    if (n <= 0) return [];

    const list = (this.data?.history && Array.isArray(this.data.history.lastRuns))
      ? this.data.history.lastRuns
      : [];

    return list.slice(0, n).map((e) => {
      const it = (e && typeof e === "object") ? e : {};
      return {
        runNumber: clampNonNegativeInt(it.runNumber),
        endedAt: clampNonNegativeInt(it.endedAt),
        scoreFP: clampNonNegativeInt(it.scoreFP),
        meta: (it.meta && typeof it.meta === "object") ? it.meta : {}
      };
    });
  };

  StorageManager.prototype.getRunPaceTotals = function () {
    const rp = (this.data?.history && this.data.history.runPaceTotals && typeof this.data.history.runPaceTotals === "object")
      ? this.data.history.runPaceTotals
      : {};

    return {
      runCount: clampNonNegativeInt(rp.runCount),
      totalNewSeen: clampNonNegativeInt(rp.totalNewSeen)
    };
  };


  StorageManager.prototype.getEarlyPriceState = function () {
    const ep = this.data?.earlyPrice || {};
    const startedAt = clampNonNegativeInt(ep.startedAt);

    // Window length is config-driven (single source of truth for mechanics)
    const windowMs = clampNonNegativeInt(this.config?.earlyPriceWindowMs);


    if (!startedAt || windowMs <= 0) {
      return { phase: "STANDARD", remainingMs: 0, startedAt };
    }

    const elapsed = now() - startedAt;
    const remainingMs = Math.max(0, windowMs - elapsed);
    const phase = remainingMs > 0 ? "EARLY" : "STANDARD";
    return { phase, remainingMs, startedAt };
  };


  // ============================================
  // Economy (Runs)
  // ============================================
  // V2 rule:
  // - freeRuns (config.limits.freeRuns)
  // - after freeRuns: paywall
  // - no daily reset
  StorageManager.prototype.consumeRunOrBlock = function () {
    if (!this.data) return { ok: false, reason: "NO_DATA", balance: 0 };

    if (this.isPremium()) {
      // Runs used metric should reflect actual starts, even for premium.
      this.data.counters.runStarts = clampNonNegativeInt(this.data.counters.runStarts) + 1;
      this._save();
      return { ok: true, reason: "PREMIUM", balance: this.getRunsBalance() };
    }

    const r = this.data.runs || {};
    const bal = clampNonNegativeInt(r.balance);

    // Normal consumption (free runs)
    if (bal > 0) {
      r.balance = Math.max(0, bal - 1);
      this.data.counters.runStarts = clampNonNegativeInt(this.data.counters.runStarts) + 1;
      this._save();
      return { ok: true, reason: "CONSUMED", balance: this.getRunsBalance() };
    }

    r.limitReachedCount = clampNonNegativeInt(r.limitReachedCount) + 1;
    this._save();
    return { ok: false, reason: "NO_RUNS", balance: 0 };
  };

  // PRACTICE (Mistakes only) economy gate (separate from RUN economy)
  StorageManager.prototype.consumePracticeOrBlock = function () {
    if (!this.data) return { ok: false, reason: "NO_DATA", used: 0, limit: 0 };

    const limit = clampNonNegativeInt(this.config?.mistakesOnly?.freeRunsLimit);
    const used = clampNonNegativeInt(this.data.counters.practiceFreeRunsUsed);

    if (this.isPremium()) {
      this.data.counters.practiceFreeRunsUsed = used + 1;
      this._save();
      return { ok: true, reason: "PREMIUM", used: used + 1, limit };
    }

    if (limit > 0 && used < limit) {
      this.data.counters.practiceFreeRunsUsed = used + 1;
      this._save();
      return { ok: true, reason: "CONSUMED", used: used + 1, limit };
    }

    this._save();
    return { ok: false, reason: "NO_RUNS", used, limit };
  };

  StorageManager.prototype.getPracticeRunsRemaining = function () {
    if (!this.data) return 0;
    if (this.isPremium()) return Infinity;

    const limit = clampNonNegativeInt(this.config?.mistakesOnly?.freeRunsLimit);
    const used = clampNonNegativeInt(this.data?.counters?.practiceFreeRunsUsed);
    return Math.max(0, limit - used);
  };

  StorageManager.prototype.getPracticeFreeRunsUsed = function () {
    return clampNonNegativeInt(this.data?.counters?.practiceFreeRunsUsed);
  };


  // ============================================
  // Settings
  // ============================================

  StorageManager.prototype.setMistakesOnly = function (on) {
    if (!this.data) return;
    this.data.settings.mistakesOnly = (on === true);
    this._save();
  };

  StorageManager.prototype.getMistakesOnly = function () {
    return !!(this.data?.settings?.mistakesOnly);
  };

  StorageManager.prototype.markMistakesOnlyCompletedOnce = function () {
    if (!this.data) return;
    this.data.settings.mistakesOnlyCompletedOnce = true;
    this._save();
  };

  StorageManager.prototype.hasUsedMistakesOnly = function () {
    return !!(this.data?.settings?.mistakesOnlyCompletedOnce);
  };

  // ============================================
  // House Ad / Waitlist persisted states (V2)
  // ============================================

  StorageManager.prototype.hasSeenHouseAdIntro = function () {
    return !!(this.data?.houseAd?.introSeen);
  };

  StorageManager.prototype.markSeenHouseAdIntro = function () {
    if (!this.data) return;
    if (!this.data.houseAd || typeof this.data.houseAd !== "object") {
      this.data.houseAd = deepCopy(this.defaultData.houseAd);
    }
    this.data.houseAd.introSeen = true;
    this._save();
  };

  StorageManager.prototype.getHouseAdState = function () {
    const s = String(this.data?.houseAd?.state || "").trim();

    // Migration KISS: legacy "dismissed" => treated as "remind_later"
    if (s === "dismissed") {
      try {
        if (!this.data.houseAd || typeof this.data.houseAd !== "object") {
          this.data.houseAd = deepCopy(this.defaultData.houseAd);
        }
        this.data.houseAd.state = "remind_later";
        this._save();
      } catch (_) { /* silent */ }
      return "remind_later";
    }

    return (s === "never_seen" || s === "remind_later") ? s : "never_seen";
  };

  StorageManager.prototype.setHouseAdState = function (state) {
    if (!this.data) return;
    const s = String(state || "").trim();
    if (s !== "never_seen" && s !== "remind_later") return;

    if (!this.data.houseAd || typeof this.data.houseAd !== "object") {
      this.data.houseAd = deepCopy(this.defaultData.houseAd);
    }
    this.data.houseAd.state = s;
    this._save();
  };


  StorageManager.prototype.getWaitlistStatus = function () {
    const s = String(this.data?.waitlist?.status || "").trim();
    return (s === "not_seen" || s === "seen" || s === "joined") ? s : "not_seen";
  };

  StorageManager.prototype.setWaitlistStatus = function (status) {
    if (!this.data) return;
    const s = String(status || "").trim();
    if (s !== "not_seen" && s !== "seen" && s !== "joined") return;

    if (!this.data.waitlist || typeof this.data.waitlist !== "object") {
      this.data.waitlist = deepCopy(this.defaultData.waitlist);
    }
    this.data.waitlist.status = s;
    this._save();
  };

  StorageManager.prototype.getWaitlistDraftIdea = function () {
    const s = String(this.data?.waitlist?.draftIdea || "").trim();
    return s;
  };

  StorageManager.prototype.setWaitlistDraftIdea = function (idea) {
    if (!this.data) return;

    if (!this.data.waitlist || typeof this.data.waitlist !== "object") {
      this.data.waitlist = deepCopy(this.defaultData.waitlist);
    }

    this.data.waitlist.draftIdea = String(idea || "").trim();
    this._save();
  };





  StorageManager.prototype.getHouseAdHiddenUntil = function () {
    return clampNonNegativeInt(this.data?.settings?.houseAdHiddenUntil);
  };

  // True if House Ad is currently hidden by timestamp.
  StorageManager.prototype.isHouseAdHiddenNow = function () {
    const until = this.getHouseAdHiddenUntil();
    return (until > 0 && now() < until);
  };

  // Set an absolute hide-until timestamp (ms).
  StorageManager.prototype.setHouseAdHiddenUntil = function (untilMs) {
    if (!this.data) return;
    if (!this.data.settings || typeof this.data.settings !== "object") {
      this.data.settings = deepCopy(this.defaultData.settings);
    }

    const until = clampNonNegativeInt(untilMs);
    this.data.settings.houseAdHiddenUntil = until;
    this._save();
  };

  StorageManager.prototype.hideHouseAdUsingConfig = function () {
    if (!this.data) return { ok: false, until: 0 };

    const hideMs = clampNonNegativeInt(this.config?.houseAd?.hideMs);
    if (hideMs <= 0) return { ok: false, until: 0 };

    const until = now() + hideMs;

    // Ensure shapes exist (defensive)
    if (!this.data.houseAd || typeof this.data.houseAd !== "object") {
      this.data.houseAd = deepCopy(this.defaultData.houseAd);
    }
    if (!this.data.settings || typeof this.data.settings !== "object") {
      this.data.settings = deepCopy(this.defaultData.settings);
    }

    // Single write: state + hide-until, then one _save() / one EVT.
    this.data.houseAd.state = "remind_later";
    this.data.settings.houseAdHiddenUntil = clampNonNegativeInt(until);

    this._save();
    return { ok: true, until: until };
  };

  StorageManager.prototype.clearHouseAdHidden = function () {
    this.setHouseAdHiddenUntil(0);
  };

  // Config-driven unlock: has the user seen enough unique items to unlock House Ad?
  // Source of truth: WT_CONFIG.houseAd.minUniqueSeenToShow.
  StorageManager.prototype.hasReachedHouseAdThreshold = function () {
    if (!this.data) return false;

    const cfg = this.config || {};
    const n = clampNonNegativeInt(cfg?.houseAd?.minUniqueSeenToShow);
    if (n <= 0) return false;

    const stats = this.data?.statsByItem || {};
    let seenDistinct = 0;

    for (const k in stats) {
      if (clampNonNegativeInt(stats[k]?.seenCount) > 0) seenDistinct += 1;
      if (seenDistinct >= n) return true;
    }

    return false;
  };

  // Config-driven unlock: has the user seen enough unique items to unlock Waitlist?
  // Source of truth: WT_CONFIG.waitlist.minUniqueSeenToShow.
  StorageManager.prototype.hasReachedWaitlistThreshold = function () {
    if (!this.data) return false;

    const cfg = this.config || {};
    const n = clampNonNegativeInt(cfg?.waitlist?.minUniqueSeenToShow);
    if (n <= 0) return false;

    const stats = this.data?.statsByItem || {};
    let seenDistinct = 0;

    for (const k in stats) {
      if (clampNonNegativeInt(stats[k]?.seenCount) > 0) seenDistinct += 1;
      if (seenDistinct >= n) return true;
    }

    return false;
  };

  // Single decision point: should the House Ad be shown *now*.
  // UI passes only what storage can't know: whether we are currently in-run.
  StorageManager.prototype.shouldShowHouseAdNow = function (ctx) {
    if (!this.data) return false;

    const cfg = this.config || {};
    const haCfg = cfg.houseAd || {};

    if (haCfg.enabled !== true) return false;
    if (!String(haCfg.url || "").trim()) return false;

    // Unlock based on unique seen threshold (not pool exhausted).
    if (this.hasReachedHouseAdThreshold() !== true) return false;

    // Never show during a run.
    if (ctx && ctx.inRun === true) return false;

    // Respect "remind later" hiding window (timestamp).
    if (this.isHouseAdHiddenNow()) return false;

    return true;
  };

  // Single decision point: should the Waitlist be shown *now*.
  // UI passes only what storage can't know: whether we are currently in-run.
  StorageManager.prototype.shouldShowWaitlistNow = function (ctx) {
    if (!this.data) return false;

    const cfg = this.config || {};
    const wlCfg = cfg.waitlist || {};

    if (wlCfg.enabled !== true) return false;

    // Unlock based on unique seen threshold (not pool exhausted).
    if (this.hasReachedWaitlistThreshold() !== true) return false;

    // Never show during a run.
    if (ctx && ctx.inRun === true) return false;

    // Optional: if already joined, never show again (fail-closed).
    const st = String(this.data?.waitlist?.status || "").trim();
    if (st === "joined") return false;

    return true;
  };




  // ============================================
  // Per-answer stats writing (V2)
  // ============================================
  StorageManager.prototype.recordAnswer = function (itemId, isCorrectBool) {
    if (!this.data) return;

    const idNum = safeIdNum(itemId);
    const isCorrect = safeBool(isCorrectBool);

    if (idNum == null || isCorrect == null) return;

    const s = this._ensureItemStats(idNum);
    s.seenCount = clampNonNegativeInt(s.seenCount) + 1;
    s.lastSeenAt = now();

    if (isCorrect) {
      s.correctCount = clampNonNegativeInt(s.correctCount) + 1;
      s.lastCorrectAt = now();
    } else {
      s.wrongCount = clampNonNegativeInt(s.wrongCount) + 1;
      s.lastWrongAt = now();
    }

    this._save();
  };

  StorageManager.prototype.getBonusBest = function () {
    const bb = this.data?.bonusBest || {};
    return {
      bestScoreFP: clampNonNegativeInt(bb.bestScoreFP),
      achievedAt: clampNonNegativeInt(bb.achievedAt)
    };
  };

  // ============================================
  // Run completion (V2)
  // ============================================
  StorageManager.prototype.recordRunComplete = function (runNumber, scoreFP, meta) {
    if (!this.data) return { ok: false, newBest: false };

    const score = clampNonNegativeInt(scoreFP);
    const rn = clampNonNegativeInt(runNumber);

    // Capture completes BEFORE increment (source of truth)
    const prevCompletes = clampNonNegativeInt(this.data?.counters?.runCompletes);

    // Counters
    this.data.counters.runNumber = Math.max(this.data.counters.runNumber, rn);
    this.data.counters.runCompletes = prevCompletes + 1;

    // Personal best
    const pb = this.data.personalBest || { bestScoreFP: 0, achievedAt: 0 };
    const prevBest = clampNonNegativeInt(pb.bestScoreFP);

    const mode = String(meta && meta.mode || "").trim().toUpperCase();
    const isRun = (mode === "RUN");

    let newBest = false;

    if (isRun && score > prevBest) {
      pb.bestScoreFP = score;
      pb.achievedAt = now();
      this.data.personalBest = pb;

      // Do NOT celebrate the very first completion on device
      // Celebrate only if user had already completed at least 1 run before
      newBest = (prevCompletes >= 1);
    }


    // Run history
    const list = (this.data.history && Array.isArray(this.data.history.lastRuns))
      ? this.data.history.lastRuns
      : [];

    const entry = {
      runNumber: rn,
      endedAt: now(),
      scoreFP: score,
      meta: (meta && typeof meta === "object") ? meta : {}
    };

    list.unshift(entry);
    while (list.length > 20) list.pop();

    this.data.history = this.data.history || {};
    this.data.history.lastRuns = list;

    const runMode = String(entry?.meta?.mode || "").trim().toUpperCase();
    const newSeenCount = clampNonNegativeInt(entry?.meta?.newSeenCount);

    const prevPaceTotals = (this.data.history.runPaceTotals && typeof this.data.history.runPaceTotals === "object")
      ? this.data.history.runPaceTotals
      : { runCount: 0, totalNewSeen: 0 };

    this.data.history.runPaceTotals = {
      runCount: clampNonNegativeInt(prevPaceTotals.runCount) + (runMode === "RUN" ? 1 : 0),
      totalNewSeen: clampNonNegativeInt(prevPaceTotals.totalNewSeen) + (runMode === "RUN" ? newSeenCount : 0)
    };

    this._save();

    return { ok: true, newBest, bestScoreFP: clampNonNegativeInt(this.data.personalBest.bestScoreFP) };
  };

  // ============================================
  // Bonus completion (V1)
  // ============================================
  StorageManager.prototype.recordBonusComplete = function (scoreFP, meta) {
    if (!this.data) return { ok: false, newBest: false };

    const score = clampNonNegativeInt(scoreFP);

    // Capture completes BEFORE increment (source of truth)
    const prevCompletes = clampNonNegativeInt(this.data?.counters?.bonusCompletes);

    // Counters
    this.data.counters.bonusCompletes = prevCompletes + 1;

    // Bonus best
    const bb = this.data.bonusBest || { bestScoreFP: 0, achievedAt: 0 };
    const prevBest = clampNonNegativeInt(bb.bestScoreFP);

    const mode = String(meta && meta.mode || "").trim().toUpperCase();
    const isBonus = (mode === "BONUS");

    let newBest = false;

    if (isBonus && score > prevBest) {
      bb.bestScoreFP = score;
      bb.achievedAt = now();
      this.data.bonusBest = bb;

      // Do NOT celebrate the very first completion on device
      newBest = (prevCompletes >= 1);
    }

    this._save();

    return { ok: true, newBest, bestScoreFP: clampNonNegativeInt(this.data.bonusBest.bestScoreFP) };
  };


  // ============================================
  // Paywall / Checkout counters
  // ============================================
  StorageManager.prototype.markLandingViewed = function () {
    if (!this.data) return;
    this.data.counters.landingViewed = clampNonNegativeInt(this.data.counters.landingViewed) + 1;
    this._save();
  };

  StorageManager.prototype.markLandingPlayClicked = function () {
    if (!this.data) return;
    this.data.counters.landingPlayClicked = clampNonNegativeInt(this.data.counters.landingPlayClicked) + 1;
    this._save();
  };

  StorageManager.prototype.markPaywallShown = function () {
    if (!this.data) return;
    this.data.counters.paywallShown = clampNonNegativeInt(this.data.counters.paywallShown) + 1;

    // Early price window starts once, at the first PAYWALL view (persisted).
    const ep = this.data.earlyPrice || {};


    if (!clampNonNegativeInt(ep.startedAt)) {
      ep.startedAt = now();
    }

    this.data.earlyPrice = ep;
    this._save();
  };



  StorageManager.prototype.markCheckoutStarted = function (priceKey) {
    if (!this.data) return;

    const k = String(priceKey || "").trim();
    if (!k) return;

    if (!this.data.counters || typeof this.data.counters !== "object") {
      this.data.counters = deepCopy(this.defaultData.counters);
    }
    if (!this.data.analytics || typeof this.data.analytics !== "object") {
      this.data.analytics = deepCopy(this.defaultData.analytics);
    }

    this.data.counters.checkoutStarted = clampNonNegativeInt(this.data.counters.checkoutStarted) + 1;
    this.data.analytics.checkoutStartedAt = now();
    this.data.analytics.checkoutPriceKey = k;

    this._save();
  };

  StorageManager.prototype.markShareClicked = function () {
    if (!this.data) return;
    this.data.counters.shareClicked = clampNonNegativeInt(this.data.counters.shareClicked) + 1;
    this._save();
  };

  StorageManager.prototype.markInstallPromptShown = function () {
    if (!this.data) return;
    this.data.counters.installPromptShown = clampNonNegativeInt(this.data.counters.installPromptShown) + 1;
    this._save();
  };

  StorageManager.prototype.markHouseAdShown = function () {
    if (!this.data) return;
    this.data.counters.houseAdShown = clampNonNegativeInt(this.data.counters.houseAdShown) + 1;
    this._save();
  };

  StorageManager.prototype.markHouseAdClicked = function () {
    if (!this.data) return;
    this.data.counters.houseAdClicked = clampNonNegativeInt(this.data.counters.houseAdClicked) + 1;
    this._save();
  };

  // ============================================
  // Premium activation (codes)
  // ============================================
  StorageManager.prototype.unlockPremium = function () {
    if (!this.data) return { ok: false, already: false };
    if (this.data.isPremium) return { ok: true, already: true };

    if (!this.data.counters || typeof this.data.counters !== "object") {
      this.data.counters = deepCopy(this.defaultData.counters);
    }
    if (!this.data.analytics || typeof this.data.analytics !== "object") {
      this.data.analytics = deepCopy(this.defaultData.analytics);
    }

    this.data.isPremium = true;

    this.data.analytics.premiumUnlockedAt = now();
    this.data.counters.premiumUnlockedCount = clampNonNegativeInt(this.data.counters.premiumUnlockedCount) + 1;

    this._save();
    return { ok: true, already: false };
  };


  StorageManager.prototype.clearVanityCode = function () {
    const cfg = this.config || {};
    const vanityKey = String(cfg?.storage?.vanityCodeStorageKey || "").trim();
    if (!vanityKey) return;

    try { window.localStorage.removeItem(vanityKey); } catch (_) { }
  };

  StorageManager.prototype.tryRedeemPremiumCode = function (codeInput) {
    if (!this.data) return { ok: false, reason: "NO_DATA" };

    // If already premium, treat as no-op
    if (this.isPremium()) return { ok: true, reason: "ALREADY" };

    const cfg = this.config || {};

    const code = String(codeInput || "").trim();
    if (!code) return { ok: false, reason: "EMPTY" };

    this._compileCodeRegex();
    const re = this._premiumCodeRe;
    if (!re) return { ok: false, reason: "DISABLED" };

    // Defensive: RegExp.test() is stateful with /g or /y
    try { re.lastIndex = 0; } catch (_) { }
    if (!re.test(code)) return { ok: false, reason: "INVALID" };

    // Ensure codes block exists (defensive)
    if (!this.data.codes || typeof this.data.codes !== "object") {
      this.data.codes = { redeemedOnce: false, code: "" };
    }
    if (typeof this.data.codes.redeemedOnce !== "boolean") this.data.codes.redeemedOnce = false;
    if (typeof this.data.codes.code !== "string") this.data.codes.code = "";

    // Enforce "one code per device" if enabled
    const acceptOnce = (cfg.acceptCodeOncePerDevice === true);
    if (acceptOnce && this.data.codes.redeemedOnce === true) {
      return { ok: false, reason: "USED" };
    }

    // Persist code locally in storage data (single source of truth)
    if (acceptOnce) {
      this.data.codes.redeemedOnce = true;
    }
    this.data.codes.code = code;

    // Optional vanity/last code in separate localStorage key (UI convenience)
    const vanityKey = String(cfg?.storage?.vanityCodeStorageKey || "").trim();
    if (vanityKey) {
      try {
        window.localStorage.setItem(vanityKey, code);
      } catch (_) {
        // ignore
      }
    }


    // Counters
    if (this.data.counters) {
      this.data.counters.codeRedeemed = clampNonNegativeInt(this.data.counters.codeRedeemed) + 1;
    }

    // Unlock premium
    // unlockPremium() already persists + emits exactly once.
    const res = this.unlockPremium();
    if (res && res.ok) {
      return { ok: true, reason: "UNLOCKED" };
    }

    // If unlock failed, revert "redeemedOnce" only if we just set it
    if (acceptOnce) {
      this.data.codes.redeemedOnce = false;
    }
    this.data.codes.code = "";
    this._save();

    return { ok: false, reason: "FAILED" };
  };

  // ============================================
  // Anonymous Stats Payload (opt-in sharing)
  // ============================================
  StorageManager.prototype.getAnonymousStatsPayload = function () {
    if (!this.data) return null;
    const cfg = this.config || {};
    const schemaVersion = String(
      cfg?.statsSharing?.schemaVersion != null ? cfg.statsSharing.schemaVersion : ""
    ).trim();

    // Gather top mistakes
    const stats = this.data.statsByItem || {};
    const mistakes = [];
    for (const k in stats) {
      const s = stats[k];
      if (s && clampNonNegativeInt(s.wrongCount) > 0) {
        mistakes.push({
          id: Number(k),
          wrongCount: clampNonNegativeInt(s.wrongCount)
        });
      }
    }
    mistakes.sort((a, b) => b.wrongCount - a.wrongCount);
    const topMistakes = mistakes;

    // Total mistakes
    let totalMistakes = 0;
    for (const m of mistakes) {
      totalMistakes += m.wrongCount;
    }

    // Pool metrics
    // - poolProgress: unique coverage (0..1)
    // - poolExposure: total exposures per poolSize (can exceed 1)
    let uniqueSeenCount = 0;
    let totalSeenEvents = 0;
    for (const k in stats) {
      const sc = clampNonNegativeInt(stats[k]?.seenCount);
      if (sc > 0) uniqueSeenCount++;
      totalSeenEvents += sc;
    }

    const poolSize = clampNonNegativeInt(cfg?.game?.poolSize);
    const poolProgress = poolSize > 0 ? Math.round((uniqueSeenCount / poolSize) * 100) / 100 : 0;
    const poolExposure = poolSize > 0 ? Math.round((totalSeenEvents / poolSize) * 100) / 100 : 0;

    // Device type (simple, no fingerprinting)
    let device = "desktop";
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        device = "mobile";
      }
    } catch (_) { }

    // Runs
    const runs = clampNonNegativeInt(this.data.counters?.runCompletes);

    // Premium
    const isPremium = !!(this.data.isPremium);

    // Personal best
    const personalBest = clampNonNegativeInt(this.data.personalBest?.bestScoreFP);

    return {
      v: schemaVersion,
      ts: new Date().toISOString(),
      runs: runs,
      isPremium: isPremium,
      personalBest: personalBest,

      // Pool metrics
      poolSize: poolSize,
      uniqueSeen: uniqueSeenCount,
      totalSeenEvents: totalSeenEvents,
      poolProgress: poolProgress,
      poolExposure: poolExposure,


      topMistakes: topMistakes,
      totalMistakes: totalMistakes,
      device: device,

      // Funnel (aggregated, local-only)
      funnel: {
        landingViewed: clampNonNegativeInt(this.data.counters?.landingViewed),
        landingPlayClicked: clampNonNegativeInt(this.data.counters?.landingPlayClicked),
        paywallShown: clampNonNegativeInt(this.data.counters?.paywallShown),
        checkoutStarted: clampNonNegativeInt(this.data.counters?.checkoutStarted),
        runStarts: clampNonNegativeInt(this.data.counters?.runStarts),
        runCompletes: clampNonNegativeInt(this.data.counters?.runCompletes),
        bonusCompletes: clampNonNegativeInt(this.data.counters?.bonusCompletes),
        shareClicked: clampNonNegativeInt(this.data.counters?.shareClicked),
        installPromptShown: clampNonNegativeInt(this.data.counters?.installPromptShown),
        codeRedeemed: clampNonNegativeInt(this.data.counters?.codeRedeemed)
      }
    };
  };


  // ============================================
  // Export
  // ============================================
  window.WT_StorageManager = StorageManager;
})();
