import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const libUrl = new URL("../scripts/seo-lib.mjs", import.meta.url).href;

async function lib() {
  return import(libUrl);
}

describe("SEO answer pages", () => {
  it("seo-pages.json passes validation against content.json", async () => {
    const m = await lib();
    expect(m.validate(m.loadSeo(), m.loadContent())).toEqual([]);
  });

  it("generated files are up to date (run: npm run generate:seo)", async () => {
    const m = await lib();
    const outputs = m.buildOutputs(m.loadSeo(), m.loadContent());
    for (const [rel, text] of outputs) {
      const file = path.join(root, rel);
      expect(fs.existsSync(file), `${rel} missing`).toBe(true);
      expect(fs.readFileSync(file, "utf8"), `${rel} out of date`).toBe(text);
    }
    expect(m.staleDirs(outputs)).toEqual([]);
  });

  it("only live pages are in the sitemap; ready pages are noindex", async () => {
    const m = await lib();
    const seo = m.loadSeo();
    const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
    for (const p of seo.pages.filter((x) => x.status !== "draft")) {
      const html = fs.readFileSync(
        path.join(root, `answers/${p.slug}/index.html`),
        "utf8"
      );
      const inMap = sitemap.includes(`/answers/${p.slug}/`);
      if (p.status === "live") {
        expect(inMap).toBe(true);
        expect(html).not.toContain('name="robots"');
      } else {
        expect(inMap).toBe(false);
        expect(html).toContain('<meta name="robots" content="noindex">');
      }
    }
  });

  it("rejects thin pages and unknown cards", async () => {
    const m = await lib();
    const seo = m.loadSeo();
    const bad = structuredClone(seo);
    bad.pages[0].cardIds = [1, 2, 99999];
    bad.pages[0].sections = [{ h2: "x", paragraphs: ["too short"] }];
    const errors = m.validate(bad, m.loadContent()).join("\n");
    expect(errors).toContain("cardId 99999");
    expect(errors).toContain("visible words");
  });
});
