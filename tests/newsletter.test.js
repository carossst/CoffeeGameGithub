"use strict";

const {
  createWindowLike,
  loadBrowserScript
} = require("./helpers/browser-loader");

const ACTION = "https://app.kit.com/forms/123456/subscriptions";

function load(fetchImpl) {
  const windowLike = createWindowLike({});
  windowLike.fetch = fetchImpl;
  loadBrowserScript("newsletter.js", { window: windowLike, fetch: fetchImpl });
  return windowLike.WT_Newsletter;
}

const cfg = (en) => ({ newsletter: { formAction: { en } } });

describe("newsletter signup", () => {
  it("is off (fail-closed) until a Kit form action is configured", () => {
    const NL = load(async () => ({}));
    expect(NL.isConfigured(cfg(""))).toBe(false);
    expect(NL.shouldOffer(cfg(""))).toBe(false);
    expect(NL.isConfigured({})).toBe(false);
  });

  it("accepts only a Kit subscriptions URL", () => {
    const NL = load(async () => ({}));
    expect(NL.isConfigured(cfg(ACTION))).toBe(true);
    expect(
      NL.isConfigured(cfg("http://app.kit.com/forms/1/subscriptions"))
    ).toBe(false);
    expect(
      NL.isConfigured(cfg("https://evil.example/forms/1/subscriptions"))
    ).toBe(false);
  });

  it("validates the email", () => {
    const NL = load(async () => ({}));
    expect(NL.validate({ email: "a@b.co" }).ok).toBe(true);
    expect(NL.validate({ email: "nope" }).ok).toBe(false);
    expect(NL.validate({ email: "a@b" }).ok).toBe(false);
  });

  it("posts the Kit fields once and remembers the signup", async () => {
    const calls = [];
    const NL = load(async (url, opts) => {
      calls.push({ url, body: String(opts.body) });
      return {};
    });
    const result = await NL.submit(cfg(ACTION), {
      email: "a@b.co",
      firstName: "Ana"
    });
    expect(result).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ACTION);
    expect(calls[0].body).toContain("email_address=a%40b.co");
    expect(calls[0].body).toContain("fields%5Bfirst_name%5D=Ana");
    expect(NL.state()).toBe("sent");
    expect(NL.shouldOffer(cfg(ACTION))).toBe(false);
  });

  it("does not post for an invalid email, a bot or a missing form", async () => {
    const calls = [];
    const NL = load(async () => {
      calls.push(1);
      return {};
    });
    expect(await NL.submit(cfg(ACTION), { email: "bad" })).toBe("invalid");
    expect(
      await NL.submit(cfg(ACTION), { email: "a@b.co", website: "x" })
    ).toBe("sent");
    expect(await NL.submit(cfg(""), { email: "a@b.co" })).toBe("off");
    expect(calls).toHaveLength(0);
  });

  it("reports a network failure without remembering it", async () => {
    const NL = load(async () => {
      throw new Error("offline");
    });
    expect(await NL.submit(cfg(ACTION), { email: "a@b.co" })).toBe(
      "unavailable"
    );
    expect(NL.state()).toBe("");
  });
});
