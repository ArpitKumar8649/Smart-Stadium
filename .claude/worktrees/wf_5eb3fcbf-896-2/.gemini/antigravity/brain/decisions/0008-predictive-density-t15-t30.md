# ADR 0008 — Predictive crowd density on the heatmap (T+15 / T+30)

_Status: Accepted · Date: 2026-07-08 (grafted post-D1 planning review)_

## Context

Both external smart-stadium blueprints reviewed on D1 flagged predictive
crowd flow (15–30 minutes ahead) as the operational feature that separates
a monitoring tool from a decision-support tool. Our simulator already
generates full phase curves (pre-match, kickoff, halftime, post-match),
so the forward-look is a projection off an existing signal — not new ML.

## Decision

Every `CrowdLevel` document now carries an optional `predictions` array
with two entries: `T+15 min` and `T+30 min`. Each prediction is
`{ offset_minutes, density, wait_seconds, confidence }`.

The simulator writes predictions on the same 15-second tick that writes
the current density. Predictions come from **the simulator's own curve
sampled forward in time**, not from an ML model. The `confidence` field
is the simulator's self-reported certainty (higher near known phase
inflections like halftime, lower during transitions), NOT a claim of
statistical accuracy.

The heatmap UI renders the T+15 layer as a ghosted overlay toggled from
a legend chip. `/admin` shows the T+30 layer additionally. Every
predicted number carries the same `source` provenance as the current
value (`sim` / `injected` / `sensor`) and inherits the "simulated" chip.

Predictions are omitted (`predictions: undefined`) when unknowable —
e.g. an admin override with no TTL, or the first tick after startup
before the simulator has built curve state.

## Consequences

Positive:
- **Turns `/admin` from monitoring into forecasting** without adding
  a real ML model. The forecast is honest: it comes from the same
  simulator curve that produced the current value.
- The alert engine can trigger on predicted crossings, not just current
  ones — "restrooms will hit 90% in 8 min, prime signage now."
- The AI briefing (ADR 0009) has a natural forward-look input.
- Migration path to real sensors is unchanged: swap the writer, the
  schema is agnostic.

Negative:
- Prediction quality is bounded by simulator quality. We call it
  "projection" rather than "prediction" in copy that reviewers might
  parse strictly.
- More Firestore payload per zone (~120 bytes). Negligible at our scale.

Non-obvious:
- The ghosted-overlay UI treatment matters. A solid overlay would
  invite reviewers to challenge accuracy claims we don't make.
- The confidence field lives on-schema (not just in UI) because the
  alert engine consumes it — low-confidence forward-crossings do not
  trigger nudges.
