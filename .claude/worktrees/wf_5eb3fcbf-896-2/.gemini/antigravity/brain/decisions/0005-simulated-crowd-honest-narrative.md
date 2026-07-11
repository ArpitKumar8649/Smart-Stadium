# ADR 0005 — Crowd is simulated, and we say so out loud

_Status: Accepted · Date: 2026-07-08_

## Context

Live crowd data at a real stadium comes from IoT sensors (CV cameras, turnstile counters, wifi triangulation, LiDAR). We have none of these. The options for representing crowd in a hackathon are:

1. **Fake it silently** — pretend the data is real; hope no one asks
2. **Skip the feature** — remove crowd awareness from scope
3. **Simulate it, transparently** — build an in-process simulator, model realistic curves, label the source in every response

## Decision

**Option 3.** Build a deterministic-plus-stochastic simulator that models real stadium load patterns (pre-match ramp, halftime surge, post-match egress). Every crowd data point carries a `source` field: `"sim"`, `"injected"` (admin panel), or (future) `"sensor"`. The UI shows a small "simulated" chip near the heatmap. The blog leans into this honestly.

## Consequences

Positive:
- **Reviewers respect honesty.** A fake demo is a red flag; an honest simulation with realistic curves is impressive engineering.
- The simulator itself is a first-class blog topic (curve modelling, halftime surge math, admin-injection API)
- The `/admin` incident-injection panel becomes the demo's climax: "watch the fan app reroute in real time when I close food court 2" — this is exactly the "wow" moment.
- Migration path to real sensors is trivial: swap the `source: "sim"` writer for a `source: "sensor"` one; the rest of the system is unchanged.

Negative:
- We lose the (fake) ability to claim "live real data"
- If we hide the "simulated" chip too aggressively, reviewers might feel deceived. Mitigation: it's visible in the heatmap and mentioned in the blog.

Non-obvious:
- The simulator's admin-override API is what makes the live judge demo dramatic. Without it, crowd data is a static number.
- Honesty here doubles as evidence of engineering maturity in the blog.
