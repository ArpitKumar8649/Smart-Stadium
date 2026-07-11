# ADR 0009 — AI operational briefing on /admin (Gemini as chief-of-staff)

_Status: Accepted · Date: 2026-07-08 (grafted post-D1 planning review)_

## Context

The `/admin` route as originally scoped in `docs/PLAN.md` was a mirror
over live data: heatmap, incident injector, aggregated queries,
crowd-override sliders. Useful, but reactive. External blueprint
review flagged the missing piece: an operator does not want to READ
five widgets and synthesize what they mean — they want the synthesis
delivered as a natural-language briefing every few minutes.

## Decision

Add an **AI Operational Briefing** panel to `/admin`, refreshing every
~5 minutes (and on-demand). One Gemini 2.5 Pro call per briefing.
Input: the current heatmap (including T+15/T+30 predictions from ADR
0008), the last 10 incidents, the top 5 aggregated fan questions,
match phase (pre/first-half/halftime/second-half/post), and time-
until-next-phase-boundary. Output: a typed `Briefing` per
`shared/src/schemas/briefing.ts`.

The response shape is deliberately structured:
- `headline` (max 160 chars) — one-line status the ops chief reads first
- `summary` (max 1200 chars) — 2-4 sentence situational read
- `concerns` — array of `{zone_id, concern, severity, eta_minutes}`
- `recommendations` — array of `{action, affected_zone_id, suggested_alert_kind, reversible}`
- `occupancy_pct` — from tool result, NOT from LLM
- `top_fan_questions` — from aggregate feed, NOT from LLM
- `generated_at`, `window_start`, `window_end`, `model`, `lang`

Prose fields are LLM-authored. Numeric and enum fields are tool-derived
and validated by Zod before the briefing is emitted. Deterministic
tool-grounding applies here exactly as it does to the concierge.

The `recommendations[].reversible` field lets the UI mark low-risk
suggestions ("nudge Sec 120-130 toward L1 south restrooms") differently
from consequential ones ("close Food Court 2"). Reversible = one-click
apply; non-reversible = two-step confirm.

Model choice: Gemini 2.5 Pro (not Flash) because the input context is
large (heatmap + incidents + queries) and the reasoning is more
consequential per call. At one call per 5 minutes across the demo
window, Pro's stricter free-tier quota is not a constraint.

## Consequences

Positive:
- `/admin` becomes a decision-support tool, not a monitoring wall.
  Judges reading the manual review get a quotable moment ("Concourse
  told the ops chief exactly what to do") that other submissions
  won't have.
- The briefing is a natural narrative anchor for the blog and demo
  script — the "AI as chief-of-staff" framing lands.
- Costs almost nothing in demo traffic: ~12 Pro calls per hour, well
  under free-tier ceiling.

Negative:
- Adds one more Gemini call path (Pro instead of Flash). The token-
  bucket rate limiter (ADR 0007) already handles it; no new
  infrastructure.
- Manual "auto-apply" of recommendations is dangerous. We ship the
  Apply button only for reversible recommendations in v1.

Non-obvious:
- The structured schema (concerns + recommendations arrays) is what
  keeps the LLM from producing a wall of vague prose. The model is
  forced to name a zone and pick a severity for every concern.
- Language: the briefing renders in the ops chief's `lang` preference
  (typically English for stadium ops, but not required). Same
  mechanism as the concierge — one Gemini backbone.
