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

const DEVICE_UUID_MAX_LEN = 128;
const CODE_MAX_LEN = 128;
const GUEST_CODE_MAX_USES = 10;
const RATE_LIMIT_MEMORY = new Map();

const RATE_LIMIT_RULES = Object.freeze({
  redeemWriteIp: { windowMs: 10 * 60 * 1000, maxHits: 10 },
  redeemWriteDevice: { windowMs: 10 * 60 * 1000, maxHits: 5 }
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
    "access-control-allow-methods": "POST, OPTIONS",
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
        Math.ceil(((bucket + 1) * windowMs - ts) / 1000)
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
        "retry-after": String(
          Math.max(1, clampNonNegativeInt(retryAfterSec) || 1)
        )
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
      return tooManyRequests(
        "Too many requests",
        ipCheck.retryAfterSec,
        request,
        env,
        {
          scope: rules.scope,
          subject: "ip"
        }
      );
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
      return tooManyRequests(
        "Too many requests",
        deviceCheck.retryAfterSec,
        request,
        env,
        {
          scope: rules.scope,
          subject: "device"
        }
      );
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

export function resetRateLimitMemoryForTests() {
  RATE_LIMIT_MEMORY.clear();
}

function ensureAllowedOrigin(request, env) {
  const origin = String(request?.headers?.get("origin") || "").trim();
  if (!origin) return null;
  if (getAllowedOrigins(env).includes(origin)) return null;
  return forbidden("Origin not allowed", request, env);
}

// Server-verified redemption for the ADMIN_CODE / GUEST_CODE secrets (set via
// `wrangler secret put`, never shipped to the client). This does NOT know
// about real customer purchase codes yet — those are still validated
// client-side by format only (tracked separately). A code that isn't one of
// these two secrets returns NOT_FOUND so the client can fall back to that
// existing path.
export async function handlePostRedeemCode(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return badRequest("Invalid JSON", request, env);

  const deviceUuidCheck = validateIdentifier(
    body.device_uuid,
    DEVICE_UUID_MAX_LEN,
    "Missing device_uuid",
    "Invalid device_uuid"
  );
  if (!deviceUuidCheck.ok)
    return badRequest(deviceUuidCheck.reason, request, env);
  const deviceUuid = deviceUuidCheck.value;

  const codeCheck = validateIdentifier(
    body.code,
    CODE_MAX_LEN,
    "Missing code",
    "Invalid code"
  );
  if (!codeCheck.ok) return badRequest(codeCheck.reason, request, env);
  const code = codeCheck.value;

  const rateLimit = enforceWriteRateLimits(request, env, {
    scope: "redeem-write",
    ip: RATE_LIMIT_RULES.redeemWriteIp,
    device: RATE_LIMIT_RULES.redeemWriteDevice,
    deviceUuid
  });
  if (rateLimit) return rateLimit;

  const adminCode = String(env?.ADMIN_CODE || "").trim();
  const guestCode = String(env?.GUEST_CODE || "").trim();
  const ts = now();

  if (adminCode && code === adminCode) {
    await env.DB.prepare(
      `INSERT INTO code_redemptions (code_tier, code_value, device_uuid, created_at) VALUES (?1, ?2, ?3, ?4)`
    )
      .bind("admin", code, deviceUuid, ts)
      .run();

    logInfo("worker.redeem.accepted", {
      path: new URL(request.url).pathname,
      tier: "admin"
    });
    return json({ ok: true, tier: "admin" }, undefined, request, env);
  }

  if (guestCode && code === guestCode) {
    // Atomic check-and-increment: the INSERT only executes its SELECT-guarded
    // row when fewer than GUEST_CODE_MAX_USES redemptions exist for this code
    // at the moment this single statement runs, so two concurrent requests
    // can't both read "9 used" and both insert, exceeding the cap (D1/SQLite
    // executes one statement at a time, so this can't interleave the way a
    // separate SELECT-then-INSERT could).
    const insertResult = await env.DB.prepare(
      `INSERT INTO code_redemptions (code_tier, code_value, device_uuid, created_at)
       SELECT ?1, ?2, ?3, ?4
       WHERE (SELECT COUNT(*) FROM code_redemptions WHERE code_tier = ?1 AND code_value = ?2) < ?5`
    )
      .bind("guest", code, deviceUuid, ts, GUEST_CODE_MAX_USES)
      .run();
    const inserted = clampNonNegativeInt(insertResult?.meta?.changes) > 0;

    if (!inserted) {
      logWarn("worker.redeem.rejected", {
        path: new URL(request.url).pathname,
        reason: "GUEST_CODE_EXHAUSTED"
      });
      return json(
        { ok: false, reason: "GUEST_CODE_EXHAUSTED" },
        { status: 403 },
        request,
        env
      );
    }

    const usedRow = await env.DB.prepare(
      `SELECT COUNT(*) AS use_count FROM code_redemptions WHERE code_tier = 'guest' AND code_value = ?1`
    )
      .bind(code)
      .first();
    // Includes the row just inserted above.
    const useCount = clampNonNegativeInt(usedRow?.use_count);
    const usesRemaining = Math.max(0, GUEST_CODE_MAX_USES - useCount);

    logInfo("worker.redeem.accepted", {
      path: new URL(request.url).pathname,
      tier: "guest",
      uses_remaining: usesRemaining
    });
    return json(
      {
        ok: true,
        tier: "guest",
        uses_remaining: usesRemaining
      },
      undefined,
      request,
      env
    );
  }

  logInfo("worker.redeem.not_found", { path: new URL(request.url).pathname });
  return json(
    { ok: false, reason: "NOT_FOUND" },
    { status: 404 },
    request,
    env
  );
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

      const originCheck = ensureAllowedOrigin(request, env);
      if (originCheck) return originCheck;

      if (request.method === "POST" && url.pathname === "/redeem-code") {
        return handlePostRedeemCode(request, env);
      }

      if (request.method !== "POST") {
        return methodNotAllowed(request, env);
      }

      return json(
        {
          ok: true,
          service: "bf-redeem-worker",
          routes: ["POST /redeem-code"]
        },
        undefined,
        request,
        env
      );
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
