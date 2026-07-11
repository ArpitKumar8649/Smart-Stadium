# Rule 20 — Accessibility

_WCAG 2.1 AA is a floor, not a target. Any new UI must satisfy these before it lands._

## Colour contrast

- Body text on background: **≥ 7:1** (AAA) in the default theme
- UI icons and non-text elements: **≥ 3:1** against their background
- Never rely on colour alone to convey information (crowd density has both a colour and a numeric density label)

## Keyboard

- Every interactive element is reachable and operable via keyboard
- Visible focus rings (`focus-visible:ring-2 focus-visible:ring-primary`) — never `outline: none` without a replacement
- Tab order matches visual order; use `tabIndex="0"` sparingly and never negative-tab-index a critical control

## Screen readers

- Semantic HTML first: `<button>` for buttons, `<a>` for links, `<nav>` for navigation
- Every icon-only button has an `aria-label`
- Live regions used for streaming Gemini responses (`aria-live="polite"`) and for alert nudges (`aria-live="assertive"`)
- Chat messages have `role="log"` on the container

## Motion

- Respect `prefers-reduced-motion`. If set, disable Framer Motion transitions and swap for opacity-only fades.
- The crowd heatmap pulse is disabled when reduced motion is on.

## Text and target size

- Base font size ≥ 16px. Body text uses `text-base` (16px).
- Interactive targets ≥ 44 × 44px on touch (Tailwind `min-h-11 min-w-11` for touch-native buttons).
- Support 200% browser zoom without horizontal scrolling.

## Language

- The `<html lang="...">` attribute is synchronised with the current i18n locale.
- Arabic locale switches to `dir="rtl"`.

## Accessibility mode (feature 4) is a first-class routing preference

- The route-finder accepts `mode: "step_free"` and treats step-nodes as high-cost, not filtered
- If step-free is impossible, Concourse explicitly says so and offers the least-step alternative
- Sensory-safe zones are always visible on the map when accessibility mode is on

## Automated checks

- axe-core runs in CI on the built site; any new violation fails the build
