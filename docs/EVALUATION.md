# Evaluation evidence

This document maps Concourse to the PromptWars Virtual evaluation criteria.
It is intentionally evidence-based: every claim points to implementation that
can be read or a command that can be run.

## Challenge fit

**Vertical:** Smart Stadiums & Tournament Operations

Concourse addresses a root matchday problem: a fan needs a decision, not a
static venue page. It combines language, location, accessibility needs, route
preferences, and currently simulated venue conditions into a useful next step.
The same running system gives an operator a safe way to demonstrate how an
incident becomes a fan-facing alert.

## Rubric map

| Evaluation domain | Evidence in this repository |
| --- | --- |
| **Code Quality** | Strict TypeScript workspace packages (`frontend`, `backend`, `shared`); shared Zod contracts; small testable API factory in `backend/src/app.ts`; deterministic routing and agent tools separated from transport code. |
| **Security** | Request schemas at API boundaries; Helmet, CORS allowlist, compression, and rate limits in `backend/src/app.ts`; constant-time admin-token comparison in `backend/src/middleware/admin-auth.ts`; server-only admin token; operator-only PA/TTS with a bounded cache; origin/size/concurrency guards for ASR WebSockets in `backend/src/services/audio/asr.ts`. |
| **Efficiency** | Cached core map/route assets in `frontend/src/lib/stadiumCache.ts`; route-level lazy loading in `frontend/src/app/App.tsx`; 3D view/tile initialization is deferred (the current Cesium runtime remains a global build dependency); trophy renders only while visible, pauses off-screen, and applies a handset quality tier; hidden tabs pause map/admin polling. |
| **Testing** | Vitest tests cover A* modes, crowd simulation, grounded tools, closure-aware route exclusions, and public route contracts. `backend/src/app.test.ts` verifies health, valid/invalid route contracts, fail-closed admin access, anonymous PA/TTS denial, and a simulated operational advisory detour without external AI services. |
| **Accessibility** | Step-free/sensory preferences feed routing; mobile map disclosure; keyboard/screen-reader landmarks and skip link; visible focus styles; large text/reduced-motion settings; accessible map zones; caption/sign-reader error states and text route instructions. |
| **Problem Statement Alignment** | The Qwen-backed concierge is bounded and designed to ground venue facts in tools; the route engine uses a bundled venue graph; crowd conditions are visibly labelled as simulation; protected operations controls demonstrate real-time alert flow to connected navigation views. |

## Smart, dynamic assistant evidence

1. `backend/src/services/agent/concierge.ts` streams a Qwen-backed turn and
   caps tool hops, preventing an unbounded agent loop.
2. `backend/src/services/agent/tools.ts` resolves facilities, routes, crowd
   data, venue facts, and optional outdoor travel from deterministic services.
3. `backend/src/services/graph/astar.ts` changes path weights for fastest,
   step-free, sensory-safe, and low-crowd contexts.
4. `backend/src/services/crowd/simulator.ts` produces labelled match-phase
   crowd conditions and forecasts; `backend/src/routes/alerts.ts` streams
   demo alerts to fan clients.
5. `backend/src/routes/admin.ts` allows an authenticated operator to inject a
   simulated incident or crowd state and request a structured briefing. Active
   route-advisory nodes are excluded by `backend/src/routes/navigation.ts`, and
   the fan navigation view refreshes a route when its SSE alert intersects the
   displayed path.

## Validation commands

Run these from the repository root:

```bash
npm ci
npm run build --workspace=shared
npm run typecheck
npm run lint
npm run test
npm run build
```

GitHub Actions runs the same TypeScript, lint, test, and build checks on
`main` and pull requests. The Azure deployment workflow additionally builds
and tests the backend before deployment.

## Honest demo boundaries

- Crowd data is simulated for the hackathon and is labelled in the UI.
- The venue graph is bundled demo data and should be validated by a venue
  operator before real deployment.
- Outdoor route results require a server-configured Google Routes API key.
- The admin console is demo-operator functionality, protected by a backend
  secret and not intended as a full multi-user identity system.
- The fan demo is deployed at https://concourse-stadium.web.app. Verify the
  browser-to-Azure CORS configuration before a live judging session.

## Submission checklist

- [x] Repository contains complete project code.
- [x] README states the vertical, approach, logic, operation, and assumptions.
- [x] CI and deployment workflows are committed.
- [ ] Confirm the GitHub repository is **Public** before submission.
- [ ] Add a real two-tab operator/fan walkthrough video and a build/setup photo
  to the submission and social post; do not use mock screenshots as evidence.
- [x] Live Firebase Hosting URL is documented: https://concourse-stadium.web.app
- [ ] Publish the LinkedIn post in [docs/linkedin.md](linkedin.md) with
  `#BuildwithAI`, `#PromptWarsVirtual`, `#Challenge4`, and tags for
  `@googlefordevelopers` and `@hack2skill`.
