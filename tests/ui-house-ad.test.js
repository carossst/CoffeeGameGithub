"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

// See tests/ui-checkout.test.js for why ui.js needs these stubs to load at all.
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
  return { context, UI: context.window.WT_UI };
}

function makeHouseAdThis(configOverrides) {
  return {
    config: { houseAd: { url: "https://wordtraps.com/", ...configOverrides } },
    storage: null
  };
}

test("openHouseAd opens a well-formed https URL", () => {
  const opened = [];
  const { UI } = loadUi({ open: (...args) => opened.push(args) });
  const fakeThis = makeHouseAdThis();

  UI.prototype.openHouseAd.call(fakeThis);

  expect(opened).toEqual([["https://wordtraps.com/", "_blank", "noopener"]]);
});

test("openHouseAd refuses a non-https URL scheme", () => {
  const opened = [];
  const { UI } = loadUi({ open: (...args) => opened.push(args) });
  const fakeThis = makeHouseAdThis({ url: "javascript:alert(1)" });

  UI.prototype.openHouseAd.call(fakeThis);

  expect(opened).toEqual([]);
});

test("openHouseAd refuses a malformed URL", () => {
  const opened = [];
  const { UI } = loadUi({ open: (...args) => opened.push(args) });
  const fakeThis = makeHouseAdThis({ url: "not-a-url" });

  UI.prototype.openHouseAd.call(fakeThis);

  expect(opened).toEqual([]);
});

test("openHouseAd does nothing when no URL is configured", () => {
  const opened = [];
  const { UI } = loadUi({ open: (...args) => opened.push(args) });
  const fakeThis = makeHouseAdThis({ url: "" });

  UI.prototype.openHouseAd.call(fakeThis);

  expect(opened).toEqual([]);
});
