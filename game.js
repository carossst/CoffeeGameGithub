// game.js v2.0 - Quiz engine
// RUN engine + selection 
// Zéro accès DOM, zéro localStorage

(() => {
  "use strict";

  // ============================================
  // Internal sentinels (non-UI)
  // - Centralized to avoid scattered implicit fallbacks.
  // - These are NOT product defaults; they are engine invariants.
  // ============================================
  const MODES = window.WT_ENUMS && window.WT_ENUMS.GAME_MODES;
  if (!MODES || !MODES.RUN || !MODES.PRACTICE || !MODES.BONUS) {
    throw new Error("WT_ENUMS.GAME_MODES missing or incomplete. config.js must load before game.js.");
  }

  const INVALID_MAX_CHANCES = 0;
  const NO_FEEDBACK = "";
  const EMPTY_STATS = Object.freeze({ seenCount: 0, wrongCount: 0, correctCount: 0, lastSeenAt: 0, lastWrongAt: 0, lastCorrectAt: 0 });

  // ============================================
  // Helpers
  // ============================================



  function shuffleCopy(arr) {
    const a = Array.isArray(arr) ? arr.slice() : [];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function safeBool(x) {
    return (x === true || x === false) ? x : null;
  }

  function safeIdNum(x) {
    const n = Number(x);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function normalizePool(items) {
    const pool = [];
    const byId = Object.create(null);
    const seen = new Set();

    const list = Array.isArray(items) ? items : [];
    for (const it of list) {
      const idNum = safeIdNum(it && it.id);
      if (idNum == null) continue;
      if (seen.has(idNum)) continue;
      seen.add(idNum);
      pool.push(it);
      byId[String(idNum)] = it;
    }

    return { pool, byId };
  }

  function getStats(statsByItem, idNum) {
    const s = statsByItem ? statsByItem[String(idNum)] : null;
    return s || EMPTY_STATS;
  }




  function getPoolSize(config) {
    const poolSizeCfg = Number(config && config.game && config.game.poolSize);
    const poolSize = (Number.isFinite(poolSizeCfg) && poolSizeCfg > 0) ? Math.floor(poolSizeCfg) : null;
    return poolSize;
  }

  function applyPoolSize(poolAll, poolSize) {
    if (!Array.isArray(poolAll) || poolAll.length === 0) return [];
    if (poolSize == null || poolAll.length <= poolSize) return poolAll;

    // Deterministic slice: keep lowest ids
    return poolAll
      .slice()
      .sort((a, b) => (safeIdNum(a && a.id) || 0) - (safeIdNum(b && b.id) || 0))
      .slice(0, poolSize);
  }

  // ============================================
  // V2 Selection
  // ============================================
  // RUN mode:
  // - If antiRepetitionUntilExhaustion is true:
  //   - Before exhaustion: draw only from unseen items (seenCount === 0)
  //   - After exhaustion: draw from full pool
  // - If antiRepetitionUntilExhaustion is false:
  //   - Always draw from full pool
  //
  // Practice (mistakesOnly):
  // - select ONLY active mistakes where lastWrongAt > lastCorrectAt
  //   (items are excluded once their latest interaction is a correct answer)
  // - order = most recent wrong first (lastWrongAt desc, id asc)
  // - size = exact active-mistake count, optionally capped by config.mistakesOnly.maxItems
  function buildDeck({ items, statsByItem, mistakesOnly, config }) {
    const normalized = normalizePool(items);
    const poolAll = normalized.pool;
    const byId = normalized.byId;

    if (!poolAll.length) return { ids: [], byId };

    const poolSize = getPoolSize(config);
    const pool = applyPoolSize(poolAll, poolSize);

    if (mistakesOnly) {
      const mistakesPoolRaw = pool.filter((it) => {
        const idNum = safeIdNum(it && it.id);
        if (idNum == null) return false;
        const s = getStats(statsByItem, idNum);

        const lw = Number(s.lastWrongAt) || 0;
        const lc = Number(s.lastCorrectAt) || 0;

        // Active mistake: last interaction is wrong
        return lw > lc;
      });

      let mistakesPool = mistakesPoolRaw.slice().sort((a, b) => {
        const ida = safeIdNum(a && a.id) || 0;
        const idb = safeIdNum(b && b.id) || 0;
        const sa = getStats(statsByItem, ida);
        const sb = getStats(statsByItem, idb);
        const ta = Number(sa.lastWrongAt) || 0;
        const tb = Number(sb.lastWrongAt) || 0;
        if (tb !== ta) return tb - ta;
        return ida - idb;
      });

      // Optional cap (config-driven, fail-closed: only applies if valid)
      const rawMax = Number(config?.mistakesOnly?.maxItems);
      const maxItems = (Number.isFinite(rawMax) && rawMax >= 1) ? Math.floor(rawMax) : null;
      if (maxItems != null && mistakesPool.length > maxItems) {
        mistakesPool = mistakesPool.slice(0, maxItems);
      }

      const ids = [];
      for (const it of mistakesPool) {
        const idNum = safeIdNum(it && it.id);
        if (idNum == null) continue;
        ids.push(idNum);
      }

      return { ids, byId };
    }


    const antiRepetitionUntilExhaustion =
      (config && config.game && config.game.antiRepetitionUntilExhaustion) === true;

    if (antiRepetitionUntilExhaustion) {
      const unseen = [];
      for (const it of pool) {
        const idNum = safeIdNum(it && it.id);
        if (idNum == null) continue;
        const s = getStats(statsByItem, idNum);
        const seenCount = Number(s.seenCount) || 0;
        if (seenCount <= 0) unseen.push(idNum);
      }

      return {
        ids: unseen.length
          ? shuffleCopy(unseen)
          : shuffleCopy(pool.map((it) => safeIdNum(it && it.id)).filter((n) => n != null)),
        byId
      };
    }

    return {
      ids: shuffleCopy(pool.map((it) => safeIdNum(it && it.id)).filter((n) => n != null)),
      byId
    };
  }

  // BONUS mode:
  // - deck = ONLY items already seen by the player (seenCount > 0)
  // - respects poolSize
  // - respects secretBonus.minDeckSize
  // - ends when deck ends (no reshuffle, no loop)
  // - uses RUN chances if secretBonus.useRunChances is true
  function buildSeenDeck({ items, statsByItem, config }) {
    const normalized = normalizePool(items);
    const poolAll = normalized.pool;
    const byId = normalized.byId;

    if (!poolAll.length) return { ids: [], byId };

    const poolSize = getPoolSize(config);
    const pool = applyPoolSize(poolAll, poolSize);

    const seenIds = [];
    for (const it of pool) {
      const idNum = safeIdNum(it && it.id);
      if (idNum == null) continue;
      const s = getStats(statsByItem, idNum);
      const seenCount = Number(s.seenCount) || 0;
      if (seenCount > 0) seenIds.push(idNum);
    }

    const rawMinDeck = Number(config?.secretBonus?.minDeckSize);
    const minDeckSize = (Number.isFinite(rawMinDeck) && rawMinDeck >= 1) ? Math.floor(rawMinDeck) : null;

    if (minDeckSize != null && seenIds.length < minDeckSize) {
      return { ids: [], byId };
    }

    return { ids: shuffleCopy(seenIds), byId };
  }

  function buildFullPoolDeck(items, config) {
    const normalized = normalizePool(items);
    const poolAll = normalized.pool;
    const byId = normalized.byId;

    if (!poolAll.length) return { ids: [], byId };

    const poolSize = getPoolSize(config);
    const pool = applyPoolSize(poolAll, poolSize);

    return {
      ids: shuffleCopy(pool.map((it) => safeIdNum(it && it.id)).filter((n) => n != null)),
      byId
    };
  }


  // ============================================
  // GameEngine (V2)
  // ============================================
  class GameEngine {
    constructor() {
      this.run = null;
    }

    // payload:
    // {
    //   items: Array,
    //   statsByItem: Object,
    //   getStatsByItem: Function,
    //   config: Object,
    //   mode: "RUN" | "PRACTICE" | "BONUS"
    // }
    start(payload) {
      if (!payload || typeof payload !== "object") {
        throw new Error("WT_Game.GameEngine.start(): payload object is required.");
      }

      const p = payload;

      if (!Array.isArray(p.items) || p.items.length <= 0) {
        throw new Error("WT_Game.GameEngine.start(): payload.items must be a non-empty array.");
      }
      const items = p.items;

      if (!p.statsByItem || typeof p.statsByItem !== "object") {
        throw new Error("WT_Game.GameEngine.start(): payload.statsByItem is required.");
      }
      const statsByItem = p.statsByItem;

      if (typeof p.getStatsByItem !== "function") {
        throw new Error("WT_Game.GameEngine.start(): payload.getStatsByItem is required.");
      }
      const getStatsByItem = p.getStatsByItem;

      if (!p.config || typeof p.config !== "object") {
        throw new Error('WT_Game.GameEngine.start(): payload.config is required (WT_CONFIG). Wiring error: pass { config } from main/UI when starting a run.');
      }
      const config = p.config;


      // No dynamic stats hook: game.js builds a deck once per start (KISS).

      // Contract v2 (mode-only): mode is the single source of truth.
      // No legacy fallback: p.mistakesOnly is ignored by design.
      const modeRaw = String(p.mode || "").trim().toUpperCase();

      const VALID_MODES = [MODES.RUN, MODES.PRACTICE, MODES.BONUS];

      if (!modeRaw) {
        throw new Error('WT_Game.GameEngine.start(): payload.mode is required ("RUN" | "PRACTICE" | "BONUS").');
      }

      if (!VALID_MODES.includes(modeRaw)) {
        throw new Error(`WT_Game.GameEngine.start(): invalid payload.mode "${modeRaw}".`);
      }

      const requestedMode = modeRaw;

      // Coherence: PRACTICE => mistakesOnly (engine-level authority)
      // KISS: allow PRACTICE only if enabled in config (premium gating remains elsewhere)
      const practiceEnabled = !!(config.mistakesOnly && config.mistakesOnly.enabled);
      const mistakesOnly = (requestedMode === MODES.PRACTICE);

      if (mistakesOnly && !practiceEnabled) {
        throw new Error('WT_Game.GameEngine.start(): PRACTICE requested but config.mistakesOnly.enabled is false.');
      }

      const bonusMode = (requestedMode === MODES.BONUS);
      const effectiveMode = bonusMode ? MODES.BONUS : (mistakesOnly ? MODES.PRACTICE : MODES.RUN);
      // Config-first: WT_CONFIG.game.maxChances
      // V2 strict: NO fallback. If wiring is broken, fail-closed (RUN cannot start).
      const maxChancesCfg = Number(config && config.game && config.game.maxChances);
      const maxChancesValid = (Number.isFinite(maxChancesCfg) && Math.floor(maxChancesCfg) > 0);
      const maxChances = maxChancesValid ? Math.floor(maxChancesCfg) : INVALID_MAX_CHANCES;


      // maxChances is required for runnable modes.
      if (!maxChancesValid) {
        throw new Error("WT_Game.GameEngine.start(): config.game.maxChances must be a positive integer.");
      }

      const deck = bonusMode
        ? buildSeenDeck({ items, statsByItem, config })
        : buildDeck({ items, statsByItem, mistakesOnly, config });

      this.run = {
        mode: effectiveMode,
        items,
        statsByItem,
        getStatsByItem,
        config,


        byId: deck.byId || {},
        ids: Array.isArray(deck.ids) ? deck.ids.slice() : [],
        idx: 0,
        // Chances: RUN + BONUS use maxChances; PRACTICE has no chances (revision mode)
        maxChances: (effectiveMode === MODES.PRACTICE) ? null : maxChances,
        chancesLeft: (effectiveMode === MODES.PRACTICE) ? null : maxChances,

        // Single score across all modes (KISS)
        scoreFP: 0,

        // Mistakes made during this run (END screen)
        runMistakeIds: [],

        last: {
          itemId: null,
          choice: null,
          correctAnswer: null,
          isCorrect: null,
          feedbackLine: NO_FEEDBACK
        },

        // One-shot flag consumed by getState() for UI toast
        justReshuffled: false,

        done: false
      };



      if (!this.run.ids.length) {
        this.run.done = true;
      }

      return this.getState();
    }

    // UI compatibility helpers (ui.js expects these)
    getIndex() {
      if (!this.run) return 0;
      return Number(this.run.idx || 0);
    }

    getTotal() {
      if (!this.run) return 0;
      const ids = Array.isArray(this.run.ids) ? this.run.ids : [];
      return ids.length;
    }

    getCurrent() {
      if (!this.run || this.run.done) return null;
      const idNum = this.run.ids[this.run.idx];
      return this.run.byId[String(idNum)] || null;
    }

    getLast() {
      if (!this.run) return null;
      return this.run.last || null;
    }

    getState() {
      if (!this.run) {
        return {
          mode: "NONE",
          done: true,
          scoreFP: 0,
          chancesLeft: null,
          maxChances: null,
          idx: 0,
          itemsServed: null
        };
      }

      const ids = Array.isArray(this.run.ids) ? this.run.ids : [];
      const idx = Number(this.run.idx || 0);
      const isBonus = (this.run.mode === MODES.BONUS);

      // Contract: items-served signal is derived (no mutable counter).
      // - counts the currently displayed item as "served"
      // - null for non-BONUS modes (to avoid implying mechanics elsewhere)
      const itemsServed = isBonus
        ? (ids.length > 0 ? Math.min(ids.length, Math.max(0, idx) + 1) : 0)
        : null;

      const poolReshuffled = (this.run.mode === MODES.RUN && this.run.justReshuffled === true);

      // one-shot: consume the flag as soon as UI reads state
      if (poolReshuffled) {
        this.run.justReshuffled = false;
      }

      return {
        mode: this.run.mode,
        done: !!this.run.done,
        scoreFP: Number.isFinite(this.run.scoreFP) ? Number(this.run.scoreFP) : 0,
        chancesLeft: (this.run.chancesLeft == null) ? null : Number(this.run.chancesLeft || 0),
        maxChances: (this.run.maxChances == null) ? null : Number(this.run.maxChances),
        idx,
        itemsServed,

        runMistakesCount: Array.isArray(this.run.runMistakeIds)
          ? this.run.runMistakeIds.length
          : 0,

        deckSize: Array.isArray(this.run.ids)
          ? this.run.ids.length
          : 0,

        poolReshuffled
      };

    }

    // - immediate resolution (no Next)
    // - RUN / PRACTICE / BONUS: +1 FP if correct; -1 chance if wrong
    // - BONUS: NO per-item feedback (feedbackLine always empty)
    // - auto-advance to next item (or end)
    answer(choiceBool) {
      if (!this.run || this.run.done) {
        return { done: true, isCorrect: false, feedbackLine: NO_FEEDBACK, state: this.getState(), itemId: null };
      }

      const item = this.getCurrent();
      if (!item) {
        this.run.done = true;
        return { done: true, isCorrect: false, feedbackLine: NO_FEEDBACK, state: this.getState(), itemId: null };
      }


      const idNum = safeIdNum(item.id);
      const correct = safeBool(item.correctAnswer);

      // Fail-closed: content bug should not corrupt the run.
      // Treat as a wrong answer: consume 1 chance, and end if it hits 0.
      if (idNum == null || correct == null) {
        if (this.run.chancesLeft != null) {
          const left = Number(this.run.chancesLeft || 0);
          this.run.chancesLeft = Math.max(0, left - 1);
        }

        // Track mistake for this run (END screen)
        try {
          if (
            idNum != null &&
            Array.isArray(this.run.runMistakeIds) &&
            !this.run.runMistakeIds.includes(idNum)
          ) {
            this.run.runMistakeIds.push(idNum);
          }
        } catch (_) { /* silent */ }

        this.run.last = {
          itemId: idNum,
          choice: (choiceBool === true),
          correctAnswer: correct,
          isCorrect: false,
          feedbackLine: (typeof item.explanationShort === "string")
            ? item.explanationShort
            : NO_FEEDBACK
        };

        if (this.run.chancesLeft != null && Number(this.run.chancesLeft || 0) <= 0) {
          this.run.done = true;
          return {
            done: true,
            itemId: idNum,
            isCorrect: false,
            correctAnswer: correct,
            feedbackLine: this.run.last.feedbackLine,
            state: this.getState()
          };
        }

        this._advanceAfterAnswer();
        return {
          done: !!this.run.done,
          itemId: idNum,
          isCorrect: false,
          correctAnswer: correct,
          feedbackLine: this.run.last.feedbackLine,
          state: this.getState()
        };
      }


      const hasChoice = (choiceBool === true || choiceBool === false);
      const choice = hasChoice ? (choiceBool === true) : null;

      // Timeout (null/undefined/other) is ALWAYS wrong (consumes 1 chance)
      const isCorrect = hasChoice ? (choice === correct) : false;

      // scoring commun à tous les modes (BONUS / RUN / PRACTICE)
      if (isCorrect) {
        this.run.scoreFP = Number(this.run.scoreFP || 0) + 1;
      } else {
        // Track mistake for this run (END screen)
        try {
          if (idNum != null && Array.isArray(this.run.runMistakeIds) && !this.run.runMistakeIds.includes(idNum)) this.run.runMistakeIds.push(idNum);
        } catch (_) { /* silent */ }

        if (this.run.chancesLeft != null) {
          // PRACTICE has chancesLeft === null → no chance consumed
          const left = Number(this.run.chancesLeft || 0);
          this.run.chancesLeft = Math.max(0, left - 1);
        }
      }

      // feedback spécifique au mode
      const feedbackLine = (this.run.mode === MODES.BONUS) ? NO_FEEDBACK
        : (typeof item.explanationShort === "string"
          ? item.explanationShort
          : NO_FEEDBACK);

      this.run.last = {
        itemId: idNum,
        choice,
        correctAnswer: correct,
        isCorrect,
        feedbackLine
      };
      // End by chances (RUN/BONUS only; PRACTICE has chancesLeft === null)
      if (this.run.chancesLeft != null && Number(this.run.chancesLeft || 0) <= 0) {
        this.run.done = true;
        return {
          done: true,
          itemId: idNum,
          isCorrect,
          correctAnswer: correct,
          feedbackLine: this.run.last.feedbackLine,
          state: this.getState()
        };
      }

      this._advanceAfterAnswer();



      return {
        done: !!this.run.done,
        itemId: this.run.last ? this.run.last.itemId : null,
        isCorrect: this.run.last ? (this.run.last.isCorrect === true) : false,
        correctAnswer: this.run.last ? this.run.last.correctAnswer : null,
        feedbackLine: this.run.last ? String(this.run.last.feedbackLine || NO_FEEDBACK) : NO_FEEDBACK,
        state: this.getState()
      };



    }
    _advanceAfterAnswer() {
      if (!this.run || this.run.done) return;

      // Advance within current deck
      if (this.run.idx < this.run.ids.length - 1) {
        this.run.idx += 1;
        return;
      }

      // PRACTICE ends when list ends
      if (this.run.mode === MODES.PRACTICE) {
        this.run.done = true;
        return;
      }

      // BONUS ends when deck ends (no reshuffle, no loop).
      if (this.run.mode === MODES.BONUS) {
        this.run.done = true;
        return;
      }

      // RUN: rebuild a fresh deck at the end (reshuffle)
      if (this.run.mode === MODES.RUN) {
        if (typeof this.run.getStatsByItem !== "function") {
          throw new Error("WT_Game.GameEngine._advanceAfterAnswer(): getStatsByItem is missing.");
        }

        const freshStats = this.run.getStatsByItem();

        if (!freshStats || typeof freshStats !== "object") {
          throw new Error("WT_Game.GameEngine._advanceAfterAnswer(): getStatsByItem() must return an object.");
        }

        this.run.statsByItem = freshStats;

        const deck = buildDeck({
          items: this.run.items,
          statsByItem: this.run.statsByItem,
          mistakesOnly: false,
          config: this.run.config
        });
        this.run.byId = deck.byId || this.run.byId || {};
        this.run.ids = Array.isArray(deck.ids) ? deck.ids.slice() : [];
        this.run.idx = 0;

        // one-shot UI signal
        this.run.justReshuffled = true;

        if (!this.run.ids.length) {
          this.run.done = true;
        }

        return;
      }

      // Fallback safety
      this.run.done = true;
    }


    getResult() {
      const s = this.getState();
      return {
        mode: s.mode,
        scoreFP: s.scoreFP,
        chancesLeft: s.chancesLeft,
        maxChances: s.maxChances
      };
    }

  }



  // Export global
  window.WT_Game = {
    buildDeck,
    buildSeenDeck,
    buildFullPoolDeck,
    GameEngine
  };
})();

