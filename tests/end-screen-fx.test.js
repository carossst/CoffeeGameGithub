"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

function loadEndFx() {
  const windowLike = createWindowLike({});
  loadBrowserScript("end-fx.js", { window: windowLike });
  return windowLike.WT_EndFx;
}

describe("end screen result tier", () => {
  const fx = loadEndFx();

  it("is perfect only when every answer of a real run is right", () => {
    expect(fx.tier(10, 10, 14)).toBe("perfect");
    expect(fx.tier(4, 4, 4)).not.toBe("perfect");
    expect(fx.tier(9, 10, 9)).toBe("good");
  });

  it("is good with a solid ratio or a score of 3+, keep otherwise", () => {
    expect(fx.tier(3, 5, 3)).toBe("good");
    expect(fx.tier(2, 3, 2)).toBe("good");
    expect(fx.tier(1, 5, 1)).toBe("keep");
    expect(fx.tier(0, 0, 0)).toBe("keep");
  });

  it("ignores garbage input", () => {
    expect(fx.tier(undefined, null, "x")).toBe("keep");
  });

  it("celebrates a Rapid Fire record (3+) or a solid score (5+), nothing below", () => {
    expect(fx.bonusTier(3, true)).toBe("record");
    expect(fx.bonusTier(2, true)).toBe("");
    expect(fx.bonusTier(5, false)).toBe("good");
    expect(fx.bonusTier(4, false)).toBe("");
    expect(fx.bonusTier(undefined, undefined)).toBe("");
  });

  it("celebrates practice only when every mistake is cleared", () => {
    expect(fx.practiceTier(true)).toBe("perfect");
    expect(fx.practiceTier(false)).toBe("");
    expect(fx.practiceTier(undefined)).toBe("");
  });
});

describe("score card", () => {
  function loadCard() {
    const windowLike = createWindowLike({});
    loadBrowserScript("score-card.js", { window: windowLike });
    return windowLike.WT_ScoreCard;
  }

  function recordingCtx() {
    const texts = [];
    const ctx = new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === "texts") return texts;
          if (prop === "fillText") return (t) => texts.push(String(t));
          return target[prop] || (() => {});
        },
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      }
    );
    return ctx;
  }

  it("draws the score, the answer count and the site address", () => {
    const card = loadCard();
    const ctx = recordingCtx();
    card.draw(ctx, { score: 14, correct: 9, total: 10 });
    expect(ctx.texts).toContain("14");
    expect(ctx.texts).toContain("9/10 correct answers");
    expect(ctx.texts).toContain("breworfalse.com");
  });

  it("skips the answer count when it is inconsistent", () => {
    const card = loadCard();
    const ctx = recordingCtx();
    card.draw(ctx, { score: 5, correct: 12, total: 10 });
    expect(ctx.texts.some((t) => t.includes("correct answers"))).toBe(false);
  });

  it("names the file after the score", () => {
    const card = loadCard();
    expect(card.fileName(14)).toBe("brew-or-false-score-14.png");
    expect(card.fileName(-3)).toBe("brew-or-false-score-0.png");
  });
});
