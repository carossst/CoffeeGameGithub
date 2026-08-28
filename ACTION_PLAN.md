# Action Plan

This file tracks only the Coffee work that still remains after the current alignment pass.

## Still To Do

### Reliability

- verify manually in Stripe that both Payment Links redirect to the hosted `success.html`
- document clearly that the early-price timer is local UX, not server-verified
- decide later whether the static unlock flow is acceptable as-is or whether a server-verified or signed return is needed

### UX QA

- run one more mobile QA pass on:
  - update toast -> refresh path on Android and iPhone
  - install prompt layout
  - END wrap behavior for long category names
  - CTA wrap and footer fit on smaller screens

### Content And Conversion

- do a final explanation pass where L2 still answers too indirectly
- re-check paywall/testimonials copy for naturalness after the latest UI changes
- decide whether the current early-price duration should stay as-is or be tightened further later
