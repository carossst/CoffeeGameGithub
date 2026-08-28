# Brew or False

Static coffee quiz game and installable PWA.

`Brew or False` is a mobile-first true-or-false coffee game built with plain HTML, CSS, and JavaScript. It runs without a build step, stores progress locally, supports offline play after first load, and includes a paywall, practice mode, and `Rapid Fire Mode`.

## Product Summary

- `200` coffee questions from [content.json](./content.json)
- Main game with `3` mistakes allowed
- `2` free games, then premium upsell
- Curated opening for the first 2 free games (see `WT_CONFIG.curatedFreeRuns`)
- `Mistakes Mode` to replay active mistakes
- `Rapid Fire Mode` for seen-question speed play
- Public opt-in leaderboard (weekly + all-time), backed by a Cloudflare Worker
- Local-first progress and premium unlock
- Installable PWA with service worker caching

## Main Files

- [index.html](./index.html): main app shell
- [config.js](./config.js): single source of truth for product config, wording, routing, limits, identity, curated openings, leaderboard config
- [content.json](./content.json): question bank
- [ui.js](./ui.js): rendering, screen routing, CTA logic, modals
- [game.js](./game.js): game mechanics (deck build, curated openings, answer de-clustering)
- [storage.js](./storage.js): local storage, counters, progression, leaderboard profile, analytics payload
- [analytics.js](./analytics.js): GoatCounter funnel tracking (landing / run / paywall / checkout / success)
- [leaderboard-logic.js](./leaderboard-logic.js) + [leaderboard.js](./leaderboard.js): public leaderboard UI (landing card, ranking/profile modal, score submission)
- [main.js](./main.js): bootstrap, content loading, service worker registration
- [style.css](./style.css): full UI styling
- [sw.js](./sw.js): service worker
- [manifest.json](./manifest.json): PWA manifest
- [success.html](./success.html): post-checkout success / unlock page
- [leaderboard-worker/](./leaderboard-worker/): Cloudflare Worker + D1 for the public leaderboard (deployed)
- [redeem-worker/](./redeem-worker/): Cloudflare Worker + D1 for server-verified admin/guest premium codes (deployed)
- [tests/](./tests/): vitest suite (run with `npm test`; CI in `.github/workflows/test.yml`)

## Run Locally

This project is static. No bundler or dependency install is required.

Serve the folder with any local HTTP server, for example:

```bash
cd .
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Avoid opening `index.html` directly with `file://` if you want fetch, service worker, and PWA behavior to work normally.

## Content Editing

Questions live in [content.json](./content.json).

Each item uses this shape:

```json
{
  "id": 1,
  "termFr": "",
  "termEn": "Question text",
  "correctAnswer": true,
  "explanationShort": "Short explanation in 3 lines max.",
  "tags": ["Category", "Easy"]
}
```

Guidelines:

- keep statements clear and answerable as true/false
- avoid time-sensitive or shop-specific facts unless clearly framed
- keep `explanationShort` short, direct, and readable on mobile
- keep tags consistent with existing categories

## Product Configuration

Most product behavior lives in [config.js](./config.js):

- app identity and URLs
- limits and monetization
- wording and UI copy
- verdict thresholds
- mode routing and CTA promotion
- paywall messaging
- PWA versioning

Important values:

- `WT_CONFIG.version`: cache/version identifier used by the service worker
- `WT_CONFIG.storageSchemaVersion`: local storage schema version
- `WT_CONFIG.limits.freeRuns`: number of free main-game runs
- `WT_CONFIG.game.poolSize`: total question pool size

## End Screen Notes

- `RUN END` stays intentionally compact: score, verdict, progress lens, CTA, and recap when useful
- secondary `RUN END` signals are intentionally limited to learning/business context such as tag insight, premium best-score context, and free games left
- `best streak` is treated as an in-game momentum signal, not a core end-screen signal
- record celebration stays attached to the main score block instead of repeating again in secondary end copy

## PWA Notes

- the app registers a service worker from [main.js](./main.js)
- static assets are versioned through `WT_CONFIG.version`
- if you want users to receive fresh cached assets, bump `WT_CONFIG.version`
- offline support is strongest for the main app shell after first load

## Storage And Analytics

All user progress is stored locally in the browser by [storage.js](./storage.js):
seen questions, active mistakes, run counters, premium unlock state, leaderboard
profile (nickname + device uuid, opt-in), local counters, anonymous stats payload.

There is no required account system in the core game flow. The public leaderboard
is opt-in (the player picks a nickname) and can be left at any time.

Funnel analytics: [analytics.js](./analytics.js) sends a small set of events to
GoatCounter (`breworfalse.goatcounter.com`, no cookies): `landing_view`,
`run_start`, `run_complete`, `paywall_view`, `checkout_click`, `success_view`.
Event paths are namespaced (`/event/brew-or-false/...`).

## Backends

Two small Cloudflare Workers (each with its own D1 database), independent of the
static app and of each other:

- [leaderboard-worker/](./leaderboard-worker/): public leaderboard — recomputes
  each score server-side from its own answer key.
- [redeem-worker/](./redeem-worker/): server-verified `ADMIN_CODE` / `GUEST_CODE`.

If `content.json` answers change: bump `WT_CONFIG.leaderboard.contentVersion`,
regenerate `leaderboard-worker/src/content-key.js`, redeploy that Worker (a
contract test guards the alignment).

## Development

- no build step
- `npm install` then `npm test` runs the vitest suite; `npm run format:check`
  runs prettier. CI runs both on every push / PR (`.github/workflows/test.yml`).
- quick syntax checks: `node --check config.js ui.js storage.js game.js`
