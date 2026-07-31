"use strict";

let workerModule;

beforeAll(async () => {
  workerModule = await import("../redeem-worker/src/index.js");
});

beforeEach(() => {
  if (workerModule?.resetRateLimitMemoryForTests) {
    workerModule.resetRateLimitMemoryForTests();
  }
});

function createFakeDb(resolver) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: () => Promise.resolve(resolver(sql, args, "first")),
            all: () => Promise.resolve(resolver(sql, args, "all")),
            run: () => Promise.resolve(resolver(sql, args, "run"))
          };
        }
      };
    }
  };
}

async function readJson(response) {
  return response.json();
}

function redeemRequest(body) {
  return new Request("https://example.test/redeem-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://breworfalse.com"
    },
    body: JSON.stringify(body)
  });
}

test("POST /redeem-code accepts ADMIN_CODE from any device with no use cap", async () => {
  const inserted = [];
  const env = {
    ADMIN_CODE: "super-secret-admin",
    GUEST_CODE: "guest-2026",
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("INSERT INTO code_redemptions") && op === "run") {
        inserted.push(args);
        return { success: true };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const first = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "super-secret-admin", device_uuid: "device-a" }),
    env
  );
  const second = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "super-secret-admin", device_uuid: "device-b" }),
    env
  );

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  await expect(readJson(first)).resolves.toEqual({ ok: true, tier: "admin" });
  await expect(readJson(second)).resolves.toEqual({ ok: true, tier: "admin" });
  expect(inserted).toEqual([
    ["admin", "super-secret-admin", "device-a", expect.any(Number)],
    ["admin", "super-secret-admin", "device-b", expect.any(Number)]
  ]);
});

test("POST /redeem-code accepts GUEST_CODE and reports remaining uses", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    GUEST_CODE: "guest-2026",
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("SELECT COUNT(*) AS use_count") && op === "first") {
        return { use_count: 3 };
      }
      if (sql.includes("INSERT INTO code_redemptions") && op === "run") {
        return { success: true };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const response = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "guest-2026", device_uuid: "device-c" }),
    env
  );

  expect(response.status).toBe(200);
  await expect(readJson(response)).resolves.toEqual({
    ok: true,
    tier: "guest",
    uses_remaining: 6
  });
});

test("POST /redeem-code rejects GUEST_CODE once the 10-use cap is reached", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    GUEST_CODE: "guest-2026",
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("SELECT COUNT(*) AS use_count") && op === "first") {
        return { use_count: 10 };
      }
      throw new Error(
        `INSERT should not run once the cap is reached: ${op} ${sql}`
      );
    })
  };

  const response = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "guest-2026", device_uuid: "device-d" }),
    env
  );

  expect(response.status).toBe(403);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    reason: "GUEST_CODE_EXHAUSTED"
  });
});

test("POST /redeem-code returns NOT_FOUND for a code that matches neither secret", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    GUEST_CODE: "guest-2026",
    DB: createFakeDb(() => {
      throw new Error("DB should not be queried for an unrecognized code");
    })
  };

  const response = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "BF-1234-5678", device_uuid: "device-e" }),
    env
  );

  expect(response.status).toBe(404);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    reason: "NOT_FOUND"
  });
});

test("POST /redeem-code returns NOT_FOUND for any code when the secrets are unset", async () => {
  const env = {
    DB: createFakeDb(() => {
      throw new Error("DB should not be queried when no secret is configured");
    })
  };

  const response = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "anything", device_uuid: "device-f" }),
    env
  );

  expect(response.status).toBe(404);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    reason: "NOT_FOUND"
  });
});

test("POST /redeem-code rejects a missing device_uuid", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    DB: createFakeDb(() => {
      throw new Error("DB should not be queried for an invalid request");
    })
  };

  const response = await workerModule.handlePostRedeemCode(
    redeemRequest({ code: "super-secret-admin" }),
    env
  );

  expect(response.status).toBe(400);
});

test("Worker rejects write requests from disallowed origins", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    DB: createFakeDb(() => {
      throw new Error("DB should not be queried for a disallowed origin");
    })
  };

  const request = new Request("https://example.test/redeem-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://not-allowed.example"
    },
    body: JSON.stringify({
      code: "super-secret-admin",
      device_uuid: "device-g"
    })
  });

  const response = await workerModule.default.fetch(request, env);

  expect(response.status).toBe(403);
});

test("Worker rate limits repeated redeem-code attempts per device", async () => {
  const env = {
    ADMIN_CODE: "super-secret-admin",
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("INSERT INTO code_redemptions") && op === "run") {
        return { success: true };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    }),
    ALLOWED_ORIGINS: "https://breworfalse.com"
  };

  let lastResponse = null;
  for (let i = 0; i < 6; i += 1) {
    const request = new Request("https://example.test/redeem-code", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://breworfalse.com",
        "cf-connecting-ip": "203.0.113.20"
      },
      body: JSON.stringify({
        code: "super-secret-admin",
        device_uuid: "dev-redeem-rate-limit"
      })
    });
    lastResponse = await workerModule.default.fetch(request, env);
  }

  expect(lastResponse.status).toBe(429);
  await expect(readJson(lastResponse)).resolves.toEqual({
    ok: false,
    error: "Too many requests"
  });
});
