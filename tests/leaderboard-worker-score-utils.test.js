"use strict";

let scoreUtils;
let contentKey;
let key;

beforeAll(async () => {
  scoreUtils = await import("../leaderboard-worker/src/score-utils.js");
  contentKey = await import("../leaderboard-worker/src/content-key.js");
  key = scoreUtils.buildAnswerKey(contentKey.ANSWER_KEY_ENTRIES);
});

test("worker answer key builds one entry per content item", () => {
  expect(key.size).toBe(contentKey.ANSWER_KEY_ENTRIES.length);
  for (const [id, truth] of contentKey.ANSWER_KEY_ENTRIES) {
    expect(key.get(id)).toBe(truth === true);
  }
});

test("worker answer validation rejects unknown ids fail-closed", () => {
  const res = scoreUtils.validateSubmittedAnswers(
    [{ id: 999999, answer: true, ms: 1200 }],
    key
  );
  expect(res).toEqual({
    ok: false,
    rejectReason: "UNKNOWN_ITEM_ID"
  });
});

test("worker answer validation normalizes valid rows and floors ms", () => {
  const [idA, truthA] = contentKey.ANSWER_KEY_ENTRIES[0];
  const [idB, truthB] = contentKey.ANSWER_KEY_ENTRIES[1];
  const res = scoreUtils.validateSubmittedAnswers(
    [
      { id: idA, answer: truthA, ms: 1200.9 },
      { id: idB, answer: !truthB, ms: 0 }
    ],
    key
  );
  expect(res).toEqual({
    ok: true,
    answers: [
      { id: idA, answer: truthA === true, ms: 1200 },
      { id: idB, answer: !truthB === true, ms: 0 }
    ]
  });
});

test("worker score is recomputed from answer truth, not client score", () => {
  const sample = contentKey.ANSWER_KEY_ENTRIES.slice(0, 4);
  // Answer the first two correctly, the last two incorrectly.
  const answers = sample.map(([id, truth], idx) => ({
    id,
    answer: idx < 2 ? truth === true : !truth,
    ms: 10
  }));
  expect(scoreUtils.computeServerScore(answers, key)).toBe(2);
});
