"use strict";

const fs = require("node:fs");
const path = require("node:path");

let contentKeyModule;

beforeAll(async () => {
  contentKeyModule = await import("../leaderboard-worker/src/content-key.js");
});

function readFrontendLeaderboardContentVersion() {
  const configPath = path.join(__dirname, "..", "config.js");
  const source = fs.readFileSync(configPath, "utf8");
  const match = source.match(/contentVersion:\s*"([^"]+)"/);
  if (!match || !match[1]) {
    throw new Error("Could not read leaderboard.contentVersion from config.js");
  }
  return String(match[1]).trim();
}

test("frontend leaderboard contentVersion matches worker content key version", () => {
  expect(readFrontendLeaderboardContentVersion()).toBe(
    contentKeyModule.LEADERBOARD_CONTENT_VERSION
  );
});

test("worker answer key matches content.json exactly", () => {
  const contentPath = path.join(__dirname, "..", "content.json");
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const expected = content.items
    .map((item) => [Number(item.id), item.correctAnswer === true])
    .sort((a, b) => a[0] - b[0]);
  const actual = [...contentKeyModule.ANSWER_KEY_ENTRIES].sort(
    (a, b) => a[0] - b[0]
  );

  expect(actual).toEqual(expected);
});
