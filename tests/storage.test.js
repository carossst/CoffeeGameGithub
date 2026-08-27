"use strict";

const {
  loadBrowserScript,
  createWindowLike
} = require("./helpers/browser-loader");

const baseConfig = {
  storageSchemaVersion: "test-v1",
  identity: { appName: "Brew or False" },
  storage: {
    storageKey: "boc-test-storage",
    vanityCodeStorageKey: "boc-test-vanity"
  },
  premiumCodePrefix: "BF",
  premiumCodeRegex: "^BF-[0-9]{4}-[0-9]{4}$",
  acceptCodeOncePerDevice: true,
  limits: {
    freeRuns: 2
  },
  mistakesOnly: {
    freeRunsLimit: 2
  }
};

function createStorageManager(configOverrides, windowOverrides) {
  const sharedWindow = createWindowLike(windowOverrides);
  const context = loadBrowserScript("storage.js", { window: sharedWindow });
  const StorageManager = context.window.WT_StorageManager;
  const cfg = {
    ...baseConfig,
    ...(configOverrides || {}),
    storage: {
      ...baseConfig.storage,
      ...(configOverrides?.storage || {})
    },
    limits: {
      ...baseConfig.limits,
      ...(configOverrides?.limits || {})
    },
    mistakesOnly: {
      ...baseConfig.mistakesOnly,
      ...(configOverrides?.mistakesOnly || {})
    }
  };
  const storage = new StorageManager(cfg);
  storage.init();
  return { context, storage };
}

test("free RUN economy consumes exactly 2 runs then blocks", () => {
  const { storage } = createStorageManager();

  const first = storage.consumeRunOrBlock();
  const second = storage.consumeRunOrBlock();
  const third = storage.consumeRunOrBlock();

  expect(first).toMatchObject({ ok: true, reason: "CONSUMED", balance: 1 });
  expect(second).toMatchObject({ ok: true, reason: "CONSUMED", balance: 0 });
  expect(third).toMatchObject({ ok: false, reason: "NO_RUNS", balance: 0 });
  expect(storage.getRunsUsed()).toBe(2);
});

test("premium RUN economy no longer consumes run balance", () => {
  const { storage } = createStorageManager();

  const unlocked = storage.unlockPremium();
  const first = storage.consumeRunOrBlock();
  const second = storage.consumeRunOrBlock();

  expect(unlocked).toMatchObject({ ok: true, already: false });
  expect(first).toMatchObject({ ok: true, reason: "PREMIUM" });
  expect(second).toMatchObject({ ok: true, reason: "PREMIUM" });
  expect(storage.getRunsBalance()).toBe(2);
  expect(storage.getRunsUsed()).toBe(2);
});

test("practice economy respects the configured free-run limit", () => {
  const { storage } = createStorageManager();

  const first = storage.consumePracticeOrBlock();
  const second = storage.consumePracticeOrBlock();
  const third = storage.consumePracticeOrBlock();

  expect(first).toMatchObject({
    ok: true,
    reason: "CONSUMED",
    used: 1,
    limit: 2
  });
  expect(second).toMatchObject({
    ok: true,
    reason: "CONSUMED",
    used: 2,
    limit: 2
  });
  expect(third).toMatchObject({
    ok: false,
    reason: "NO_RUNS",
    used: 2,
    limit: 2
  });
});

test("tryRedeemPremiumCode rejects empty input", () => {
  const { storage } = createStorageManager();

  const result = storage.tryRedeemPremiumCode("");

  expect(result).toMatchObject({ ok: false, reason: "EMPTY" });
  expect(storage.isPremium()).toBe(false);
});

test("tryRedeemPremiumCode rejects a code that does not match the configured format", () => {
  const { storage } = createStorageManager();

  const result = storage.tryRedeemPremiumCode("not-a-real-code");

  expect(result).toMatchObject({ ok: false, reason: "INVALID" });
  expect(storage.isPremium()).toBe(false);
});

// NOTE: this documents the current, known-insecure behavior (same root cause
// already flagged on the Pickleball sibling app): any string matching the
// BF-####-#### shape unlocks premium, with no server-side link back to an
// actual Stripe payment. Tracked separately as a security gap to close; this
// test exists so a future fix intentionally changes this assertion rather
// than silently regressing coverage.
test("tryRedeemPremiumCode currently accepts any code matching the configured format", () => {
  const { storage } = createStorageManager();

  const result = storage.tryRedeemPremiumCode("BF-1234-5678");

  expect(result).toMatchObject({ ok: true });
  expect(storage.isPremium()).toBe(true);
});

test("tryRedeemPremiumCode enforces one redemption per device when configured", () => {
  const { storage } = createStorageManager();

  const first = storage.tryRedeemPremiumCode("BF-1111-2222");
  expect(first).toMatchObject({ ok: true });
  expect(storage.data.codes.redeemedOnce).toBe(true);

  // Simulate a device that already redeemed a code but is no longer premium
  // (e.g. a future downgrade/expiry path) — the per-device flag must still
  // block a second free redemption.
  storage.data.isPremium = false;

  const second = storage.tryRedeemPremiumCode("BF-3333-4444");

  expect(second).toMatchObject({ ok: false, reason: "USED" });
  expect(storage.isPremium()).toBe(false);
});

test("tryRedeemPremiumCode is a no-op once premium is already unlocked", () => {
  const { storage } = createStorageManager();

  storage.unlockPremium();
  const result = storage.tryRedeemPremiumCode("BF-9999-0000");

  expect(result).toMatchObject({ ok: true, reason: "ALREADY" });
});

function mockJsonFetch(status, body) {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    });
}

const redeemApiConfig = {
  redeemApi: {
    apiBaseUrl: "https://bf-redeem.example.workers.dev",
    requestTimeoutMs: 4000
  }
};

test("tryRedeemPremiumCodeRemote unlocks premium for a server-verified admin code", async () => {
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: mockJsonFetch(200, { ok: true, tier: "admin" })
  });

  const result = await storage.tryRedeemPremiumCodeRemote("super-secret-admin");

  expect(result).toMatchObject({ ok: true, reason: "UNLOCKED", tier: "admin" });
  expect(storage.isPremium()).toBe(true);
  expect(storage.data.codes.tier).toBe("admin");
});

test("tryRedeemPremiumCodeRemote unlocks premium for a server-verified guest code", async () => {
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: mockJsonFetch(200, { ok: true, tier: "guest", uses_remaining: 6 })
  });

  const result = await storage.tryRedeemPremiumCodeRemote("guest-2026");

  expect(result).toMatchObject({ ok: true, reason: "UNLOCKED", tier: "guest" });
  expect(storage.isPremium()).toBe(true);
});

test("tryRedeemPremiumCodeRemote does not unlock when the guest code is exhausted", async () => {
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: mockJsonFetch(403, { ok: false, reason: "GUEST_CODE_EXHAUSTED" })
  });

  const result = await storage.tryRedeemPremiumCodeRemote("guest-2026");

  expect(result).toEqual({ ok: false, reason: "GUEST_CODE_EXHAUSTED" });
  expect(storage.isPremium()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports NOT_FOUND for a code the server does not recognize", async () => {
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: mockJsonFetch(404, { ok: false, reason: "NOT_FOUND" })
  });

  const result = await storage.tryRedeemPremiumCodeRemote("BF-1234-5678");

  expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  expect(storage.isPremium()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports REMOTE_UNAVAILABLE when the network call fails", async () => {
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: () => Promise.reject(new Error("network down"))
  });

  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: false, reason: "REMOTE_UNAVAILABLE" });
  expect(storage.isPremium()).toBe(false);
});

test("tryRedeemPremiumCodeRemote reports REMOTE_UNAVAILABLE without a network call when apiBaseUrl is unset", async () => {
  let called = false;
  const { storage } = createStorageManager(
    {},
    {
      fetch: () => {
        called = true;
        return Promise.resolve();
      }
    }
  );

  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: false, reason: "REMOTE_UNAVAILABLE" });
  expect(called).toBe(false);
});

test("tryRedeemPremiumCodeRemote short-circuits without a network call once already premium", async () => {
  let called = false;
  const { storage } = createStorageManager(redeemApiConfig, {
    fetch: () => {
      called = true;
      return Promise.resolve();
    }
  });

  storage.unlockPremium();
  const result = await storage.tryRedeemPremiumCodeRemote("anything");

  expect(result).toEqual({ ok: true, reason: "ALREADY" });
  expect(called).toBe(false);
});

test("tryRedeemPremiumCodeRemote rejects empty input", async () => {
  const { storage } = createStorageManager(redeemApiConfig);

  const result = await storage.tryRedeemPremiumCodeRemote("");

  expect(result).toEqual({ ok: false, reason: "EMPTY" });
});
