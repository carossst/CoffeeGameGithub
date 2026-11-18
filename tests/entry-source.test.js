"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

function entrySource(search) {
  const windowLike = createWindowLike({});
  windowLike.location = {
    hostname: "breworfalse.com",
    pathname: "/",
    search,
    href: `https://breworfalse.com/${search}`
  };
  loadBrowserScript("config.js", { window: windowLike });
  loadBrowserScript("analytics.js", { window: windowLike });
  return windowLike.WT_Analytics.getEntrySource();
}

describe("entry source (wt-source)", () => {
  it("reads wt-source, then utm_source, then falls back to direct", () => {
    expect(entrySource("?wt-source=newsletter")).toBe("newsletter");
    expect(entrySource("?utm_source=Reddit")).toBe("reddit");
    expect(entrySource("?wt-source=newsletter&utm_source=reddit")).toBe(
      "newsletter"
    );
    expect(entrySource("")).toBe("direct");
  });

  it("normalises channel and campaign tags to lowercase slugs", () => {
    expect(entrySource("?wt-source=share-copy")).toBe("share-copy");
    expect(entrySource("?wt-source=Instagram_Bio")).toBe("instagram-bio");
    expect(entrySource("?wt-source=seo-does-decaf-coffee-have-caffeine")).toBe(
      "seo-does-decaf-coffee-have-caffeine"
    );
  });

  it("caps very long values at 48 characters", () => {
    expect(entrySource(`?wt-source=${"a".repeat(80)}`)).toHaveLength(48);
  });
});
