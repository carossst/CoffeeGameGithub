"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

// ui.js is a monolithic module that throws at load time unless WT_ENUMS /
// WT_CONFIG / WT_WORDING already exist on window (see its top-of-file
// guards). We stub minimal versions here rather than loading the real
// config.js, since checkout() only ever reads from `this.config` /
// `this.wording`, not the window globals.
function baseUiWindowOverrides(extra) {
  return {
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
    ...(extra || {})
  };
}

function loadUi() {
  const windowLike = createWindowLike(baseUiWindowOverrides());
  const context = loadBrowserScript("ui.js", { window: windowLike });
  return { context, UI: context.window.WT_UI };
}

function makeCheckoutThis(configOverrides) {
  return {
    config: {
      stripeStandardPaymentUrl: "https://buy.stripe.com/test_standard",
      stripeEarlyPaymentUrl: "https://buy.stripe.com/test_early",
      ...configOverrides
    },
    wording: { system: {} },
    storage: null
  };
}

test("checkout redirects to an allowed Stripe hostname", () => {
  const { context, UI } = loadUi();
  const fakeThis = makeCheckoutThis();

  UI.prototype.checkout.call(fakeThis, "STANDARD");

  expect(context.window.location.href).toBe(
    "https://buy.stripe.com/test_standard"
  );
});

test("checkout picks the early-price URL for the EARLY price key", () => {
  const { context, UI } = loadUi();
  const fakeThis = makeCheckoutThis();

  UI.prototype.checkout.call(fakeThis, "EARLY");

  expect(context.window.location.href).toBe(
    "https://buy.stripe.com/test_early"
  );
});

test("checkout refuses to redirect to a non-Stripe hostname", () => {
  const { context, UI } = loadUi();
  const fakeThis = makeCheckoutThis({
    stripeStandardPaymentUrl: "https://evil.example.com/steal"
  });

  UI.prototype.checkout.call(fakeThis, "STANDARD");

  expect(context.window.location.href).toBe("");
});

test("checkout refuses a malformed payment URL", () => {
  const { context, UI } = loadUi();
  const fakeThis = makeCheckoutThis({ stripeStandardPaymentUrl: "not-a-url" });

  UI.prototype.checkout.call(fakeThis, "STANDARD");

  expect(context.window.location.href).toBe("");
});

test("checkout does nothing while offline", () => {
  const windowLike = createWindowLike(
    baseUiWindowOverrides({ navigator: { language: "en-US", onLine: false } })
  );
  const context = loadBrowserScript("ui.js", { window: windowLike });
  const UI = context.window.WT_UI;
  const fakeThis = makeCheckoutThis();

  UI.prototype.checkout.call(fakeThis, "STANDARD");

  expect(context.window.location.href).toBe("");
});
