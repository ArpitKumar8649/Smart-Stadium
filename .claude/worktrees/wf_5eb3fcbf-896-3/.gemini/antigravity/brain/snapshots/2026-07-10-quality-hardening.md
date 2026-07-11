# Quality hardening — 2026-07-10

_Prompted by the hackathon AI-evaluation axes: code quality, security, efficiency,
testing, accessibility. Verified state, then closed the real gaps._

## Verified before / after

| Axis | Before | After |
|---|---|---|
| Code quality | ESLint NOT configured (lint script broken), no CI | Flat eslint config across all workspaces; 0 errors; CI enforces it |
| Security | secrets safe, Zod validation, CORS, redaction; no HTTP hardening | + helmet, compression, express-rate-limit (global 120/min, chat 20/min), input sentinel-wrapping |
| Efficiency | indexed graph, singletons, token bucket, 57 KB bundle | + gzip compression on responses |
| Testing | 13 tests (A*, crowd) | 23 tests (+ 10 tool-handler tests — the real agent surface) |
| Accessibility | semantic HTML, aria-live, focus rings | + verified AA contrast (all pairs pass, most AAA); html lang/dir sync incl. RTL for Arabic |

## What shipped

- **eslint.config.js** (flat, typescript-eslint) covering backend/shared/scripts (Node)
  and frontend (React hooks + refresh). Root `package.json` set to `type: module`.
  Workspace lint scripts point at it. Only 2 violations existed in the whole codebase
  (an unused type, a `let`→`const`) — both fixed. Signal that strict TS paid off.
- **Security middleware** in server.ts: `helmet({contentSecurityPolicy:false})`,
  `compression()`, and two rate limiters (global 120/min, `/api/chat` 20/min to guard
  the LLM free tier). `x-powered-by` disabled. Verified live: HSTS, nosniff,
  X-Frame-Options SAMEORIGIN, RateLimit headers all present.
- **Prompt-injection defense** (rule 10): the concierge wraps the fan's text in
  `<fan_message>` sentinels and strips any sentinel tokens the user typed, so the model
  treats the message as data, not instructions.
- **tools.test.ts**: 10 cases over the real handler surface — grounded routes, no node
  ids leaking into summaries, unknown-place failure, halal dietary filter, get_crowd
  band + simulated flag, resolve_place candidates, unknown-tool + malformed-args
  rejection (never throws).
- **.github/workflows/ci.yml**: on push/PR to main → npm ci, build shared, typecheck
  all, eslint, test all, build FE + BE. Dry-run green locally.
- **A11y**: computed WCAG contrast for the brand palette — every pairing passes AA,
  most exceed AAA (body 18.6:1, primary 7.5:1, muted 10.9:1, dim 6.4:1). Concierge now
  syncs `<html lang>` + `dir` to the chosen language (RTL for Arabic).

## New follow-up logged
- Fuzzy label matcher too tolerant on gibberish ("Platform 9 and 3 quarters" → "Suite
  3-59"). Logged in decisions/pending.md — tighten match floor before judging.

## Not done (deferred, noted honestly)
- axe-core automated a11y test in CI (needs a frontend test runner + jsdom setup) — the
  manual contrast + attribute audit stands in for now.
- Frontend component tests (the chat hook / bubbles) — backend is well-covered; FE has
  typecheck + build gates but no unit tests yet.
