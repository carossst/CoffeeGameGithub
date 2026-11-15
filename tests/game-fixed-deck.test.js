"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

function loadGame() {
  const windowLike = createWindowLike({});
  loadBrowserScript("config.js", { window: windowLike });
  loadBrowserScript("game.js", { window: windowLike });
  return windowLike;
}

function makeItems(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    statement: `Statement ${i + 1}`,
    correctAnswer: i % 2 === 0,
    explanation: "Because."
  }));
}

describe("shared challenge fixed deck", () => {
  it("serves exactly the shared cards in order, then ends the run", () => {
    const w = loadGame();
    const engine = new w.WT_Game.GameEngine();
    const statsByItem = {};
    const fixedIds = [7, 3, 7, 12, 999];

    let state = engine.start({
      items: makeItems(20),
      statsByItem,
      getStatsByItem: () => statsByItem,
      config: w.WT_CONFIG,
      mode: "RUN",
      fixedIds
    });

    const served = [];
    let guard = 0;
    while (state && !state.done && guard < 10) {
      guard += 1;
      const item = engine.getCurrent();
      served.push(Number(item.id));
      const res = engine.answer(item.correctAnswer);
      state = res.state;
    }

    // Duplicates and unknown ids are dropped; no reshuffle after the last card.
    expect(served).toEqual([7, 3, 12]);
    expect(state.done).toBe(true);
  });
});
