"use strict";

let workerModule;

beforeAll(async () => {
  workerModule = await import("../leaderboard-worker/src/index.js");
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

test("POST /score rejects mismatched content version with 409", async () => {
  const request = new Request("https://example.test/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-1",
      run_id: "run-1",
      run_number: 1,
      content_version: "wrong-version",
      run_mode: "RUN",
      duration_ms: 5000,
      answers: [{ id: 1, answer: false, ms: 10 }]
    })
  });

  const response = await workerModule.handlePostScore(request, {
    DB: createFakeDb(() => {
      throw new Error("DB should not be called on content version mismatch");
    })
  });

  expect(response.status).toBe(409);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    accepted: false,
    reject_reason: "CONTENT_VERSION_MISMATCH"
  });
});

test("POST /player rejects invalid nickname server-side", async () => {
  const request = new Request("https://example.test/player", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-bad-nick",
      nickname: "🎾💯",
      opt_in: true
    })
  });

  const response = await workerModule.handlePostPlayer(request, {
    DB: createFakeDb(() => {
      throw new Error("DB should not be called for invalid nickname");
    })
  });

  expect(response.status).toBe(400);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    error: "Invalid nickname"
  });
});

test("POST /player rejects too-long nickname server-side", async () => {
  const request = new Request("https://example.test/player", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-long-nick",
      nickname: "A".repeat(25),
      opt_in: true
    })
  });

  const response = await workerModule.handlePostPlayer(request, {
    DB: createFakeDb(() => {
      throw new Error("DB should not be called for too-long nickname");
    })
  });

  expect(response.status).toBe(400);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    error: "Nickname too long"
  });
});

test("POST /score rejects unknown answer ids fail-closed", async () => {
  const request = new Request("https://example.test/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-2",
      run_id: "run-2",
      run_number: 2,
      content_version: "1.4",
      run_mode: "RUN",
      duration_ms: 5000,
      answers: [{ id: 999999, answer: false, ms: 10 }]
    })
  });

  const env = {
    DB: createFakeDb((sql, _args, op) => {
      if (
        sql.includes("SELECT player_id, opt_in FROM players") &&
        op === "first"
      ) {
        return { player_id: 7, opt_in: 1 };
      }
      if (
        sql.includes("FROM score_submissions") &&
        sql.includes("WHERE run_id") &&
        op === "first"
      ) {
        return null;
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const response = await workerModule.handlePostScore(request, env);
  expect(response.status).toBe(422);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    accepted: false,
    reject_reason: "UNKNOWN_ITEM_ID"
  });
});

test("POST /score rejects duplicate answer ids fail-closed", async () => {
  const request = new Request("https://example.test/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-dup-answers",
      run_id: "run-dup-answers",
      run_number: 2,
      content_version: "1.4",
      run_mode: "RUN",
      duration_ms: 5000,
      answers: [
        { id: 1, answer: false, ms: 1000 },
        { id: 1, answer: false, ms: 1000 }
      ]
    })
  });

  const env = {
    DB: createFakeDb((sql, _args, op) => {
      if (
        sql.includes("SELECT player_id, opt_in FROM players") &&
        op === "first"
      ) {
        return { player_id: 7, opt_in: 1 };
      }
      if (
        sql.includes("FROM score_submissions") &&
        sql.includes("WHERE run_id") &&
        op === "first"
      ) {
        return null;
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const response = await workerModule.handlePostScore(request, env);
  expect(response.status).toBe(422);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    accepted: false,
    reject_reason: "DUPLICATE_ITEM_ID"
  });
});

test("POST /score is idempotent for duplicate run_id", async () => {
  const request = new Request("https://example.test/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-3",
      run_id: "run-dup",
      run_number: 3,
      content_version: "1.4",
      run_mode: "RUN",
      duration_ms: 6400,
      answers: [{ id: 1, answer: false, ms: 10 }]
    })
  });

  const seenRuns = [];
  const env = {
    DB: createFakeDb((sql, args, op) => {
      if (
        sql.includes("SELECT player_id, opt_in FROM players") &&
        op === "first"
      ) {
        return { player_id: 11, opt_in: 1 };
      }
      if (
        sql.includes("FROM score_submissions") &&
        sql.includes("WHERE run_id") &&
        op === "first"
      ) {
        seenRuns.push(args[0]);
        return {
          submission_id: 99,
          score_fp: 17,
          accepted: 1,
          reject_reason: ""
        };
      }
      if (sql.includes("SELECT best_score_fp, updated_at") && op === "first") {
        return { best_score_fp: 17, updated_at: 1000 };
      }
      if (sql.includes("COUNT(*) AS count_rows") && op === "first") {
        return { count_rows: 4 };
      }
      if (sql.includes("INSERT INTO score_submissions") && op === "run") {
        throw new Error("Duplicate flow should not insert a new submission");
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const response = await workerModule.handlePostScore(request, env);
  expect(response.status).toBe(200);
  await expect(readJson(response)).resolves.toEqual({
    ok: true,
    accepted: true,
    score_fp_server: 17,
    weekly_rank: 5,
    all_time_rank: 5,
    duplicate: true
  });
  expect(seenRuns).toEqual(["run-dup"]);
});

test("upsertBestScore does not replace an existing best with a lower score", async () => {
  const calls = [];
  const db = createFakeDb((sql, args, op) => {
    calls.push({ sql, args, op });
    if (sql.includes("SELECT best_score_fp") && op === "first") {
      return { best_score_fp: 20 };
    }
    if (sql.includes("UPDATE leaderboard_best") && op === "run") {
      throw new Error("Lower score should not trigger an update");
    }
    return null;
  });

  await workerModule.upsertBestScore(db, {
    playerId: 1,
    submissionId: 2,
    scoreFp: 19,
    updatedAt: 123,
    windowType: "weekly",
    weekKey: "2026-W21"
  });

  expect(
    calls.filter((it) => it.sql.includes("SELECT best_score_fp"))
  ).toHaveLength(1);
  expect(
    calls.filter((it) => it.sql.includes("UPDATE leaderboard_best"))
  ).toHaveLength(0);
});

test("upsertBestScore replaces an existing best with a higher score", async () => {
  let updateArgs = null;
  const db = createFakeDb((sql, args, op) => {
    if (sql.includes("SELECT best_score_fp") && op === "first") {
      return { best_score_fp: 20 };
    }
    if (sql.includes("UPDATE leaderboard_best") && op === "run") {
      updateArgs = args;
      return { success: true };
    }
    return null;
  });

  await workerModule.upsertBestScore(db, {
    playerId: 1,
    submissionId: 5,
    scoreFp: 21,
    updatedAt: 555,
    windowType: "weekly",
    weekKey: "2026-W21"
  });

  expect(updateArgs).toEqual([1, "weekly", "2026-W21", 21, 5, 555]);
});

test("getPlayerRank uses score, updated_at, and player_id tie-break inputs", async () => {
  let countBindArgs = null;
  const db = createFakeDb((sql, args, op) => {
    if (sql.includes("SELECT best_score_fp, updated_at") && op === "first") {
      return { best_score_fp: 18, updated_at: 1234 };
    }
    if (sql.includes("COUNT(*) AS count_rows") && op === "first") {
      countBindArgs = args;
      return { count_rows: 2 };
    }
    throw new Error(`Unexpected query: ${op} ${sql}`);
  });

  const rank = await workerModule.getPlayerRank(db, 9, "weekly", "2026-W21");
  expect(rank).toBe(3);
  expect(countBindArgs).toEqual(["weekly", "2026-W21", 18, 1234, 9]);
});

test("DELETE /player removes rows when device exists", async () => {
  const deleted = [];
  const env = {
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("SELECT player_id FROM players") && op === "first") {
        return { player_id: 42 };
      }
      if (sql.includes("DELETE FROM leaderboard_best") && op === "run") {
        deleted.push(["leaderboard_best", args[0]]);
        return { success: true };
      }
      if (sql.includes("DELETE FROM score_submissions") && op === "run") {
        deleted.push(["score_submissions", args[0]]);
        return { success: true };
      }
      if (sql.includes("DELETE FROM players") && op === "run") {
        deleted.push(["players", args[0]]);
        return { success: true };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const request = new Request(
    "https://example.test/player?device_uuid=dev-42",
    {
      method: "DELETE"
    }
  );
  const response = await workerModule.handleDeletePlayer(request, env);

  expect(response.status).toBe(200);
  await expect(readJson(response)).resolves.toEqual({
    ok: true,
    deleted: true
  });
  expect(deleted).toEqual([
    ["leaderboard_best", 42],
    ["score_submissions", 42],
    ["players", 42]
  ]);
});

test("Worker rejects write requests from disallowed origins", async () => {
  const request = new Request("https://example.test/player", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example"
    },
    body: JSON.stringify({
      device_uuid: "dev-evil",
      nickname: "ValidNick",
      opt_in: true
    })
  });

  const response = await workerModule.default.fetch(request, {
    DB: createFakeDb(() => {
      throw new Error("DB should not be called for disallowed origin");
    }),
    ALLOWED_ORIGINS: "https://pickleballrulesquiz.com"
  });

  expect(response.status).toBe(403);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    error: "Origin not allowed"
  });
});

test("Worker echoes allowed origin in CORS headers", async () => {
  const request = new Request(
    "https://example.test/leaderboard?window=weekly",
    {
      method: "GET",
      headers: {
        origin: "https://pickleballrulesquiz.com"
      }
    }
  );

  const response = await workerModule.default.fetch(request, {
    DB: createFakeDb((sql, _args, op) => {
      if (sql.includes("SELECT lb.best_score_fp AS score_fp") && op === "all") {
        return { results: [] };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    }),
    ALLOWED_ORIGINS: "https://pickleballrulesquiz.com"
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "https://pickleballrulesquiz.com"
  );
});

test("Worker rate limits repeated player writes per device", async () => {
  const env = {
    DB: createFakeDb((sql, args, op) => {
      if (sql.includes("INSERT INTO players") && op === "run") {
        return { success: true };
      }
      if (
        sql.includes("SELECT player_id, nickname, opt_in") &&
        op === "first"
      ) {
        return {
          player_id: 1,
          nickname: String(args[0] || "ValidNick"),
          opt_in: true
        };
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    }),
    ALLOWED_ORIGINS: "https://pickleballrulesquiz.com"
  };

  let lastResponse = null;
  for (let i = 0; i < 6; i += 1) {
    const request = new Request("https://example.test/player", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://pickleballrulesquiz.com",
        "cf-connecting-ip": "203.0.113.10"
      },
      body: JSON.stringify({
        device_uuid: "dev-rate-limit",
        nickname: "ValidNick",
        opt_in: true
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

test("POST /score rejects implausibly fast runs", async () => {
  const request = new Request("https://example.test/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_uuid: "dev-fast-run",
      run_id: "run-fast-run",
      run_number: 3,
      content_version: "1.4",
      run_mode: "RUN",
      duration_ms: 200,
      answers: [{ id: 1, answer: false, ms: 10 }]
    })
  });

  const env = {
    DB: createFakeDb((sql, _args, op) => {
      if (
        sql.includes("SELECT player_id, opt_in FROM players") &&
        op === "first"
      ) {
        return { player_id: 9, opt_in: 1 };
      }
      if (
        sql.includes("FROM score_submissions") &&
        sql.includes("WHERE run_id") &&
        op === "first"
      ) {
        return null;
      }
      throw new Error(`Unexpected query: ${op} ${sql}`);
    })
  };

  const response = await workerModule.handlePostScore(request, env);
  expect(response.status).toBe(422);
  await expect(readJson(response)).resolves.toEqual({
    ok: false,
    accepted: false,
    reject_reason: "IMPROBABLE_DURATION_MS"
  });
});

test("getUtcWeekKey uses ISO weeks starting on Monday UTC", () => {
  expect(workerModule.getUtcWeekKey(Date.UTC(2026, 4, 24, 23, 59, 59))).toBe(
    "2026-W21"
  );
  expect(workerModule.getUtcWeekKey(Date.UTC(2026, 4, 25, 0, 0, 0))).toBe(
    "2026-W22"
  );
});

test("getUtcWeekKey handles ISO week-year boundaries", () => {
  expect(workerModule.getUtcWeekKey(Date.UTC(2026, 0, 1, 12, 0, 0))).toBe(
    "2026-W01"
  );
  expect(workerModule.getUtcWeekKey(Date.UTC(2027, 0, 1, 12, 0, 0))).toBe(
    "2026-W53"
  );
  expect(workerModule.getUtcWeekKey(Date.UTC(2027, 0, 4, 0, 0, 0))).toBe(
    "2027-W01"
  );
});
