# Action Plan

This file tracks the remaining work to align Coffee with the current Pickleball baseline.

## UX And Reliability

- port the hardened service-worker update flow so reload after an update is more reliable on phone
- if reload still feels flaky, add the same visible update-step debug used temporarily on Pickleball while testing on phone
- verify manually in Stripe that both Payment Links redirect to the hosted `success.html`
- port the checkout button pending state so tap feedback is immediate before Stripe opens
- document clearly that the early-price timer is local UX, not server-verified
- reconsider the early-price window length; Pickleball moved from 20 min to 15 min
- decide later whether the current static payment flow is acceptable as-is or whether a server-verified return / signed unlock is needed

## Paywall And Monetization

- port the fail-closed cleanup already done on Pickleball for END and paywall wording fallbacks
- verify the paywall wording stays specific to coffee, not generic quiz language
- make the paywall value bullets show range/depth, not only quantity:
  - add a clear difficulty-mix signal if it helps the app (`easy / intermediate / hard` or app-equivalent)
- keep the trust block visually as strong as `What you get`:
  - bold the key value words in one-time unlock bullets
- keep testimonials sounding like real people:
  - avoid vague labels like `club player`
  - keep short role labels only when they feel believable
- if social proof is kept, a light `★★★★★` treatment can be reused from Pickleball
- remove any empty END filler such as `No mistakes.` if it still renders

## HUD And End Screens

- keep score and mistakes visually grouped, especially on mobile
- keep score / mistake delta feedback visibly outside the pill when needed:
  - do not clip the `+1` or mistake gain indicator
- keep mobile labels more legible
- keep mistake dots clearly red
- if `Best` is shown during play, show it for everyone, not only premium
- if `Best` becomes too faint on mobile, raise its contrast slightly while keeping it secondary
- add a little more mobile breathing room on END:
  - more side padding
  - easier bottom scroll reach
- verify END tag wording stays thematic and product-facing, not technical
- port the cleaner END structures already validated on Pickleball where they improve readability
- remove best-streak style recap lines if they still show
- reduce END repetition by avoiding stacked identity + lens messages that say the same thing
- if the phase system can skip phase 2, explain the direct jump to phase 3 in END instead of leaving it implicit
- keep END body copy black for easier scan if muted styling still weakens readability
- keep the END header stable on mobile:
  - avoid ugly truncation or cramped buttons
  - allow a clean wrap when needed
  - keep enough space below the wrapped buttons before the score/content starts
- port the phase-based journey refactor:
  - one source of truth for `discovery / correction / consolidation`
  - landing summary + detail per phase
  - END lens per phase
  - micro-hints that evolve by phase instead of using one flat set
- make phase 1 wording less school-like if the hero is challenge-led:
  - prefer `first pass` / `left to see` style wording
  - avoid `discovery` / `still to discover` if that clashes with the app's top-of-page promise
- remove any remaining `runs left` style landing projection if it weakens the knowledge-first positioning
- rename landing progress to `rules seen` / equivalent thematic unit instead of generic `questions seen` where that reads better

## Visual System

- port the dark-mode verification and token rebalance done on Pickleball
- in dark mode, raise the contrast of a few subtle borders / boxes slightly for comfort, without making the UI look heavier
- port the small cleanup of remaining inline presentation styles on success/paywall screens, without adding class sprawl
- keep gameplay micro-hint overlays visually compact instead of modal-width when the copy is short
- port the overlay readability cleanup:
  - make the early run overlays distinct instead of repeating the same block 3 times
  - if there is no separate help entrypoint, explain `+1 / mistake / game ends after N mistakes` in the early overlays
  - bold mode title in start overlays
  - italic tap hint
  - italic citation/rulebook line in explanations
  - sentence-level line breaks in long modal bodies for mobile readability
  - shorter start overlays for practice / rapid modes
- loosen landing and END leading slightly where text blocks still feel too dense on mobile
- review landing mobile logo scale; Pickleball now uses a larger logo on small screens while keeping desktop unchanged

## Content And Editorial

- tighten explanation L2 lines so they answer the statement more directly when the current wording is too indirect
- avoid unexplained abbreviations in user-facing copy when a clearer expanded label is better
- review microcopy so normal-mode progression language stays about coffee knowledge, not generic speed/performance language
- keep faster / pressure language scoped to Rapid Fire only where it helps the mode positioning
