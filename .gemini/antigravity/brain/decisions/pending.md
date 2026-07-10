## Pending / unresolved architecture questions

_Log open decisions here as they arise. Move to a numbered ADR once resolved._

- **Fuzzy label matcher is too tolerant on gibberish.** `findNodeByLabel("Platform 9
  and 3 quarters")` resolves to "Suite 3-59" because the numeric token "3" scores a
  partial match. Surfaced by tools.test.ts on 2026-07-10. Risk: the concierge could
  confidently route from a place the fan never named. Fix options: (a) require a
  minimum match score / token-overlap ratio before returning a hit; (b) when best
  score is weak, return undefined so the tool asks the fan to clarify via resolve_place.
  Low severity (real queries name real places) but worth hardening before judging.

