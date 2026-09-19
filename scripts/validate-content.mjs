import fs from "node:fs";

const raw = fs.readFileSync(new URL("../content.json", import.meta.url), "utf8");
const content = JSON.parse(raw);
const items = Array.isArray(content.items) ? content.items : null;
const expectedSize = 200;
const difficulties = new Set(["Easy", "Medium", "Hard"]);

function fail(message) {
  throw new Error(`content.json: ${message}`);
}

if (!items) fail("items must be an array");
if (items.length !== expectedSize) fail(`expected ${expectedSize} items, got ${items.length}`);
if (Number(content.totalItems) !== items.length) {
  fail(`totalItems says ${content.totalItems}, actual count is ${items.length}`);
}

const seen = new Set();
let trueItems = 0;
let falseItems = 0;

for (const [index, item] of items.entries()) {
  if (!item || typeof item !== "object") fail(`item ${index + 1} is not an object`);

  const id = Number(item.id);
  if (!Number.isInteger(id) || id < 1 || id > expectedSize) {
    fail(`invalid id at index ${index}: ${item.id}`);
  }
  if (seen.has(id)) fail(`duplicate id ${id}`);
  seen.add(id);

  if (typeof item.termEn !== "string" || !item.termEn.trim()) {
    fail(`question ${id} has an empty termEn`);
  }
  if (item.correctAnswer !== true && item.correctAnswer !== false) {
    fail(`question ${id} has a non-boolean correctAnswer`);
  }
  if (typeof item.explanationShort !== "string" || !item.explanationShort.trim()) {
    fail(`question ${id} has an empty explanationShort`);
  }

  const tags = Array.isArray(item.tags) ? item.tags : [];
  const difficultyCount = tags.filter((tag) => difficulties.has(String(tag))).length;
  if (difficultyCount !== 1) {
    fail(`question ${id} must have exactly one difficulty tag`);
  }

  if (item.correctAnswer) trueItems += 1;
  else falseItems += 1;
}

for (let id = 1; id <= expectedSize; id += 1) {
  if (!seen.has(id)) fail(`missing id ${id}`);
}

if (Number(content?.breakdown?.trueItems) !== trueItems) {
  fail(`trueItems says ${content?.breakdown?.trueItems}, actual count is ${trueItems}`);
}
if (Number(content?.breakdown?.falseItems) !== falseItems) {
  fail(`falseItems says ${content?.breakdown?.falseItems}, actual count is ${falseItems}`);
}

console.log(
  `content.json OK: ${items.length} questions, ${trueItems} TRUE, ${falseItems} FALSE`
);
