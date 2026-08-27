// leaderboard.js
// Public leaderboard UI for Brew or False.
//
// Ported from Pickleball Rules Quiz (ui-leaderboard.js), adapted for the
// monolithic Brew or False frontend:
// - pure helpers come from leaderboard-logic.js (window.WT_LeaderboardLogic),
//   same as the sibling app; an inline copy is used only if that failed to load
// - no i18n: display locale is always en-US
// - config lives at window.WT_CONFIG.leaderboard
//
// Backend contract: leaderboard-worker/ (GET /leaderboard, POST /player,
// DELETE /player, POST /score). See leaderboard-worker/README.md.

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Pure helpers: prefer leaderboard-logic.js, fall back to a local copy so a
  // script-order slip never hard-breaks the page.
  // ---------------------------------------------------------------------------

  const LOGIC =
    (window.WT_LeaderboardLogic && typeof window.WT_LeaderboardLogic === "object")
      ? window.WT_LeaderboardLogic
      : null;

  function clampInt(value, min, max) {
    if (LOGIC && typeof LOGIC.clampInt === "function") {
      return LOGIC.clampInt(value, min, max);
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function compileNicknameRegex(cfg) {
    if (LOGIC && typeof LOGIC.compileNicknameRegex === "function") {
      return LOGIC.compileNicknameRegex(
        cfg?.nicknameRegexSource,
        cfg?.nicknameRegexFlags
      );
    }
    const source = String(cfg?.nicknameRegexSource || "").trim();
    if (!source) return null;
    const flags = String(cfg?.nicknameRegexFlags || "").trim();
    try {
      return new RegExp(source, flags);
    } catch (_) {
      return false;
    }
  }

  function normalizeRows(rows, limit) {
    if (LOGIC && typeof LOGIC.normalizeRows === "function") {
      return LOGIC.normalizeRows(rows, limit);
    }
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        nickname: String(row?.nickname || "").trim(),
        scoreFP: clampInt(row?.scoreFP ?? row?.score_fp, 0, 9999)
      }))
      .filter((row) => row.nickname && row.scoreFP >= 0)
      .slice(0, Math.max(1, clampInt(limit, 1, 100)));
  }

  function mergeLocalPlayer(rows, localPlayer, limit) {
    if (LOGIC && typeof LOGIC.mergeLocalPlayer === "function") {
      return LOGIC.mergeLocalPlayer(rows, localPlayer, limit);
    }
    const maxRows = Math.max(1, clampInt(limit, 1, 100));
    const base = Array.isArray(rows) ? rows.slice() : [];
    if (!localPlayer) return base.slice(0, maxRows);

    const localNickname = String(localPlayer?.nickname || "").trim();
    const filtered = base.filter(
      (row) => String(row?.nickname || "").trim() !== localNickname
    );
    filtered.push(localPlayer);
    filtered.sort((a, b) => {
      const scoreDiff =
        clampInt(b?.scoreFP, 0, 9999) - clampInt(a?.scoreFP, 0, 9999);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.nickname || "").localeCompare(String(b?.nickname || ""));
    });
    return filtered.slice(0, maxRows);
  }

  // ---------------------------------------------------------------------------
  // Runtime bucket + config/wording accessors
  // ---------------------------------------------------------------------------

  function getRuntimeBucket(ui) {
    if (!ui || !ui._runtime) return null;
    if (!ui._runtime.leaderboard) {
      ui._runtime.leaderboard = {
        loading: false,
        lastFetchedAt: 0,
        error: "",
        source: "",
        weekly: [],
        all: [],
        inflight: null,
        lastKnownWeeklyRank: 0,
        lastKnownAllTimeRank: 0
      };
    }
    return ui._runtime.leaderboard;
  }

  function getCfg(ui) {
    const cfg = ui?.config?.leaderboard;
    return cfg && typeof cfg === "object" ? cfg : {};
  }

  function shouldSubmitScores(ui) {
    const cfg = getCfg(ui);
    return cfg.enabled === true && cfg.submitScores === true;
  }

  function getWording(ui) {
    const w = ui?.wording?.leaderboard;
    return w && typeof w === "object" ? w : {};
  }

  function getSeedRows(ui, windowType) {
    const cfg = getCfg(ui);
    const raw = cfg?.seedScores?.[windowType];
    return normalizeRows(raw, clampInt(cfg?.topN, 1, 100));
  }

  function getLocalPlayerRow(ui) {
    const profile =
      ui?.storage && typeof ui.storage.getLeaderboardProfile === "function"
        ? ui.storage.getLeaderboardProfile()
        : null;
    if (!profile || profile.optIn !== true) return null;

    const scoreFP = getLocalBestScore(ui);
    const nickname = String(profile.nickname || "").trim();
    if (!nickname || scoreFP <= 0) return null;

    return { nickname, scoreFP, isLocalPlayer: true };
  }

  function getLocalBestScore(ui) {
    const pb =
      ui?.storage && typeof ui.storage.getPersonalBest === "function"
        ? ui.storage.getPersonalBest()
        : null;
    return clampInt(pb?.bestScoreFP, 0, 9999);
  }

  function buildWindowRows(ui, windowType, remoteRows) {
    const cfg = getCfg(ui);
    const limit = clampInt(cfg?.topN, 1, 100);
    const seedRows = getSeedRows(ui, windowType);
    const localPlayer = getLocalPlayerRow(ui);
    const sourceRows =
      Array.isArray(remoteRows) && remoteRows.length ? remoteRows : seedRows;
    const merged = mergeLocalPlayer(sourceRows, localPlayer, limit);
    return merged.map((row, idx) => ({
      rank: idx + 1,
      nickname: String(row.nickname || "").trim(),
      scoreFP: clampInt(row.scoreFP, 0, 9999),
      isLocalPlayer: row.isLocalPlayer === true
    }));
  }

  function buildFallback(ui, reason) {
    const bucket = getRuntimeBucket(ui);
    if (!bucket) return;
    bucket.source = "empty";
    bucket.error = String(reason || "").trim();
    bucket.weekly = buildWindowRows(ui, "weekly", null);
    bucket.all = buildWindowRows(ui, "all", null);
    bucket.lastFetchedAt = Date.now();
  }

  // ---------------------------------------------------------------------------
  // Networking
  // ---------------------------------------------------------------------------

  function getBaseUrl(cfg) {
    return String(cfg?.apiBaseUrl || "")
      .trim()
      .replace(/\/+$/, "");
  }

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    let timerId = 0;
    try {
      if (controller && timeoutMs > 0) {
        timerId = window.setTimeout(() => controller.abort(), timeoutMs);
      }
      const res = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      if (timerId) window.clearTimeout(timerId);
    }
  }

  function refresh(ui) {
    const bucket = getRuntimeBucket(ui);
    const cfg = getCfg(ui);
    if (!bucket || bucket.loading === true) return bucket?.inflight || null;

    const baseUrl = getBaseUrl(cfg);
    if (!baseUrl) {
      buildFallback(ui, "");
      safeRender(ui);
      return null;
    }

    bucket.loading = true;
    bucket.error = "";

    const timeoutMs = clampInt(cfg?.requestTimeoutMs, 500, 15000);
    const limit = clampInt(cfg?.topN, 1, 100);
    const p = Promise.all([
      fetchJsonWithTimeout(`${baseUrl}/leaderboard?window=weekly`, timeoutMs),
      fetchJsonWithTimeout(`${baseUrl}/leaderboard?window=all`, timeoutMs)
    ])
      .then(([weeklyJson, allJson]) => {
        bucket.source = "remote";
        bucket.error = "";
        bucket.weekly = buildWindowRows(
          ui,
          "weekly",
          normalizeRows(weeklyJson?.top, limit)
        );
        bucket.all = buildWindowRows(ui, "all", normalizeRows(allJson?.top, limit));
        bucket.lastFetchedAt = Date.now();
        rerenderOpenLeaderboardModal(ui);
      })
      .catch((err) => {
        buildFallback(ui, err?.message || "fetch_failed");
      })
      .finally(() => {
        bucket.loading = false;
        bucket.inflight = null;
        safeRender(ui);
      });

    bucket.inflight = p;
    return p;
  }

  function ensureFresh(ui) {
    const bucket = getRuntimeBucket(ui);
    const cfg = getCfg(ui);
    if (!bucket) return;

    const ttlMs = clampInt(cfg?.cacheTtlMs, 1000, 10 * 60 * 1000);
    const ageMs =
      Date.now() - clampInt(bucket.lastFetchedAt, 0, Number.MAX_SAFE_INTEGER);
    const stale = !bucket.lastFetchedAt || ageMs >= ttlMs;
    if (!bucket.loading && stale) void refresh(ui);
  }

  function safeRender(ui) {
    try {
      if (typeof ui?.render === "function") ui.render();
    } catch (_) {
      /* silent */
    }
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function fillTemplate(template, vars) {
    let out = String(template || "");
    const map = vars && typeof vars === "object" ? vars : {};
    for (const [key, value] of Object.entries(map)) {
      out = out.replaceAll(`{${key}}`, String(value == null ? "" : value));
    }
    return out;
  }

  function getNextWeeklyResetUtcMs(nowMs) {
    const now = new Date(clampInt(nowMs, 0, Number.MAX_SAFE_INTEGER));
    const day = now.getUTCDay();
    const daysUntilMonday = (8 - day) % 7;
    const reset = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilMonday,
        0,
        0,
        0,
        0
      )
    );
    if (reset.getTime() <= now.getTime()) {
      reset.setUTCDate(reset.getUTCDate() + 7);
    }
    return reset.getTime();
  }

  function formatLocalWeekdayTime(ts) {
    const safeTs = clampInt(ts, 0, Number.MAX_SAFE_INTEGER);
    if (safeTs <= 0) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(safeTs));
    } catch (_) {
      return "";
    }
  }

  // ---------------------------------------------------------------------------
  // Landing card
  // ---------------------------------------------------------------------------

  function getLandingModel(ui) {
    const cfg = getCfg(ui);
    if (cfg.enabled !== true) return null;

    const showAfter = clampInt(cfg?.showAfterRunCompletes, 0, 999);
    const counters =
      ui?.storage && typeof ui.storage.getCounters === "function"
        ? ui.storage.getCounters()
        : {};
    const runCompletes = clampInt(counters?.runCompletes, 0, 9999);
    if (runCompletes < showAfter) return null;

    const bucket = getRuntimeBucket(ui);
    ensureFresh(ui);

    const previewCount = clampInt(cfg?.cardPreviewCount, 1, 10);
    const profile =
      ui?.storage && typeof ui.storage.getLeaderboardProfile === "function"
        ? ui.storage.getLeaderboardProfile()
        : { nickname: "", optIn: false };

    return {
      loading:
        bucket?.loading === true &&
        (!Array.isArray(bucket?.weekly) || bucket.weekly.length === 0),
      error: String(bucket?.error || "").trim(),
      source: String(bucket?.source || "").trim(),
      rows: Array.isArray(bucket?.weekly)
        ? bucket.weekly.slice(0, previewCount)
        : [],
      hasRows: Array.isArray(bucket?.weekly) && bucket.weekly.length > 0,
      hasProfile:
        profile?.optIn === true && !!String(profile?.nickname || "").trim(),
      nickname: String(profile?.nickname || "").trim(),
      bestScoreFP: getLocalBestScore(ui)
    };
  }

  function renderLandingCard(ui, helpers) {
    const model = getLandingModel(ui);
    if (!model) return "";

    const escapeHtml = helpers?.escapeHtml;
    if (typeof escapeHtml !== "function") return "";

    const w = getWording(ui);
    const title = String(w.cardTitle || "").trim();
    const sub = String(
      model.hasProfile ? w.cardSubJoined || "" : w.cardSubDefault || ""
    ).trim();
    const viewLabel = String(w.cardCtaView || "").trim();
    const joinLabel = String(w.cardCtaJoin || "").trim();
    const editLabel = String(w.cardCtaEdit || w.profileTab || "").trim();
    const loadingLabel = String(w.loading || "").trim();
    const emptyLabel = String(w.empty || "").trim();
    const bestScoreLineTemplate = String(w.cardBestScoreLine || "").trim();
    const weeklyResetTemplate = String(
      w.cardWeeklyResetLine || w.weeklyResetLine || ""
    ).trim();
    const weeklyResetTime = formatLocalWeekdayTime(
      getNextWeeklyResetUtcMs(Date.now())
    );
    const weeklyResetLine =
      weeklyResetTemplate && weeklyResetTime
        ? fillTemplate(weeklyResetTemplate, { localTime: weeklyResetTime })
        : weeklyResetTemplate;
    const bestScoreLine =
      bestScoreLineTemplate && model.bestScoreFP > 0
        ? fillTemplate(bestScoreLineTemplate, { score: String(model.bestScoreFP) })
        : "";

    const rowsHtml = model.loading
      ? `<p class="wt-muted">${escapeHtml(loadingLabel)}</p>`
      : model.hasRows
        ? `
          <ol class="wt-leaderboard-list" role="list">
            ${model.rows
              .map(
                (row) => `
              <li class="wt-leaderboard-list__item${row.isLocalPlayer ? ` wt-leaderboard-list__item--player` : ``}">
                <span class="wt-leaderboard-list__rank">#${row.rank}</span>
                <span class="wt-leaderboard-list__name">${escapeHtml(row.nickname)}</span>
                <span class="wt-leaderboard-list__score">${escapeHtml(String(row.scoreFP))}</span>
              </li>
            `
              )
              .join("")}
          </ol>
        `
        : `<p class="wt-muted">${escapeHtml(emptyLabel)}</p>`;

    return `
      <section class="wt-box wt-box--tinted wt-leaderboard-card" aria-label="${escapeHtml(title || "Leaderboard")}">
        <div class="wt-leaderboard-card__header">
          ${title ? `<span class="wt-landing-stat__label">${escapeHtml(title)}</span>` : ``}
        </div>
        ${sub ? `<p class="wt-leaderboard-card__sub">${escapeHtml(sub)}</p>` : ``}
        ${weeklyResetLine ? `<p class="wt-leaderboard-card__freshness"><span>${escapeHtml(weeklyResetLine)}</span></p>` : ``}
        ${bestScoreLine ? `<p class="wt-muted">${escapeHtml(bestScoreLine)}</p>` : ``}
        ${rowsHtml}
        <div class="wt-landing-stat__actions">
          ${viewLabel ? `<button type="button" class="wt-btn wt-btn--secondary" data-action="open-leaderboard">${escapeHtml(viewLabel)}</button>` : ``}
          ${model.hasProfile && editLabel ? `<button type="button" class="wt-btn wt-btn--secondary" data-action="open-leaderboard-profile">${escapeHtml(editLabel)}</button>` : ``}
          ${!model.hasProfile && joinLabel ? `<button type="button" class="wt-btn wt-btn--secondary" data-action="open-leaderboard-profile">${escapeHtml(joinLabel)}</button>` : ``}
        </div>
      </section>
    `;
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  function renderRowsHtml(rows, escapeHtml, detachedRow) {
    if (!Array.isArray(rows) || rows.length === 0) return "";
    return `
      <ol class="wt-leaderboard-modal__list" role="list">
        ${rows
          .map(
            (row) => `
          <li class="wt-leaderboard-modal__item${row.isLocalPlayer ? ` wt-leaderboard-modal__item--player` : ``}">
            <span class="wt-leaderboard-modal__rank">#${row.rank}</span>
            <span class="wt-leaderboard-modal__name" title="${escapeHtml(row.nickname)}">${escapeHtml(row.nickname)}</span>
            <span class="wt-leaderboard-modal__score">${escapeHtml(String(row.scoreFP))}</span>
          </li>
        `
          )
          .join("")}
        ${
          detachedRow
            ? `
          <li class="wt-leaderboard-modal__item wt-leaderboard-modal__item--gap" aria-hidden="true">
            <span class="wt-leaderboard-modal__name">...</span>
          </li>
          <li class="wt-leaderboard-modal__item wt-leaderboard-modal__item--player">
            <span class="wt-leaderboard-modal__rank">#${detachedRow.rank}</span>
            <span class="wt-leaderboard-modal__name" title="${escapeHtml(detachedRow.nickname)}">${escapeHtml(detachedRow.nickname)}</span>
            <span class="wt-leaderboard-modal__score">${escapeHtml(String(detachedRow.scoreFP))}</span>
          </li>
        `
            : ``
        }
      </ol>
    `;
  }

  function getDetachedLocalRankRow(ui, windowType, rows) {
    const bucket = getRuntimeBucket(ui);
    if (!bucket) return null;

    const localPlayer = getLocalPlayerRow(ui);
    if (!localPlayer) return null;

    const rank =
      windowType === "all"
        ? clampInt(bucket.lastKnownAllTimeRank, 0, 999999)
        : clampInt(bucket.lastKnownWeeklyRank, 0, 999999);
    if (rank <= 0) return null;

    const baseRows = Array.isArray(rows) ? rows : [];
    if (rank <= baseRows.length) return null;
    if (
      baseRows.some(
        (row) => String(row?.nickname || "").trim() === localPlayer.nickname
      )
    ) {
      return null;
    }

    return { rank, nickname: localPlayer.nickname, scoreFP: localPlayer.scoreFP };
  }

  function getOpenModalTab(ui) {
    try {
      const rankingPanel = ui?.modalContentEl?.querySelector
        ? ui.modalContentEl.querySelector('[data-wt-leaderboard-panel="ranking"]')
        : null;
      if (rankingPanel && typeof rankingPanel.hasAttribute === "function") {
        return rankingPanel.hasAttribute("hidden") ? "profile" : "ranking";
      }
    } catch (_) {
      /* silent */
    }
    return "ranking";
  }

  function rerenderOpenLeaderboardModal(ui) {
    if (
      ui?._runtime?._modalKey === "leaderboard" &&
      typeof ui?.openLeaderboardModal === "function"
    ) {
      ui.openLeaderboardModal({ initialTab: getOpenModalTab(ui) });
    }
  }

  function renderTabButton(tabKey, activeTab, label, escapeHtml) {
    const active = String(activeTab || "ranking") === tabKey;
    const tabId = `wt-leaderboard-tab-${tabKey}`;
    const panelId = `wt-leaderboard-panel-${tabKey}`;
    return `
      <button
        type="button"
        class="wt-btn ${active ? `wt-btn--primary` : `wt-btn--secondary`}"
        id="${tabId}"
        role="tab"
        data-action="switch-leaderboard-tab"
        data-wt-leaderboard-tab="${tabKey}"
        aria-controls="${panelId}"
        aria-selected="${active ? `true` : `false`}"
        tabindex="${active ? `0` : `-1`}">
        ${escapeHtml(label)}
      </button>
    `;
  }

  function setModalTab(ui, tabKey) {
    const root = ui?.modalContentEl;
    if (!root) return;
    const nextTab = tabKey === "profile" ? "profile" : "ranking";
    root.querySelectorAll("[data-wt-leaderboard-tab]").forEach((btn) => {
      const isActive =
        String(btn.getAttribute("data-wt-leaderboard-tab") || "") === nextTab;
      btn.classList.toggle("wt-btn--primary", isActive);
      btn.classList.toggle("wt-btn--secondary", !isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    root.querySelectorAll("[data-wt-leaderboard-panel]").forEach((panel) => {
      const isActive =
        String(panel.getAttribute("data-wt-leaderboard-panel") || "") === nextTab;
      panel.toggleAttribute("hidden", !isActive);
    });
  }

  function openModal(ui, helpers) {
    const escapeHtml = helpers?.escapeHtml;
    if (typeof escapeHtml !== "function" || typeof ui?.openModal !== "function")
      return;

    const cfg = getCfg(ui);
    if (cfg.enabled !== true) return;

    const bucket = getRuntimeBucket(ui);
    ensureFresh(ui);

    const w = getWording(ui);
    const profile =
      ui?.storage && typeof ui.storage.getLeaderboardProfile === "function"
        ? ui.storage.getLeaderboardProfile()
        : { nickname: "", optIn: false };

    const nickname = String(profile.nickname || "").trim();
    const joined = profile.optIn === true && !!nickname;
    const title = String(w.modalTitle || "").trim();
    const body = String(
      joined ? w.modalBodyJoined || "" : w.modalBodyDefault || ""
    ).trim();
    const weeklyTitle = String(w.weeklyTitle || "").trim();
    const allTitle = String(w.allTitle || "").trim();
    const nicknameLabel = String(w.nicknameLabel || "").trim();
    const nicknamePlaceholder = String(w.nicknamePlaceholder || "").trim();
    const saveLabel = String(joined ? w.updateCta || "" : w.joinCta || "").trim();
    const leaveLabel = String(w.leaveCta || "").trim();
    const rankingTabLabel = String(
      w.rankingTab || weeklyTitle || title || "Leaderboard"
    ).trim();
    const profileTabLabel = String(
      w.profileTab || nicknameLabel || "Profile"
    ).trim();
    const requestedInitialTab = String(helpers?.initialTab || "").trim();
    const initialTab =
      requestedInitialTab === "profile"
        ? "profile"
        : requestedInitialTab === "ranking"
          ? "ranking"
          : joined
            ? "ranking"
            : "profile";

    const maxLen = clampInt(cfg?.nicknameMaxLen, 3, 64);
    const weeklyRows = Array.isArray(bucket?.weekly) ? bucket.weekly : [];
    const allRows = Array.isArray(bucket?.all) ? bucket.all : [];
    const weeklyDetachedRow = getDetachedLocalRankRow(ui, "weekly", weeklyRows);
    const allDetachedRow = getDetachedLocalRankRow(ui, "all", allRows);
    const editProfileCta = String(
      w.editProfileCta || w.cardCtaEdit || w.profileTab || ""
    ).trim();

    const html = `
      <div class="wt-actions wt-actions--compact wt-leaderboard-modal__tabs" role="tablist" aria-label="${escapeHtml(title || "Leaderboard")}">
        ${renderTabButton("ranking", initialTab, rankingTabLabel, escapeHtml)}
        ${renderTabButton("profile", initialTab, profileTabLabel, escapeHtml)}
      </div>
      <section
        id="wt-leaderboard-panel-ranking"
        role="tabpanel"
        aria-labelledby="wt-leaderboard-tab-ranking"
        data-wt-leaderboard-panel="ranking"${initialTab === "ranking" ? "" : " hidden"}>
        ${body ? `<p class="wt-muted">${escapeHtml(body)}</p>` : ``}
        ${
          joined && editProfileCta
            ? `
          <div class="wt-actions wt-actions--compact">
            <button
              type="button"
              class="wt-btn wt-btn--secondary"
              data-action="switch-leaderboard-tab"
              data-wt-leaderboard-tab="profile">
              ${escapeHtml(editProfileCta)}
            </button>
          </div>
        `
            : ``
        }
        ${weeklyTitle ? `<p class="wt-question-title">${escapeHtml(weeklyTitle)}</p>` : ``}
        ${renderRowsHtml(weeklyRows, escapeHtml, weeklyDetachedRow)}
        <div class="wt-divider"></div>
        ${allTitle ? `<p class="wt-question-title">${escapeHtml(allTitle)}</p>` : ``}
        ${renderRowsHtml(allRows, escapeHtml, allDetachedRow)}
      </section>
      <section
        id="wt-leaderboard-panel-profile"
        role="tabpanel"
        aria-labelledby="wt-leaderboard-tab-profile"
        data-wt-leaderboard-panel="profile"${initialTab === "profile" ? "" : " hidden"}>
        <label class="wt-label" for="wt-leaderboard-nickname">${escapeHtml(nicknameLabel)}</label>
        <input
          id="wt-leaderboard-nickname"
          class="wt-input"
          maxlength="${maxLen}"
          autocomplete="nickname"
          value="${escapeHtml(nickname)}"
          placeholder="${escapeHtml(nicknamePlaceholder)}"
        />
        <div class="wt-actions wt-actions--compact">
          <button type="button" class="wt-btn wt-btn--primary" data-action="save-leaderboard-profile" aria-busy="false">
            ${escapeHtml(saveLabel)}
          </button>
          ${
            joined && leaveLabel
              ? `
            <button type="button" class="wt-btn wt-btn--secondary" data-action="leave-leaderboard">
              ${escapeHtml(leaveLabel)}
            </button>
          `
              : ``
          }
        </div>
      </section>
    `;

    ui.openModal(html, title, { modalKey: "leaderboard" });
  }

  function switchModalTab(ui, tabKey) {
    setModalTab(ui, tabKey);
  }

  // ---------------------------------------------------------------------------
  // Profile save / leave
  // ---------------------------------------------------------------------------

  function resolveHelpers(ui, helpers) {
    const passed = helpers && typeof helpers === "object" ? helpers : {};
    const stored =
      ui && ui._leaderboardHelpers && typeof ui._leaderboardHelpers === "object"
        ? ui._leaderboardHelpers
        : {};
    return {
      toastNow: passed.toastNow || stored.toastNow,
      fillTemplate: passed.fillTemplate || stored.fillTemplate || fillTemplate,
      clampInt: passed.clampInt || stored.clampInt || clampInt,
      getLeaderboardContentVersion:
        passed.getLeaderboardContentVersion ||
        stored.getLeaderboardContentVersion,
      escapeHtml: passed.escapeHtml || stored.escapeHtml,
      initialTab: passed.initialTab
    };
  }

  function toast(ui, message, variant, helpers) {
    const h = resolveHelpers(ui, helpers);
    const msg = String(message || "").trim();
    if (!msg || typeof h.toastNow !== "function") return;
    h.toastNow(ui.config, msg, { variant: variant || "info" });
  }

  async function saveProfileFromModal(ui, helpers) {
    const w = getWording(ui);
    const cfg = getCfg(ui);
    const saveBtn = ui?.modalContentEl
      ? ui.modalContentEl.querySelector('[data-action="save-leaderboard-profile"]')
      : null;
    const existingProfile =
      ui?.storage && typeof ui.storage.getLeaderboardProfile === "function"
        ? ui.storage.getLeaderboardProfile()
        : null;
    const wasJoined =
      existingProfile?.optIn === true &&
      !!String(existingProfile?.nickname || "").trim();
    const input = ui?.modalContentEl
      ? ui.modalContentEl.querySelector("#wt-leaderboard-nickname")
      : null;
    const nickname = String(input?.value || "").trim();
    const minLen = clampInt(cfg?.nicknameMinLen, 1, 32);
    const maxLen = clampInt(cfg?.nicknameMaxLen, minLen, 64);
    const nicknameRegex = compileNicknameRegex(cfg);

    if (!nickname) {
      toast(ui, w.nicknameRequiredToast, "danger", helpers);
      return;
    }
    if (nickname.length < minLen) {
      toast(ui, w.nicknameTooShortToast, "danger", helpers);
      return;
    }
    if (nicknameRegex === false) {
      toast(ui, w.nicknameInvalidCharsToast, "danger", helpers);
      return;
    }
    if (nickname.length > maxLen || (nicknameRegex && !nicknameRegex.test(nickname))) {
      toast(ui, w.nicknameInvalidCharsToast, "danger", helpers);
      return;
    }

    if (ui?.storage && typeof ui.storage.saveLeaderboardProfile === "function") {
      ui.storage.saveLeaderboardProfile(nickname, true);
    }

    const baseUrl = getBaseUrl(cfg);
    try {
      if (saveBtn) {
        saveBtn.setAttribute("aria-busy", "true");
        saveBtn.disabled = true;
      }
    } catch (_) {
      /* silent */
    }
    if (baseUrl) {
      try {
        const profile = ui.storage.getLeaderboardProfile();
        await fetch(`${baseUrl}/player`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json"
          },
          body: JSON.stringify({
            device_uuid: String(profile.deviceUuid || "").trim(),
            nickname: String(profile.nickname || "").trim(),
            opt_in: true
          })
        });
      } catch (_) {
        toast(ui, w.remoteSaveErrorToast, "info", helpers);
      }
    }
    try {
      if (saveBtn) {
        saveBtn.setAttribute("aria-busy", "false");
        saveBtn.disabled = false;
      }
    } catch (_) {
      /* silent */
    }

    const bucket = getRuntimeBucket(ui);
    if (bucket) bucket.lastFetchedAt = 0;

    if (!wasJoined && ui?._runtime?.lastRun) {
      try {
        const submitRes = await submitRun(ui, ui._runtime.lastRun, helpers);
        handleSubmitResult(ui, submitRes, helpers);
      } catch (_) {
        /* silent */
      }
    }
    ensureFresh(ui);
    openModal(ui, helpers);
    setModalTab(ui, "ranking");
    toast(ui, w.saveOkToast, "success", helpers);
    safeRender(ui);
  }

  async function leaveFromModal(ui, helpers) {
    const w = getWording(ui);
    const cfg = getCfg(ui);

    let deviceUuid = "";
    if (ui?.storage && typeof ui.storage.getLeaderboardProfile === "function") {
      deviceUuid = String(
        ui.storage.getLeaderboardProfile().deviceUuid || ""
      ).trim();
    }
    if (ui?.storage && typeof ui.storage.saveLeaderboardProfile === "function") {
      ui.storage.saveLeaderboardProfile("", false);
    }

    const baseUrl = getBaseUrl(cfg);
    if (baseUrl && deviceUuid) {
      try {
        const url = new URL(`${baseUrl}/player`);
        url.searchParams.set("device_uuid", deviceUuid);
        await fetch(url.toString(), {
          method: "DELETE",
          headers: { accept: "application/json" }
        });
      } catch (_) {
        /* silent */
      }
    }

    const bucket = getRuntimeBucket(ui);
    if (bucket) bucket.lastFetchedAt = 0;
    ensureFresh(ui);
    if (typeof ui.closeModal === "function") ui.closeModal();
    toast(ui, w.leftToast, "info", helpers);
    safeRender(ui);
  }

  // ---------------------------------------------------------------------------
  // Score submission
  // ---------------------------------------------------------------------------

  async function submitRun(ui, lastRun, helpers) {
    if (!shouldSubmitScores(ui))
      return { ok: false, skipped: true, reason: "disabled" };

    const cfg = getCfg(ui);
    const baseUrl = getBaseUrl(cfg);
    if (!baseUrl) return { ok: false, skipped: true, reason: "no_api_base_url" };

    const profile =
      ui?.storage && typeof ui.storage.getLeaderboardProfile === "function"
        ? ui.storage.getLeaderboardProfile()
        : null;
    if (!profile || profile.optIn !== true)
      return { ok: false, skipped: true, reason: "not_opted_in" };

    const mode = String(lastRun?.mode || "")
      .trim()
      .toUpperCase();
    if (mode !== "RUN") return { ok: false, skipped: true, reason: "not_run" };

    const answers = Array.isArray(lastRun?.answerLog) ? lastRun.answerLog : [];
    if (!answers.length)
      return { ok: false, skipped: true, reason: "no_answers" };

    const h = resolveHelpers(ui, helpers);
    const contentVersion =
      typeof h.getLeaderboardContentVersion === "function"
        ? String(h.getLeaderboardContentVersion(ui.config) || "").trim()
        : String(cfg?.contentVersion || "unknown").trim();

    const payload = {
      device_uuid: String(profile.deviceUuid || "").trim(),
      run_id: String(lastRun?.runId || "").trim(),
      run_number: clampInt(lastRun?.runNumber, 0, 999999999),
      content_version: contentVersion,
      run_mode: "RUN",
      duration_ms: clampInt(lastRun?.durationMs, 0, 24 * 60 * 60 * 1000),
      answers: answers.map((row) => ({
        id: clampInt(row?.id, 0, 999999),
        answer: row?.answer === true,
        ms: clampInt(row?.ms, 0, 10 * 60 * 1000)
      }))
    };

    if (!payload.device_uuid || !payload.run_id || !payload.answers.length) {
      return { ok: false, skipped: true, reason: "invalid_payload" };
    }

    try {
      const res = await fetch(`${baseUrl}/score`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        return { ok: false, skipped: false, reason: `http_${res.status}` };
      }
      const json = await res.json().catch(() => null);
      const bucket = getRuntimeBucket(ui);
      if (bucket) bucket.lastFetchedAt = 0;
      return { ok: true, data: json };
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason: String(err?.message || "submit_failed")
      };
    }
  }

  function handleSubmitResult(ui, res, helpers) {
    if (!res || res.skipped === true) return;

    const h = resolveHelpers(ui, helpers);
    const tmpl =
      typeof h.fillTemplate === "function" ? h.fillTemplate : fillTemplate;
    const w = getWording(ui);
    if (res.ok === true) {
      const bucket = getRuntimeBucket(ui);
      const weeklyRank = clampInt(res?.data?.weekly_rank, 0, 999999);
      const allTimeRank = clampInt(res?.data?.all_time_rank, 0, 999999);
      if (bucket) {
        bucket.lastKnownWeeklyRank = weeklyRank;
        bucket.lastKnownAllTimeRank = allTimeRank;
      }
      if (weeklyRank > 0) {
        const toastTpl = String(w.rankToastWeekly || "").trim();
        if (toastTpl) {
          toast(ui, tmpl(toastTpl, { rank: String(weeklyRank) }), "info", helpers);
        }
      }
      rerenderOpenLeaderboardModal(ui);
      return;
    }

    toast(ui, w.scoreRejectedToast, "info", helpers);
  }

  window.WT_UI_Leaderboard = {
    renderLandingCard,
    openModal,
    switchModalTab,
    saveProfileFromModal,
    leaveFromModal,
    submitRun,
    handleSubmitResult,
    refresh
  };

  window.WT_UI_Leaderboard_Testing = {
    clampInt,
    compileNicknameRegex: (cfg) => compileNicknameRegex(cfg),
    normalizeRows,
    mergeLocalPlayer,
    getNextWeeklyResetUtcMs
  };
})();
