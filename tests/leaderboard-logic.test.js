"use strict";

const {
  compileNicknameRegex,
  mergeLocalPlayer,
  normalizeRows
} = require("../leaderboard-logic.js");

test("mergeLocalPlayer injects local player, de-dupes nickname, and sorts by score", () => {
  const rows = [
    { nickname: "B", scoreFP: 14 },
    { nickname: "Local", scoreFP: 9 },
    { nickname: "A", scoreFP: 14 }
  ];
  const local = { nickname: "Local", scoreFP: 18, isLocalPlayer: true };

  const merged = mergeLocalPlayer(rows, local, 5);

  expect(merged.map((row) => [row.nickname, row.scoreFP])).toEqual([
    ["Local", 18],
    ["A", 14],
    ["B", 14]
  ]);
});

test("compileNicknameRegex is fail-closed when config regex is invalid", () => {
  const invalid = compileNicknameRegex("[unterminated", "u");
  expect(invalid).toBe(false);
});

test("normalizeRows clamps and filters rows for leaderboard display", () => {
  const rows = normalizeRows(
    [
      { nickname: "Caro", score_fp: 18.9 },
      { nickname: " ", score_fp: 22 },
      { nickname: "Sam", score_fp: -7 },
      { nickname: "Lee", scoreFP: 10001 }
    ],
    10
  );

  expect(rows).toEqual([
    { nickname: "Caro", scoreFP: 18 },
    { nickname: "Sam", scoreFP: 0 },
    { nickname: "Lee", scoreFP: 9999 }
  ]);
});
