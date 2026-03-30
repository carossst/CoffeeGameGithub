# Brew or False

Static coffee quiz game and installable PWA.

`Brew or False` is a mobile-first true-or-false coffee game built with plain HTML, CSS, and JavaScript. It runs without a build step, stores progress locally, supports offline play after first load, and includes a paywall, practice mode, and `Rapid Fire Mode`.

## Product Summary

- `200` coffee questions from [content.json](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/content.json)
- Main game with `3` mistakes allowed
- `2` free games, then premium upsell
- `Mistakes Mode` to replay active mistakes
- `Rapid Fire Mode` for seen-question speed play
- Local-first progress and premium unlock
- Installable PWA with service worker caching

## Main Files

- [index.html](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/index.html): main app shell
- [config.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/config.js): single source of truth for product config, wording, routing, limits, and identity
- [content.json](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/content.json): question bank
- [ui.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/ui.js): rendering, screen routing, CTA logic, modals
- [game.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/game.js): game mechanics
- [storage.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/storage.js): local storage, counters, progression, analytics payload
- [main.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/main.js): bootstrap, content loading, service worker registration
- [style.css](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/style.css): full UI styling
- [sw.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/sw.js): service worker
- [manifest.json](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/manifest.json): PWA manifest
- [success.html](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/success.html): post-checkout success / unlock page

## Run Locally

This project is static. No bundler or dependency install is required.

Serve the folder with any local HTTP server, for example:

```bash
cd "/Users/carole/Documents/ApplicationsHTML/Coffee game/CoffeeGameGithub"
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Avoid opening `index.html` directly with `file://` if you want fetch, service worker, and PWA behavior to work normally.

## Content Editing

Questions live in [content.json](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/content.json).

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

Most product behavior lives in [config.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/config.js):

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

- the app registers a service worker from [main.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/main.js)
- static assets are versioned through `WT_CONFIG.version`
- if you want users to receive fresh cached assets, bump `WT_CONFIG.version`
- offline support is strongest for the main app shell after first load

## Storage And Analytics

All user progress is stored locally in the browser by [storage.js](/Users/carole/Documents/ApplicationsHTML/Coffee%20game/CoffeeGameGithub/storage.js).

This includes:

- seen questions
- active mistakes
- run counters
- premium unlock state
- local analytics counters
- anonymous stats payload generation

There is no required account system in the core game flow.

## Notes

- this repo has no build step
- this repo currently has no automated test suite
- syntax checks can be done with commands like:

```bash
node --check config.js
node --check ui.js
node --check storage.js
```
