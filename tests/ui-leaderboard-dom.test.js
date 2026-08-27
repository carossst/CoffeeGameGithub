"use strict";

const LeaderboardLogic = require("../leaderboard-logic.js");
const {
  createWindowLike,
  createDocumentLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

function loadLeaderboardModule(overrides) {
  const windowLike = createWindowLike(
    Object.assign(
      {
        WT_LeaderboardLogic: LeaderboardLogic
      },
      overrides && overrides.window ? overrides.window : {}
    )
  );
  const documentLike = createDocumentLike(
    overrides && overrides.document ? overrides.document : {}
  );
  const context = loadBrowserScript("leaderboard.js", {
    window: windowLike,
    document: documentLike
  });
  return context.window.WT_UI_Leaderboard;
}

function createFakeClassList(initial) {
  const set = new Set(initial || []);
  return {
    add(name) {
      set.add(String(name));
    },
    remove(name) {
      set.delete(String(name));
    },
    toggle(name, force) {
      const key = String(name);
      if (force === true) {
        set.add(key);
        return true;
      }
      if (force === false) {
        set.delete(key);
        return false;
      }
      if (set.has(key)) {
        set.delete(key);
        return false;
      }
      set.add(key);
      return true;
    },
    contains(name) {
      return set.has(String(name));
    }
  };
}

function createFakeNode(tab) {
  const attrs = new Map();
  if (tab) attrs.set("data-wt-leaderboard-tab", tab);
  return {
    classList: createFakeClassList(["wt-btn", "wt-btn--secondary"]),
    setAttribute(name, value) {
      attrs.set(String(name), String(value));
    },
    getAttribute(name) {
      return attrs.has(String(name)) ? attrs.get(String(name)) : null;
    }
  };
}

function createFakePanel(tab, hidden) {
  const attrs = new Map([["data-wt-leaderboard-panel", tab]]);
  let hiddenState = !!hidden;
  return {
    toggleAttribute(name, force) {
      if (String(name) !== "hidden") return;
      hiddenState = !!force;
    },
    getAttribute(name) {
      return attrs.has(String(name)) ? attrs.get(String(name)) : null;
    },
    get hidden() {
      return hiddenState;
    }
  };
}

test("leaderboard modal opens on profile tab for users who have not joined yet", () => {
  const leaderboard = loadLeaderboardModule();
  let opened = null;
  const ui = {
    _runtime: {
      leaderboard: {
        loading: false,
        lastFetchedAt: Date.now(),
        error: "",
        source: "empty",
        weekly: [],
        all: []
      }
    },
    config: {
      leaderboard: {
        enabled: true,
        cacheTtlMs: 60000,
        topN: 10
      }
    },
    wording: {
      leaderboard: {
        modalTitle: "Leaderboard",
        modalBodyDefault: "Join the board",
        weeklyTitle: "This week",
        allTitle: "All-time",
        nicknameLabel: "Nickname",
        nicknamePlaceholder: "Pick one",
        joinCta: "Join",
        rankingTab: "Ranking",
        profileTab: "My nickname"
      }
    },
    storage: {
      getLeaderboardProfile() {
        return { nickname: "", optIn: false };
      }
    },
    openModal(html, title) {
      opened = { html, title };
    }
  };

  leaderboard.openModal(ui, {
    escapeHtml: (s) => String(s)
  });

  expect(opened.title).toBe("Leaderboard");
  expect(opened.html).toContain('data-wt-leaderboard-panel="ranking" hidden');
  expect(opened.html).toContain('data-wt-leaderboard-panel="profile"');
  expect(opened.html).toContain("Nickname");
});

test("leaderboard modal shows top rows then detached local rank when outside top 10", () => {
  const leaderboard = loadLeaderboardModule();
  let opened = null;
  const weeklyRows = Array.from({ length: 10 }, (_v, i) => ({
    rank: i + 1,
    nickname: `Player${i + 1}`,
    scoreFP: 30 - i,
    isLocalPlayer: false
  }));
  const ui = {
    _runtime: {
      leaderboard: {
        loading: false,
        lastFetchedAt: Date.now(),
        error: "",
        source: "remote",
        weekly: weeklyRows,
        all: weeklyRows,
        lastKnownWeeklyRank: 15,
        lastKnownAllTimeRank: 18
      }
    },
    config: {
      leaderboard: {
        enabled: true,
        cacheTtlMs: 60000,
        topN: 10
      }
    },
    wording: {
      leaderboard: {
        modalTitle: "Leaderboard",
        modalBodyJoined: "Weekly reset every Monday.",
        weeklyTitle: "This week",
        allTitle: "All-time",
        nicknameLabel: "Nickname",
        nicknamePlaceholder: "Pick one",
        updateCta: "Update",
        editProfileCta: "Edit my nickname",
        leaveCta: "Leave",
        rankingTab: "Ranking",
        profileTab: "My nickname"
      }
    },
    storage: {
      getLeaderboardProfile() {
        return { nickname: "Carole", optIn: true };
      },
      getPersonalBest() {
        return { bestScoreFP: 12 };
      }
    },
    openModal(html, title) {
      opened = { html, title };
    }
  };

  leaderboard.openModal(ui, {
    escapeHtml: (s) => String(s)
  });

  expect(opened.title).toBe("Leaderboard");
  expect(opened.html).toContain("#10");
  expect(opened.html).toContain("...");
  expect(opened.html).toContain("#15");
  expect(opened.html).toContain("Carole");
  expect(opened.html).toContain("#18");
  expect(opened.html).toContain("Edit my nickname");
  expect(opened.html).toContain('data-wt-leaderboard-tab="profile"');
  expect(opened.html).toContain('role="tab"');
  expect(opened.html).toContain('aria-selected="true"');
  expect(opened.html).toContain('role="tabpanel"');
});

test("leaderboard landing card shows local best score when available", () => {
  const leaderboard = loadLeaderboardModule();
  const ui = {
    _runtime: {
      leaderboard: {
        loading: false,
        lastFetchedAt: Date.now(),
        error: "",
        source: "empty",
        weekly: [],
        all: []
      }
    },
    config: {
      leaderboard: {
        enabled: true,
        cacheTtlMs: 60000,
        topN: 10,
        showAfterRunCompletes: 1
      }
    },
    wording: {
      leaderboard: {
        cardTitle: "THIS WEEK",
        cardSubDefault: "Top scores this week.",
        cardBestScoreLine: "Your best: {score}",
        cardCtaJoin: "Choose nickname",
        cardWeeklyResetLine: "Weekly reset: {localTime}, your time.",
        loading: "Loading",
        empty: "Be the first"
      }
    },
    storage: {
      getCounters() {
        return { runCompletes: 1 };
      },
      getLeaderboardProfile() {
        return { nickname: "", optIn: false };
      },
      getPersonalBest() {
        return { bestScoreFP: 7 };
      }
    }
  };

  const html = leaderboard.renderLandingCard(ui, {
    escapeHtml: (s) => String(s)
  });

  expect(html).toContain("Your best: 7");
  expect(html).toContain("THIS WEEK");
});

test("leaderboard landing card falls back to seed rows when apiBaseUrl is empty", () => {
  const leaderboard = loadLeaderboardModule();
  const ui = {
    state: "LANDING",
    render() {},
    _runtime: {},
    config: {
      leaderboard: {
        enabled: true,
        apiBaseUrl: "",
        cacheTtlMs: 60000,
        topN: 10,
        cardPreviewCount: 3,
        showAfterRunCompletes: 1,
        seedScores: {
          weekly: [
            { nickname: "SeedOne", scoreFP: 21 },
            { nickname: "SeedTwo", scoreFP: 19 }
          ],
          all: []
        }
      }
    },
    wording: {
      leaderboard: {
        cardTitle: "THIS WEEK",
        cardSubDefault: "Top scores this week.",
        cardCtaJoin: "Choose nickname",
        cardWeeklyResetLine: "Weekly reset: {localTime}",
        loading: "Loading",
        empty: "Be the first"
      }
    },
    storage: {
      getCounters() {
        return { runCompletes: 1 };
      },
      getLeaderboardProfile() {
        return { nickname: "", optIn: false };
      },
      getPersonalBest() {
        return { bestScoreFP: 0 };
      }
    }
  };

  const html = leaderboard.renderLandingCard(ui, {
    escapeHtml: (s) => String(s)
  });

  expect(html).toContain("SeedOne");
  expect(html).toContain("SeedTwo");
});

test("leaderboard landing card prefers remote rows over seed rows when remote data exists", () => {
  const leaderboard = loadLeaderboardModule();
  const ui = {
    state: "LANDING",
    render() {},
    _runtime: {
      leaderboard: {
        loading: false,
        lastFetchedAt: Date.now(),
        error: "",
        source: "remote",
        weekly: [
          { rank: 1, nickname: "RemoteOne", scoreFP: 25, isLocalPlayer: false }
        ],
        all: []
      }
    },
    config: {
      leaderboard: {
        enabled: true,
        apiBaseUrl: "https://example.test",
        cacheTtlMs: 60000,
        topN: 10,
        cardPreviewCount: 3,
        showAfterRunCompletes: 1,
        seedScores: {
          weekly: [{ nickname: "SeedOne", scoreFP: 21 }],
          all: []
        }
      }
    },
    wording: {
      leaderboard: {
        cardTitle: "THIS WEEK",
        cardSubDefault: "Top scores this week.",
        cardCtaJoin: "Choose nickname",
        cardWeeklyResetLine: "Weekly reset: {localTime}",
        loading: "Loading",
        empty: "Be the first"
      }
    },
    storage: {
      getCounters() {
        return { runCompletes: 1 };
      },
      getLeaderboardProfile() {
        return { nickname: "", optIn: false };
      },
      getPersonalBest() {
        return { bestScoreFP: 0 };
      }
    }
  };

  const html = leaderboard.renderLandingCard(ui, {
    escapeHtml: (s) => String(s)
  });

  expect(html).toContain("RemoteOne");
  expect(html).not.toContain("SeedOne");
});

test("leaderboard tab switching toggles button state and panel visibility", () => {
  const leaderboard = loadLeaderboardModule();
  const rankingBtn = createFakeNode("ranking");
  const profileBtn = createFakeNode("profile");
  const rankingPanel = createFakePanel("ranking", false);
  const profilePanel = createFakePanel("profile", true);
  const ui = {
    modalContentEl: {
      querySelectorAll(selector) {
        if (selector === "[data-wt-leaderboard-tab]") {
          return [rankingBtn, profileBtn];
        }
        if (selector === "[data-wt-leaderboard-panel]") {
          return [rankingPanel, profilePanel];
        }
        return [];
      }
    }
  };

  leaderboard.switchModalTab(ui, "profile");

  expect(profileBtn.classList.contains("wt-btn--primary")).toBe(true);
  expect(profileBtn.getAttribute("aria-selected")).toBe("true");
  expect(profileBtn.getAttribute("tabindex")).toBe("0");
  expect(rankingBtn.classList.contains("wt-btn--secondary")).toBe(true);
  expect(rankingBtn.getAttribute("aria-selected")).toBe("false");
  expect(rankingBtn.getAttribute("tabindex")).toBe("-1");
  expect(rankingPanel.hidden).toBe(true);
  expect(profilePanel.hidden).toBe(false);
});

test("leaderboard submitRun posts normalized payload and returns json data", async () => {
  let fetchArgs = null;
  const leaderboard = loadLeaderboardModule({
    window: {
      fetch: async (url, init) => {
        fetchArgs = { url, init };
        return {
          ok: true,
          async json() {
            return { weekly_rank: 3, all_time_rank: 7 };
          }
        };
      }
    }
  });

  const ui = {
    _runtime: {
      leaderboard: {
        loading: false,
        lastFetchedAt: 123,
        error: "",
        source: "remote",
        weekly: [],
        all: []
      }
    },
    config: {
      leaderboard: {
        enabled: true,
        submitScores: true,
        apiBaseUrl: "https://example.test",
        topN: 10
      }
    },
    storage: {
      getLeaderboardProfile() {
        return { deviceUuid: "dev-1", nickname: "Ace", optIn: true };
      }
    }
  };

  const result = await leaderboard.submitRun(
    ui,
    {
      mode: "RUN",
      runId: "run-1",
      runNumber: 5,
      durationMs: 8123,
      answerLog: [
        { id: 1, answer: false, ms: 1200.9 },
        { id: 2, answer: true, ms: 800 }
      ]
    },
    {
      getLeaderboardContentVersion() {
        return "2026-05-23";
      }
    }
  );

  expect(result).toEqual({
    ok: true,
    data: { weekly_rank: 3, all_time_rank: 7 }
  });
  expect(fetchArgs.url).toBe("https://example.test/score");
  expect(JSON.parse(fetchArgs.init.body)).toEqual({
    device_uuid: "dev-1",
    run_id: "run-1",
    run_number: 5,
    content_version: "2026-05-23",
    run_mode: "RUN",
    duration_ms: 8123,
    answers: [
      { id: 1, answer: false, ms: 1200 },
      { id: 2, answer: true, ms: 800 }
    ]
  });
  expect(ui._runtime.leaderboard.lastFetchedAt).toBe(0);
});

test("leaderboard submitRun surfaces HTTP rejection as non-skipped failure", async () => {
  const leaderboard = loadLeaderboardModule({
    window: {
      fetch: async () => ({
        ok: false,
        status: 409
      })
    }
  });

  const ui = {
    config: {
      leaderboard: {
        enabled: true,
        submitScores: true,
        apiBaseUrl: "https://example.test"
      }
    },
    storage: {
      getLeaderboardProfile() {
        return { deviceUuid: "dev-1", nickname: "Ace", optIn: true };
      }
    }
  };

  const result = await leaderboard.submitRun(
    ui,
    {
      mode: "RUN",
      runId: "run-2",
      runNumber: 6,
      durationMs: 7000,
      answerLog: [{ id: 1, answer: false, ms: 400 }]
    },
    {
      getLeaderboardContentVersion() {
        return "2026-05-23";
      }
    }
  );

  expect(result).toEqual({
    ok: false,
    skipped: false,
    reason: "http_409"
  });
});

test("leaderboard handleSubmitResult shows weekly rank toast on successful submit", () => {
  const leaderboard = loadLeaderboardModule();
  const toasts = [];
  let reopened = 0;
  const ui = {
    config: {},
    modalEl: {
      classList: {
        contains(name) {
          return String(name) === "wt-hidden" ? false : false;
        }
      }
    },
    modalContentEl: {
      querySelector(selector) {
        if (selector === '[data-wt-leaderboard-panel="ranking"]') {
          return {
            hasAttribute(name) {
              return String(name) === "hidden" ? false : false;
            }
          };
        }
        return null;
      }
    },
    _runtime: {
      _modalKey: "leaderboard"
    },
    wording: {
      leaderboard: {
        rankToastWeekly: "This week: #{rank}.",
        scoreRejectedToast: "Rejected"
      }
    },
    openLeaderboardModal() {
      reopened += 1;
    }
  };

  leaderboard.handleSubmitResult(
    ui,
    {
      ok: true,
      data: { weekly_rank: 12 }
    },
    {
      clampInt(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, Math.floor(n)));
      },
      fillTemplate(tpl, vars) {
        return String(tpl || "").replace(/\{(\w+)\}/g, (_m, key) =>
          Object.prototype.hasOwnProperty.call(vars || {}, key)
            ? String(vars[key])
            : ""
        );
      },
      toastNow(_cfg, message, opts) {
        toasts.push({ message, opts });
      }
    }
  );

  expect(toasts).toEqual([
    {
      message: "This week: #12.",
      opts: { variant: "info" }
    }
  ]);
  expect(reopened).toBe(1);
});

test("leaderboard handleSubmitResult shows rejection toast for non-skipped failure", () => {
  const leaderboard = loadLeaderboardModule();
  const toasts = [];
  const ui = {
    config: {},
    wording: {
      leaderboard: {
        rankToastWeekly: "This week: #{rank}.",
        scoreRejectedToast: "This RUN was not added."
      }
    }
  };

  leaderboard.handleSubmitResult(
    ui,
    {
      ok: false,
      skipped: false,
      reason: "http_409"
    },
    {
      clampInt(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, Math.floor(n)));
      },
      fillTemplate(tpl) {
        return String(tpl || "");
      },
      toastNow(_cfg, message, opts) {
        toasts.push({ message, opts });
      }
    }
  );

  expect(toasts).toEqual([
    {
      message: "This RUN was not added.",
      opts: { variant: "info" }
    }
  ]);
});
