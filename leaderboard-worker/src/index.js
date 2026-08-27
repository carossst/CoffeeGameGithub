import {
  ANSWER_KEY_ENTRIES,
  LEADERBOARD_CONTENT_VERSION
} from "./content-key.js";
import {
  buildAnswerKey,
  computeServerScore,
  validateSubmittedAnswers
} from "./score-utils.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://breworfalse.com",
  "https://www.breworfalse.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8787",
  "http://127.0.0.1:8787"
];

const NICKNAME_MIN_LEN = 3;
const NICKNAME_MAX_LEN = 24;
const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _-]{2,23}$/u;
const DEVICE_UUID_MAX_LEN = 128;
const RUN_ID_MAX_LEN = 128;
const RATE_LIMIT_MEMORY = new Map();

const RATE_LIMIT_RULES = Object.freeze({
  playerWriteIp: { windowMs: 10 * 60 * 1000, maxHits: 20 },
  playerWriteDevice: { windowMs: 10 * 60 * 1000, maxHits: 5 },
  scoreWriteIp: { windowMs: 10 * 60 * 1000, maxHits: 120 },
  scoreWriteDevice: { windowMs: 10 * 60 * 1000, maxHits: 20 },
  deleteWriteIp: { windowMs: 10 * 60 * 1000, maxHits: 10 },
  deleteWriteDevice: { windowMs: 10 * 60 * 1000, maxHits: 3 }
});

function getAllowedOrigins(env) {
  const raw = String(env?.ALLOWED_ORIGINS || "").trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const list = raw
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS;
}

function resolveCorsOrigin(request, env) {
  const allowed = getAllowedOrigins(env);
  const requestOrigin = String(request?.headers?.get("origin") || "").trim();
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] || "https://breworfalse.com";
}

function corsHeaders(request, env) {
  return {
    "access-control-allow-origin": resolveCorsOrigin(request, env),
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin"
  };
}

function json(data, init, request, env) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env)
    },
    ...init
  });
}

function logInfo(event, fields) {
  console.log(
    JSON.stringify({
      level: "info",
      event: String(event || "").trim(),
      ...fields
    })
  );
}

function logWarn(event, fields) {
  console.warn(
    JSON.stringify({
      level: "warn",
      event: String(event || "").trim(),
      ...fields
    })
  );
}

function logError(event, fields) {
  console.error(
    JSON.stringify({
      level: "error",
      event: String(event || "").trim(),
      ...fields
    })
  );
}

function badRequest(message, request, env) {
  return json({ ok: false, error: message }, { status: 400 }, request, env);
}

function forbidden(message, request, env) {
  return json({ ok: false, error: message }, { status: 403 }, request, env);
}

function methodNotAllowed(request, env) {
  return json(
    { ok: false, error: "Method not allowed" },
    { status: 405 },
    request,
    env
  );
}

function noContent(request, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}

function now() {
  return Date.now();
}

function clampNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeWindow(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "weekly") return "weekly";
  if (value === "all") return "all";
  return "";
}

function trimMap(nowTs) {
  for (const [key, entry] of RATE_LIMIT_MEMORY.entries()) {
    if (!entry || clampNonNegativeInt(entry.expiresAt) <= nowTs) {
      RATE_LIMIT_MEMORY.delete(key);
    }
  }
}

function getClientIp(request) {
  const candidates = [
    request?.headers?.get("cf-connecting-ip"),
    request?.headers?.get("x-forwarded-for"),
    request?.headers?.get("x-real-ip")
  ];
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;
    return value.split(",")[0].trim();
  }
  return "";
}

function hitRateLimit(scope, identifier, rule, ts) {
  const safeScope = String(scope || "").trim();
  const safeId = String(identifier || "").trim();
  if (!safeScope || !safeId || !rule) return null;
  const windowMs = clampNonNegativeInt(rule.windowMs);
  const maxHits = clampNonNegativeInt(rule.maxHits);
  if (windowMs <= 0 || maxHits <= 0) return null;

  trimMap(ts);

  const bucket = Math.floor(ts / windowMs);
  const key = `${safeScope}:${safeId}:${bucket}`;
  const existing = RATE_LIMIT_MEMORY.get(key);
  const nextCount = existing ? clampNonNegativeInt(existing.count) + 1 : 1;
  RATE_LIMIT_MEMORY.set(key, {
    count: nextCount,
    expiresAt: (bucket + 1) * windowMs
  });

  if (nextCount > maxHits) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((((bucket + 1) * windowMs) - ts) / 1000)
      )
    };
  }

  return { ok: true };
}

function tooManyRequests(message, retryAfterSec, request, env, meta) {
  logWarn("worker.rate_limit", {
    path: new URL(request.url).pathname,
    retry_after_sec: Math.max(1, clampNonNegativeInt(retryAfterSec) || 1),
    scope: String(meta?.scope || "").trim(),
    subject: String(meta?.subject || "").trim()
  });
  return json(
    { ok: false, error: message },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.max(1, clampNonNegativeInt(retryAfterSec) || 1))
      }
    },
    request,
    env
  );
}

function enforceWriteRateLimits(request, env, rules) {
  const ts = now();
  const ip = getClientIp(request);
  if (ip && rules?.ip) {
    const ipCheck = hitRateLimit(rules.scope, `ip:${ip}`, rules.ip, ts);
    if (ipCheck && ipCheck.ok === false) {
      return tooManyRequests("Too many requests", ipCheck.retryAfterSec, request, env, {
        scope: rules.scope,
        subject: "ip"
      });
    }
  }

  const deviceUuid = String(rules?.deviceUuid || "").trim();
  if (deviceUuid && rules?.device) {
    const deviceCheck = hitRateLimit(
      rules.scope,
      `device:${deviceUuid}`,
      rules.device,
      ts
    );
    if (deviceCheck && deviceCheck.ok === false) {
      return tooManyRequests("Too many requests", deviceCheck.retryAfterSec, request, env, {
        scope: rules.scope,
        subject: "device"
      });
    }
  }

  return null;
}

function validateIdentifier(value, maxLen, missingMessage, invalidMessage) {
  const text = String(value || "").trim();
  if (!text) return { ok: false, reason: missingMessage };
  if (text.length > maxLen) return { ok: false, reason: invalidMessage };
  return { ok: true, value: text };
}

function getPlausibilityRejectReason(answers, durationMs, scoreFpServer) {
  const count = Array.isArray(answers) ? answers.length : 0;
  if (count <= 0) return "INVALID_ANSWERS";

  const minTotalMs = count * 250;
  if (durationMs < minTotalMs) return "IMPROBABLE_DURATION_MS";

  if (scoreFpServer === count && count >= 10 && durationMs < count * 450) {
    return "IMPROBABLE_PERFECT_RUN";
  }

  return "";
}

export function resetRateLimitMemoryForTests() {
  RATE_LIMIT_MEMORY.clear();
}

function ensureAllowedOrigin(request, env) {
  const origin = String(request?.headers?.get("origin") || "").trim();
  if (!origin) return null;
  if (getAllowedOrigins(env).includes(origin)) return null;
  return forbidden("Origin not allowed", request, env);
}

function validateNickname(rawNickname) {
  const nickname = String(rawNickname || "").trim();
  if (!nickname) return { ok: false, reason: "Missing nickname" };
  if (nickname.length < NICKNAME_MIN_LEN) {
    return { ok: false, reason: "Nickname too short" };
  }
  if (nickname.length > NICKNAME_MAX_LEN) {
    return { ok: false, reason: "Nickname too long" };
  }
  if (!NICKNAME_RE.test(nickname)) {
    return { ok: false, reason: "Invalid nickname" };
  }
  return { ok: true, nickname };
}

const ANSWER_KEY = buildAnswerKey(ANSWER_KEY_ENTRIES);

export function getUtcWeekKey(ts) {
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "";

  const isoDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const isoDay = isoDate.getUTCDay() || 7;

  isoDate.setUTCDate(isoDate.getUTCDate() + 4 - isoDay);

  const isoYear = isoDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((isoDate - yearStart) / 86400000) + 1) / 7);

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export async function handleGetLeaderboard(request, env) {
  const url = new URL(request.url);
  const windowType = normalizeWindow(url.searchParams.get("window"));
  if (!windowType) return badRequest("Missing or invalid window", request, env);

  const weekKey = windowType === "weekly" ? getUtcWeekKey(now()) : "all";
  const limit = 10;

  const rows = await env.DB.prepare(
    `
      SELECT lb.best_score_fp AS score_fp, p.nickname
      FROM leaderboard_best lb
      JOIN players p ON p.player_id = lb.player_id
      WHERE lb.window_type = ?1 AND lb.week_key = ?2
      ORDER BY lb.best_score_fp DESC, lb.updated_at ASC
      LIMIT ?3
    `
  )
    .bind(windowType, weekKey, limit)
    .all();

  const top = Array.isArray(rows?.results)
    ? rows.results.map((row, idx) => ({
      rank: idx + 1,
      nickname: String(row.nickname || ""),
      score_fp: clampNonNegativeInt(row.score_fp)
    }))
    : [];

  return json({
    ok: true,
    window: windowType,
    week_key: weekKey,
    top
  }, undefined, request, env);
}

export async function handlePostPlayer(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Invalid JSON", request, env);

  const deviceUuidCheck = validateIdentifier(
    body.device_uuid,
    DEVICE_UUID_MAX_LEN,
    "Missing device_uuid",
    "Invalid device_uuid"
  );
  if (!deviceUuidCheck.ok) return badRequest(deviceUuidCheck.reason, request, env);
  const deviceUuid = deviceUuidCheck.value;
  const nickname = String(body.nickname || "").trim();
  const optIn = body.opt_in === true ? 1 : 0;

  if (optIn === 1) {
    const validated = validateNickname(nickname);
    if (!validated.ok) {
      logWarn("worker.player.rejected", {
        path: new URL(request.url).pathname,
        reason: validated.reason
      });
      return badRequest(validated.reason, request, env);
    }
  }
  const rateLimit = enforceWriteRateLimits(request, env, {
    scope: "player-write",
    ip: RATE_LIMIT_RULES.playerWriteIp,
    device: RATE_LIMIT_RULES.playerWriteDevice,
    deviceUuid
  });
  if (rateLimit) return rateLimit;

  const ts = now();

  await env.DB.prepare(
    `
      INSERT INTO players (device_uuid, nickname, opt_in, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?4)
      ON CONFLICT(device_uuid) DO UPDATE SET
        nickname = CASE
          WHEN excluded.opt_in = 1 THEN excluded.nickname
          ELSE ""
        END,
        opt_in = excluded.opt_in,
        updated_at = excluded.updated_at
    `
  )
    .bind(deviceUuid, nickname, optIn, ts)
    .run();

  const row = await env.DB.prepare(
    `
      SELECT player_id, nickname, opt_in
      FROM players
      WHERE device_uuid = ?1
      LIMIT 1
    `
  )
    .bind(deviceUuid)
    .first();

  logInfo("worker.player.saved", {
    path: new URL(request.url).pathname,
    opt_in: optIn === 1
  });

  return json({
    ok: true,
    player_id: clampNonNegativeInt(row?.player_id),
    nickname: String(row?.nickname || ""),
    opt_in: row?.opt_in === 1
  }, undefined, request, env);
}

export async function handleDeletePlayer(request, env) {
  const url = new URL(request.url);
  const deviceUuidCheck = validateIdentifier(
    url.searchParams.get("device_uuid"),
    DEVICE_UUID_MAX_LEN,
    "Missing device_uuid",
    "Invalid device_uuid"
  );
  if (!deviceUuidCheck.ok) return badRequest(deviceUuidCheck.reason, request, env);
  const deviceUuid = deviceUuidCheck.value;
  const rateLimit = enforceWriteRateLimits(request, env, {
    scope: "player-delete",
    ip: RATE_LIMIT_RULES.deleteWriteIp,
    device: RATE_LIMIT_RULES.deleteWriteDevice,
    deviceUuid
  });
  if (rateLimit) return rateLimit;

  const player = await env.DB.prepare(
    `SELECT player_id FROM players WHERE device_uuid = ?1 LIMIT 1`
  )
    .bind(deviceUuid)
    .first();

  const playerId = clampNonNegativeInt(player?.player_id);
  if (playerId <= 0) {
    logInfo("worker.player.delete_noop", {
      path: new URL(request.url).pathname
    });
    return json({ ok: true, deleted: false }, undefined, request, env);
  }

  await env.DB.prepare(`DELETE FROM leaderboard_best WHERE player_id = ?1`).bind(playerId).run();
  await env.DB.prepare(`DELETE FROM score_submissions WHERE player_id = ?1`).bind(playerId).run();
  await env.DB.prepare(`DELETE FROM players WHERE player_id = ?1`).bind(playerId).run();

  logInfo("worker.player.deleted", {
    path: new URL(request.url).pathname
  });

  return json({ ok: true, deleted: true }, undefined, request, env);
}

export async function handlePostScore(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Invalid JSON", request, env);

  const deviceUuidCheck = validateIdentifier(
    body.device_uuid,
    DEVICE_UUID_MAX_LEN,
    "Missing device_uuid",
    "Invalid device_uuid"
  );
  if (!deviceUuidCheck.ok) return badRequest(deviceUuidCheck.reason, request, env);
  const deviceUuid = deviceUuidCheck.value;

  const runIdCheck = validateIdentifier(
    body.run_id,
    RUN_ID_MAX_LEN,
    "Missing run_id",
    "Invalid run_id"
  );
  if (!runIdCheck.ok) return badRequest(runIdCheck.reason, request, env);
  const runId = runIdCheck.value;
  const runMode = String(body.run_mode || "").trim().toUpperCase();
  const runNumber = clampNonNegativeInt(body.run_number);
  const contentVersion = String(body.content_version || "").trim();
  const durationMs = clampNonNegativeInt(body.duration_ms);
  const rawAnswers = Array.isArray(body.answers) ? body.answers : null;

  if (runMode !== "RUN") return badRequest("Only RUN is accepted", request, env);
  if (runNumber <= 0) return badRequest("Missing or invalid run_number", request, env);
  if (!contentVersion) return badRequest("Missing content_version", request, env);
  if (!rawAnswers) return badRequest("Missing answers", request, env);
  const rateLimit = enforceWriteRateLimits(request, env, {
    scope: "score-write",
    ip: RATE_LIMIT_RULES.scoreWriteIp,
    device: RATE_LIMIT_RULES.scoreWriteDevice,
    deviceUuid
  });
  if (rateLimit) return rateLimit;
  if (contentVersion !== LEADERBOARD_CONTENT_VERSION) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: "CONTENT_VERSION_MISMATCH"
    });
    return json(
      {
        ok: false,
        accepted: false,
        reject_reason: "CONTENT_VERSION_MISMATCH"
      },
      { status: 409 },
      request,
      env
    );
  }

  if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: "INVALID_DURATION_MS"
    });
    return json(
      {
        ok: false,
        accepted: false,
        reject_reason: "INVALID_DURATION_MS"
      },
      { status: 422 },
      request,
      env
    );
  }

  const player = await env.DB.prepare(
    `SELECT player_id, opt_in FROM players WHERE device_uuid = ?1 LIMIT 1`
  )
    .bind(deviceUuid)
    .first();

  if (!player || clampNonNegativeInt(player.player_id) <= 0) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: "UNKNOWN_PLAYER"
    });
    return badRequest("Unknown player", request, env);
  }

  if (player.opt_in !== 1) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: "PLAYER_NOT_OPTED_IN"
    });
    return badRequest("Player is not opted in", request, env);
  }

  const playerId = clampNonNegativeInt(player.player_id);
  const weekKey = getUtcWeekKey(now());

  const existingSubmission = await env.DB.prepare(
    `
      SELECT submission_id, score_fp, accepted, reject_reason
      FROM score_submissions
      WHERE run_id = ?1
      LIMIT ?2
    `
  )
    .bind(runId, 1)
    .first();

  if (existingSubmission) {
    const accepted = clampNonNegativeInt(existingSubmission.accepted) === 1;
    if (!accepted) {
      logWarn("worker.score.duplicate_rejected", {
        path: new URL(request.url).pathname,
        reason: String(existingSubmission.reject_reason || "REJECTED")
      });
      return json(
        {
          ok: false,
          accepted: false,
          reject_reason: String(existingSubmission.reject_reason || "REJECTED")
        },
        { status: 409 },
        request,
        env
      );
    }

    const weeklyRank = await getPlayerRank(env.DB, playerId, "weekly", weekKey);
    const allTimeRank = await getPlayerRank(env.DB, playerId, "all", "all");
    logInfo("worker.score.duplicate_accepted", {
      path: new URL(request.url).pathname,
      score_fp_server: clampNonNegativeInt(existingSubmission.score_fp)
    });
    return json({
      ok: true,
      accepted: true,
      score_fp_server: clampNonNegativeInt(existingSubmission.score_fp),
      weekly_rank: weeklyRank,
      all_time_rank: allTimeRank,
      duplicate: true
    }, undefined, request, env);
  }

  const validated = validateSubmittedAnswers(rawAnswers, ANSWER_KEY);
  if (validated.ok !== true) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: String(validated.rejectReason || "INVALID_ANSWERS")
    });
    return json(
      {
        ok: false,
        accepted: false,
        reject_reason: String(validated.rejectReason || "INVALID_ANSWERS")
      },
      { status: 422 },
      request,
      env
    );
  }

  const answers = validated.answers;
  const scoreFpServer = clampNonNegativeInt(computeServerScore(answers, ANSWER_KEY));
  const plausibilityRejectReason = getPlausibilityRejectReason(
    answers,
    durationMs,
    scoreFpServer
  );
  if (plausibilityRejectReason) {
    logWarn("worker.score.rejected", {
      path: new URL(request.url).pathname,
      reason: plausibilityRejectReason
    });
    return json(
      {
        ok: false,
        accepted: false,
        reject_reason: plausibilityRejectReason
      },
      { status: 422 },
      request,
      env
    );
  }
  const ts = now();

  const insertResult = await env.DB.prepare(
    `
      INSERT INTO score_submissions (
        player_id,
        run_id,
        run_number,
        content_version,
        run_mode,
        duration_ms,
        week_key,
        score_fp,
        answers_json,
        accepted,
        reject_reason,
        created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, "", ?10)
    `
  )
    .bind(
      playerId,
      runId,
      runNumber,
      contentVersion,
      runMode,
      durationMs,
      weekKey,
      scoreFpServer,
      JSON.stringify(answers),
      ts
    )
    .run();

  const submissionId = clampNonNegativeInt(insertResult?.meta?.last_row_id);
  if (submissionId <= 0) {
    logError("worker.score.insert_failed", {
      path: new URL(request.url).pathname
    });
    return json(
      {
        ok: false,
        accepted: false,
        reject_reason: "SUBMISSION_INSERT_FAILED"
      },
      { status: 500 },
      request,
      env
    );
  }

  await upsertBestScore(env.DB, {
    playerId,
    submissionId,
    scoreFp: scoreFpServer,
    updatedAt: ts,
    windowType: "weekly",
    weekKey
  });

  await upsertBestScore(env.DB, {
    playerId,
    submissionId,
    scoreFp: scoreFpServer,
    updatedAt: ts,
    windowType: "all",
    weekKey: "all"
  });

  const weeklyRank = await getPlayerRank(env.DB, playerId, "weekly", weekKey);
  const allTimeRank = await getPlayerRank(env.DB, playerId, "all", "all");

  logInfo("worker.score.accepted", {
    path: new URL(request.url).pathname,
    answers_count: Array.isArray(answers) ? answers.length : 0,
    duration_ms: durationMs,
    score_fp_server: scoreFpServer,
    weekly_rank: weeklyRank,
    all_time_rank: allTimeRank
  });

  return json({
    ok: true,
    accepted: true,
    score_fp_server: scoreFpServer,
    weekly_rank: weeklyRank,
    all_time_rank: allTimeRank
  }, undefined, request, env);
}

export async function upsertBestScore(db, params) {
  const playerId = clampNonNegativeInt(params?.playerId);
  const submissionId = clampNonNegativeInt(params?.submissionId);
  const scoreFp = clampNonNegativeInt(params?.scoreFp);
  const updatedAt = clampNonNegativeInt(params?.updatedAt);
  const windowType = normalizeWindow(params?.windowType === "all" ? "all" : params?.windowType);
  const weekKey = String(params?.weekKey || "").trim();

  if (playerId <= 0 || submissionId <= 0 || !windowType || !weekKey) return;

  const existing = await db.prepare(
    `
      SELECT best_score_fp
      FROM leaderboard_best
      WHERE player_id = ?1 AND window_type = ?2 AND week_key = ?3
      LIMIT 1
    `
  )
    .bind(playerId, windowType, weekKey)
    .first();

  const existingBest = clampNonNegativeInt(existing?.best_score_fp);
  if (!existing) {
    await db.prepare(
      `
        INSERT INTO leaderboard_best (
          player_id,
          window_type,
          week_key,
          best_score_fp,
          best_submission_id,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `
    )
      .bind(playerId, windowType, weekKey, scoreFp, submissionId, updatedAt)
      .run();
    return;
  }

  if (scoreFp <= existingBest) return;

  await db.prepare(
    `
      UPDATE leaderboard_best
      SET best_score_fp = ?4,
          best_submission_id = ?5,
          updated_at = ?6
      WHERE player_id = ?1 AND window_type = ?2 AND week_key = ?3
    `
  )
    .bind(playerId, windowType, weekKey, scoreFp, submissionId, updatedAt)
    .run();
}

export async function getPlayerRank(db, playerId, windowType, weekKey) {
  const safePlayerId = clampNonNegativeInt(playerId);
  const safeWindow = normalizeWindow(windowType);
  const safeWeekKey = String(weekKey || "").trim();
  if (safePlayerId <= 0 || !safeWindow || !safeWeekKey) return null;

  const playerRow = await db.prepare(
    `
      SELECT best_score_fp, updated_at
      FROM leaderboard_best
      WHERE player_id = ?1 AND window_type = ?2 AND week_key = ?3
      LIMIT 1
    `
  )
    .bind(safePlayerId, safeWindow, safeWeekKey)
    .first();

  if (!playerRow) return null;

  const betterRows = await db.prepare(
    `
      SELECT COUNT(*) AS count_rows
      FROM leaderboard_best
      WHERE window_type = ?1
        AND week_key = ?2
        AND (
          best_score_fp > ?3
          OR (
            best_score_fp = ?3
            AND (
              updated_at < ?4
              OR (updated_at = ?4 AND player_id < ?5)
            )
          )
        )
    `
  )
    .bind(
      safeWindow,
      safeWeekKey,
      clampNonNegativeInt(playerRow.best_score_fp),
      clampNonNegativeInt(playerRow.updated_at),
      safePlayerId
    )
    .first();

  return clampNonNegativeInt(betterRows?.count_rows) + 1;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        const originCheck = ensureAllowedOrigin(request, env);
        if (originCheck) return originCheck;
        return noContent(request, env);
      }

      if (request.method !== "GET") {
        const originCheck = ensureAllowedOrigin(request, env);
        if (originCheck) return originCheck;
      }

      if (request.method === "GET" && url.pathname === "/leaderboard") {
        return handleGetLeaderboard(request, env);
      }

      if (request.method === "POST" && url.pathname === "/player") {
        return handlePostPlayer(request, env);
      }

      if (request.method === "POST" && url.pathname === "/score") {
        return handlePostScore(request, env);
      }

      if (request.method === "DELETE" && url.pathname === "/player") {
        return handleDeletePlayer(request, env);
      }

      if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
        return methodNotAllowed(request, env);
      }

      return json({
        ok: true,
        service: "bf-leaderboard-worker",
        routes: ["GET /leaderboard", "POST /player", "DELETE /player", "POST /score"]
      }, undefined, request, env);
    } catch (error) {
      logError("worker.request_failed", {
        path: url.pathname,
        method: request.method,
        message: String(error?.message || error || "unknown_error")
      });
      return json(
        { ok: false, error: "Internal error" },
        { status: 500 },
        request,
        env
      );
    }
  }
};
