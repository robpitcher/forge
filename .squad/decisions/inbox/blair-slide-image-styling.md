# Decision: Hero image styling on title slide

**Author:** Blair (Extension Dev / UI)
**Date:** 2025-07-11
**Scope:** `presentation/slidev/slides.md` — first slide only

## Context

The repo header image on slide 1 had minimal CSS treatment (simple border + box-shadow). It looked flat against the dark background.

## Decision

Replaced the plain image styling with a **gradient-border wrapper** pattern:

- **Wrapper div** (`.hero-image-wrapper`) provides a blue→violet diagonal gradient border (1.5 px) via `padding` + `background: linear-gradient(...)`.
- **Multi-layer ambient glow** — four box-shadow layers (blue highlight + indigo diffuse + deep blue ambient + dark drop shadow) give it depth without being heavy.
- **`glow-breathe` animation** — 5-second ease-in-out infinite keyframe that subtly pulses the glow intensity. Imperceptible in a screenshot, adds life during presentation.
- **Hover interaction** — gentle 1.2% scale-up, intensified glow, and slight brightness boost on the image itself.
- The image has `border: none` and `display: block` to sit cleanly inside the wrapper ring with matching `border-radius`.

## Why

- Gradient border ring is a standard premium-UI treatment (Apple, Vercel, Linear all use it).
- Animation is deliberately slow and subtle so it doesn't distract from the speaker.
- Colors (blue `#3B82F6`, violet `#7C3AED`, indigo `#6366F1`) complement the seriph dark theme and Forge's Azure branding.

## Alternatives Considered

- **Outline + outline-offset** — simpler but can't gradient.
- **`border-image`** — poor `border-radius` support in some renderers.
- **No animation** — static looks fine but animation is nearly free and adds polish.
