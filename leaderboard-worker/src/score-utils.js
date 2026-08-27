function clampNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function buildAnswerKey(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) return map;
  for (const row of entries) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const id = clampNonNegativeInt(row[0]);
    if (id <= 0) continue;
    map.set(id, row[1] === true);
  }
  return map;
}

export function validateSubmittedAnswers(rawAnswers, answerKey) {
  if (!Array.isArray(rawAnswers)) {
    return { ok: false, rejectReason: "INVALID_ANSWERS" };
  }

  if (rawAnswers.length <= 0) {
    return { ok: false, rejectReason: "EMPTY_ANSWERS" };
  }

  if (rawAnswers.length > 5000) {
    return { ok: false, rejectReason: "TOO_MANY_ANSWERS" };
  }

  const normalized = [];
  const seenIds = new Set();
  for (const row of rawAnswers) {
    if (!row || typeof row !== "object") {
      return { ok: false, rejectReason: "INVALID_ANSWER_ROW" };
    }

    const id = clampNonNegativeInt(row.id);
    if (id <= 0 || !answerKey.has(id)) {
      return { ok: false, rejectReason: "UNKNOWN_ITEM_ID" };
    }
    if (seenIds.has(id)) {
      return { ok: false, rejectReason: "DUPLICATE_ITEM_ID" };
    }
    seenIds.add(id);

    if (row.answer !== true && row.answer !== false) {
      return { ok: false, rejectReason: "INVALID_ANSWER_VALUE" };
    }

    const ms = clampNonNegativeInt(row.ms);
    if (ms > 10 * 60 * 1000) {
      return { ok: false, rejectReason: "INVALID_ANSWER_MS" };
    }

    normalized.push({
      id,
      answer: row.answer === true,
      ms
    });
  }

  return { ok: true, answers: normalized };
}

export function computeServerScore(answers, answerKey) {
  if (!Array.isArray(answers) || !(answerKey instanceof Map)) return 0;

  let score = 0;
  for (const row of answers) {
    const correctAnswer = answerKey.get(clampNonNegativeInt(row?.id));
    if (row?.answer === correctAnswer) {
      score += 1;
    }
  }
  return score;
}
