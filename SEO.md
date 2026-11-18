# SEO answer pages

One question = one page, at `/answers/<slug>/`. Source of truth: `seo-pages.json` (page content, sources, status) plus `content.json` (the quiz cards shown in "Test yourself").

## Rules

- **Never edit by hand:** `answers/**` and `sitemap.xml` are generated. Run `npm run generate:seo` after any change to `seo-pages.json`, `content.json` cards used by a page, or `scripts/seo-lib.mjs`. `npm run seo:check` and the test suite fail if the files are out of date.
- **Nothing invented:** every claim must come from a source listed in the page's `sources` (primary sources first: FDA, USDA FoodData Central, peer-reviewed papers, SCA, ICO, World Coffee Research; see `EDITORIAL_RULES.md`). Numbers that are calculated from a source must say so on the page.
- **Thin-content guard:** the generator refuses `ready`/`live` pages under `defaults.minWordCount` visible words (300) or with unknown card ids, missing sources, or fewer than one FAQ entry.
- **One intention per page.** Do not add a second page that answers the same question.

## Statuses

- `draft` — not generated.
- `ready` — generated and deployed, but `noindex` and **not** in the sitemap (review phase).
- `live` — reviewed and approved: indexable, in the sitemap, listed on the `/answers/` hub.

## Go-live checklist (per batch, after review)

1. Set `status` to `live` in `seo-pages.json`.
2. `npm run generate:seo` (also regenerates `answers/index.html` and `sitemap.xml`).
3. Link the hub from the site (footer or landing) in the same change, since the hub only exists once a page is live.
4. After deployment, submit the new URLs in Google Search Console.

## Measuring

Every page's play button links to `/?wt-source=seo-<slug>`, so GoatCounter shows the entry source as `src-seo-<slug>`.
