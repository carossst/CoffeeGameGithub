# Tracking links (wt-source)

Every link you publish should carry `?wt-source=<tag>`. The game reads it on arrival and attaches it to each funnel event, so GoatCounter shows where players come from and how far they go.

## Convention

- Format: `https://breworfalse.com/?wt-source=<channel>` or `<channel>-<campaign>`.
- Lowercase letters, digits and hyphens only (anything else becomes a hyphen). Max 48 characters.
- `utm_source` is also understood, but `wt-source` wins when both are present.
- No `wt-source` = `direct`.

## Ready-made links

| Where you post it | Link |
| --- | --- |
| Kit emails (welcome, newsletter) | `https://breworfalse.com/?wt-source=newsletter` |
| Instagram bio | `https://breworfalse.com/?wt-source=instagram-bio` |
| Instagram story or post | `https://breworfalse.com/?wt-source=instagram-post` |
| Facebook | `https://breworfalse.com/?wt-source=facebook` |
| Reddit | `https://breworfalse.com/?wt-source=reddit` |
| X / Twitter | `https://breworfalse.com/?wt-source=x` |
| LinkedIn | `https://breworfalse.com/?wt-source=linkedin` |
| Pinterest | `https://breworfalse.com/?wt-source=pinterest` |
| TikTok bio | `https://breworfalse.com/?wt-source=tiktok` |
| YouTube description | `https://breworfalse.com/?wt-source=youtube` |
| Press / blogger | `https://breworfalse.com/?wt-source=press` |
| A partner or a venue | `https://breworfalse.com/?wt-source=partner-<name>` |
| A printed QR code | `https://breworfalse.com/?wt-source=qr-<place>` |

Set automatically by the app (do not reuse by hand):

- `seo-<slug>`: the play button on each `/answers/<slug>/` page.
- `share-copy`, `share-native`, `share-email`: links inside challenge texts sent from the end screen. They tell you which sharing action the sender used, not which app the friend opened it in.

## Reading it in GoatCounter

Funnel events are paths like `/event/brew-or-false/run-complete/src-newsletter`. Filter on `src-newsletter` (or any tag) to see that channel's `landing_view`, `run_start`, `run_complete`, `paywall_view`, `checkout_start` and `unlock_success`. Compare channels on conversion, not only on visits.

## Adding a new channel

Just pick a new tag and use it. Nothing to deploy. Keep one tag per place so the numbers stay comparable, and add the tag to the table above.
