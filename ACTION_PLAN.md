# Action Plan

This file tracks only the Brew or False work still open after the 19 September 2026 non-payment audit.

## Next

### Leaderboard deployment

- deploy `leaderboard-worker/src/content-key.js` v1.6 to the existing Cloudflare Worker
- verify one accepted RUN, one rejected wrong content version, and weekly/all-time rank responses
- only then set `WT_CONFIG.leaderboard.submitScores` back to `true`

### UX QA

- verify the update-toast refresh path on Android and iPhone
- verify install-prompt layout
- verify END wrapping with long category names
- verify CTA and footer fit on very small screens

### Content maintenance

- keep `content.json`, `WT_CONFIG.leaderboard.contentVersion`, and the leaderboard Worker answer key aligned
- run `npm run content:check` after every question edit
- source new or changed factual claims according to `EDITORIAL_RULES.md`

## Payment

Payment and post-checkout entitlement work is intentionally deferred until the items above are complete.
