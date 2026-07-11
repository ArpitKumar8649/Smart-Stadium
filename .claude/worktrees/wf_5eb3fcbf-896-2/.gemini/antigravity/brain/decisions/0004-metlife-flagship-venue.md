# ADR 0004 — MetLife Stadium is the flagship venue

_Status: Accepted · Date: 2026-07-08_

## Context

FIFA World Cup 2026 uses 16 host stadiums across US, Mexico, and Canada. We need to pick which venue Concourse models first (potentially only). The venue graph is hand-modelled; each venue is 2–3 days of work.

Options considered:
- **MetLife Stadium** (East Rutherford NJ) — Final venue, July 19, 2026
- **SoFi Stadium** (Inglewood CA) — semifinal + group stage
- **Estadio Azteca** (Mexico City) — Opening match, 22 June 2026 slot in the R16
- **AT&T Stadium** (Arlington TX) — semifinal
- All 16 — infeasible in 12 days

## Decision

**MetLife Stadium** as the sole modelled venue for v1. Architecture allows plugging additional venues without code changes (venue graph is data, not code).

## Consequences

Positive:
- The Final is the biggest, most-viewed match in the tournament — the narrative payoff is enormous
- The Final is July 19; our submission is around July 21 — the tournament's most photographed moment is fresh in judges' minds
- MetLife has publicly available seat maps, gate layouts, and accessibility guides — real data to model
- 82,500-seat scale gives the crowd simulator interesting dynamics (halftime surge is textbook)
- "New York New Jersey Stadium" naming (per FIFA sponsorship) is a colour detail we can drop in the blog

Negative:
- We miss the storytelling angle of a multi-venue product (mitigated: the architecture supports multi-venue, the blog notes it as v1.1)
- MetLife is US-based, not India-based — for our India audience less locally relevant (mitigated: FIFA is a global event, and the Bengali fan use case still lands)

Non-obvious:
- Choosing the Final venue subtly increases perceived ambition to reviewers
- We can quote real MetLife facilities data (Gate A, Section 128, etc.) rather than invented names — this matters for blog credibility
