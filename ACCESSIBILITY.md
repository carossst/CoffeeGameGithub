# Accessibility Notes

This file documents the current accessibility contract for Brew or False and the checks that should stay true as the UI evolves.

## Contrast

Critical combinations to verify after color or glass changes:

| Foreground | Background | Notes |
| --- | --- | --- |
| `--text-strong` | `--surface` | default body copy on cards |
| `--text` | `--surface` | secondary body copy |
| `--text-muted` | `--surface` | helper text and labels |
| `--text-muted` | `--surface-muted` | muted boxes and recaps |
| `--primary-dark` | `--surface` | primary emphasis text |
| `--danger-dark` | `rgb(var(--danger) / .12)` | alert text and warning surfaces |
| `--on-primary` | `--primary-dark` | primary button text |
| `--text-strong` | `--glass-72` | HUD pills and icon buttons |
| `--text-muted` | `--glass-72` | subdued HUD metadata |
| `--text-strong` | `--surface-muted` | secondary buttons and doc panels |
| `--primary-dark` | `rgb(var(--primary) / .10)` | subtle highlight states |
| `--danger` | `--surface` | last-life pulse and critical affordances |

Check these combinations in both default and dark mode, and re-check any component that uses alpha glass because the effective ratio changes with the backdrop.

Suggested tools:

- axe DevTools against the local PWA
- contrast-ratio.com for token pair spot checks

## Touch targets

- Minimum interactive target is `44x44`
- `wt-btn`, `wt-btn-icon`, and primary modal actions follow this rule
- Any exception must be documented before merge

## Motion

- `prefers-reduced-motion: reduce` disables decorative pulses, score bursts, teaser animations, and celebration effects
- Static information remains visible when motion is reduced. HUD deltas stop animating but are still shown
- New motion should use existing `--wt-anim-*` tokens and must include a reduced-motion fallback

## Keyboard

- Skip link lands on `#app`
- Main gameplay tab order is: answer choices, contextual actions, then home/help utilities
- Modals use the existing backdrop/dialog structure and must keep visible focus states

## Screen reader

- Score changes use a polite live region in the HUD
- Chance-lost and game-over overlays use assertive live announcements
- Answer feedback uses `aria-live="assertive"` in the dedicated hidden region
- Decorative icons should stay `aria-hidden` unless they carry standalone meaning

## Manual audit checklist

- Start a run and verify focus remains visible on all answer buttons
- Lose the final life and confirm the overlay announces immediately
- Toggle reduced motion and confirm pulses and celebration effects stop
- Inspect the ghost button on mobile width and confirm it still reads as interactive
- Re-check HUD readability after any score/lives design change
