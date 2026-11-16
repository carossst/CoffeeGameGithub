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

test("worker score doubles points after four correct answers in a row", () => {
  const sample = contentKey.ANSWER_KEY_ENTRIES.slice(0, 8);
  const correct = (idx) => ({
    id: sample[idx][0],
    answer: sample[idx][1] === true,
    ms: 10
  });
  const wrong = (idx) => ({
    id: sample[idx][0],
    answer: sample[idx][1] !== true,
    ms: 10
  });

  // 4 correct (4 pts) + 2 correct at double (4 pts) = 8
  const run = [0, 1, 2, 3, 4, 5].map(correct);
  expect(scoreUtils.computeServerScore(run, key)).toBe(8);

  // A mistake resets the streak: 4 + 0 + 1 + 1 = 6
  const withMistake = [
    ...[0, 1, 2, 3].map(correct),
    wrong(4),
    correct(5),
    correct(6)
  ];
  expect(scoreUtils.computeServerScore(withMistake, key)).toBe(6);
});
