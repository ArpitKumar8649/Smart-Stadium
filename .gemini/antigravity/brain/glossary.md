# Concourse — Glossary

_The domain vocabulary the agent must speak in. When Antigravity generates code or copy, it uses these terms exactly._

## Stadium terms

| Term | Definition |
|---|---|
| **Concourse** | The connective walkable area of a stadium (rings around the seating bowl). Our app is named for it. In the venue graph, `concourse_segment` nodes connect gates to section entrances. |
| **Gate** | An entry point from outside the stadium into the concourse. MetLife has Gates A through H. Node type: `entry_gate`. |
| **Section** | A block of seats identified by number (100s = lower bowl, 200s = mezzanine/club, 300s = upper). Node type: `seating_section`. |
| **Level** | A vertical tier of the stadium. Level 1 = lower concourse, Level 2 = club/mezzanine, Level 3 = upper. Every node has a `level` property. |
| **Vom / Vomitory** | The tunnel connecting a concourse to a seating section. Modelled as an edge, not a node. |
| **Portal** | Synonym for vomitory in some venues. Do not use in output — always say "section entrance." |

## Accessibility terms

| Term | Definition |
|---|---|
| **Step-free** | A route with zero stairs; may include ramps, elevators, or level transitions but no steps. Edge property `step_free: bool`. |
| **Wheelchair accessible** | Stricter than step-free; door widths, gradients, and turning circles all satisfy ADA. Edge property `wheelchair_accessible: bool`. |
| **Sensory-safe zone** | A designated quiet, low-light area for fans who need respite from crowds/noise. Node type: `sensory_safe_zone`. MetLife has one on Level 1. |
| **Companion seat** | Adjacent seat to an accessible seat, for a caregiver. Not modelled at v1. |

## Crowd model terms

| Term | Definition |
|---|---|
| **Zone** | An aggregation of nearby graph nodes with a shared crowd density value. E.g. `l1-south-restrooms` = all Level 1 south-side restroom nodes. Zones are the unit of density measurement. |
| **Density** | Value 0.0–1.0. 0 = empty, 1 = at capacity. Written by simulator every 15s if delta > 5%. |
| **Wait seconds** | Estimated queue wait derived from density and zone type (a bathroom at 0.9 density ≠ a food stand at 0.9 density). |
| **Halftime surge** | The well-known 15-minute density spike at restrooms and concessions after the 45th minute. First-class case in the simulator. |
| **Post-match egress** | The 20-minute exit + transit surge after the final whistle. |

## Tournament terms

| Term | Definition |
|---|---|
| **Match** | A single game in the World Cup. Identified by `match_id`. |
| **Fixture** | The scheduled metadata of a match (date, teams, venue). Same table. |
| **Kickoff** | The exact ISO datetime of match start. All time math ("leave now", "halftime nudge") is relative to this. |
| **Round** | Group stage / R32 / R16 / QF / SF / Third-place / Final. Our fixtures at MetLife are the QF, one SF, and the Final. |

## Agent terms

| Term | Definition |
|---|---|
| **Concierge** | The single Gemini agent Concourse presents to fans. Uses `concierge.system.md` prompt. |
| **Tool** | A typed function the agent can call. Registered via Gemini function-calling. See `docs/PLAN.md` §2 for the full list. |
| **Nudge** | A proactive alert pushed to the client over SSE. Distinct from a conversational message — nudges are one-way and dismissible. |
| **Incident** | A backend-injected event (weather, closure, gate change) that triggers alert-engine rules. Admin can inject via `/admin`. |

## Language / i18n terms

| Term | Definition |
|---|---|
| **UI string** | Static UI copy (buttons, labels). Translated at build via react-i18next JSON files. |
| **Agent reply** | Dynamic Gemini output. Translated at runtime by Gemini (in the system prompt) — not by react-i18next. |
| **Seed language** | One of the 12 languages with full react-i18next coverage. Others use runtime Gemini translation for agent replies and English fallback for UI strings. |

## What NOT to say in user-facing copy

- Never "AI" — say "Concourse" or leave it implicit
- Never "chatbot" — say "Concourse"
- Never "user" — say "you" or "the fan"
- Never "sorry, I can't help with that" — say what you *can* do instead
- Never "please try again" without saying why
