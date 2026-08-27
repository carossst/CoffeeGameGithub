"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

// ui.js needs these stubs just to evaluate (see tests/ui-checkout.test.js).
function loadUi(windowOverrides) {
  const windowLike = createWindowLike({
    WT_ENUMS: {
      UI_STATES: {
        LANDING: "LANDING",
        PLAYING: "PLAYING",
        END: "END",
        PAYWALL: "PAYWALL"
      },
      GAME_MODES: { RUN: "RUN", PRACTICE: "PRACTICE", BONUS: "BONUS" }
    },
    WT_CONFIG: {},
    WT_WORDING: {},
    WT_UTILS: { escapeHtml: (s) => String(s) },
    open: () => {},
    ...(windowOverrides || {})
  });
  const context = loadBrowserScript("ui.js", { window: windowLike });
  return { context, UI: context.window.WT_UI, window: context.window };
}

// A `this` that carries the real UI.prototype (so cross-method calls resolve)
// plus the minimal state the leaderboard methods read.
function makeThis(UI, mod) {
  return Object.assign(Object.create(UI.prototype), {
    config: { leaderboard: { contentVersion: "1.4" }, version: "9.9.9" },
    _leaderboardModule() {
      return mod || null;
    }
  });
}

test("openLeaderboardModal delegates to WT_UI_Leaderboard.openModal with helpers + tab", () => {
  const calls = [];
  const { UI } = loadUi();
  const mod = { openModal: (ui, opts) => calls.push(["openModal", opts]) };

  UI.prototype.openLeaderboardModal.call(makeThis(UI, mod), {
    initialTab: "profile"
  });

  expect(calls.length).toBe(1);
  expect(calls[0][1].initialTab).toBe("profile");
  expect(typeof calls[0][1].escapeHtml).toBe("function");
  expect(typeof calls[0][1].toastNow).toBe("function");
  expect(typeof calls[0][1].getLeaderboardContentVersion).toBe("function");
});

test("openLeaderboardProfileModal opens the profile tab", () => {
  const calls = [];
  const { UI } = loadUi();
  const mod = { openModal: (ui, opts) => calls.push(opts.initialTab) };

  UI.prototype.openLeaderboardProfileModal.call(makeThis(UI, mod));

  expect(calls).toEqual(["profile"]);
});

test("switch / save / leave leaderboard methods delegate to the module", () => {
  const calls = [];
  const { UI } = loadUi();
  const mod = {
    switchModalTab: (ui, key) => calls.push(["switch", key]),
    saveProfileFromModal: () => calls.push(["save"]),
    leaveFromModal: () => calls.push(["leave"])
  };

  UI.prototype.switchLeaderboardTab.call(makeThis(UI, mod), "ranking");
  UI.prototype.saveLeaderboardProfileFromModal.call(makeThis(UI, mod));
  UI.prototype.leaveLeaderboard.call(makeThis(UI, mod));

  expect(calls).toEqual([["switch", "ranking"], ["save"], ["leave"]]);
});

test("leaderboard UI methods are no-ops when the module is absent", () => {
  const { UI } = loadUi();
  const self = makeThis(UI, null);
  expect(() => UI.prototype.openLeaderboardModal.call(self)).not.toThrow();
  expect(() => UI.prototype.switchLeaderboardTab.call(self, "x")).not.toThrow();
  expect(() => UI.prototype.leaveLeaderboard.call(self)).not.toThrow();
});
