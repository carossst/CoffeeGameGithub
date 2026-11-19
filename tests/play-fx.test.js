"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

function loadPlayFx() {
  const windowLike = createWindowLike({});
  loadBrowserScript("play-fx.js", { window: windowLike });
  return windowLike.WT_PlayFx;
}

describe("in-game feedback flourishes", () => {
  const fx = loadPlayFx();

  it("shows the streak banner only at the agreed milestones", () => {
    [3, 5, 8, 12, 20].forEach((n) => expect(fx.streakMilestone(n)).toBe(true));
    [0, 1, 2, 4, 6, 7, 9, 13, 21].forEach((n) =>
      expect(fx.streakMilestone(n)).toBe(false)
    );
  });

  it("accepts a note without throwing", () => {
    expect(() => fx.note({ correct: true, streak: 3 })).not.toThrow();
    expect(() => fx.note()).not.toThrow();
  });
});
