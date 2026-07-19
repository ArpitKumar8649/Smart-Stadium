# Evaluation evidence

This document maps Concourse to the PromptWars Virtual evaluation criteria.
It is intentionally evidence-based: every claim points to implementation that
can be read or a command that can be run.

## Challenge fit

**Vertical:** Smart Stadiums & Tournament Operations (PromptWars Challenge 4).

**Problem statement recap:** *"Build a GenAI-enabled solution that enhances
stadium operations and the overall tournament experience for fans, organizers,
volunteers, or venue staff. The solution must leverage Generative AI to improve
navigation, crowd management, accessibility, transportation, sustainability,
multilingual assistance, operational intelligence, or real-time decision
support during the FIFA World Cup 2026."*

Concourse addresses a root matchday problem: a fan needs a decision, not a
static venue page. It combines language, location, accessibility needs, route
preferences, and currently simulated venue conditions into a useful next step.
The same running system gives venue staff and tournament organizers a safe way
to demonstrate how an incident becomes a fan-facing alert, along with a
structured AI operational briefing on demand.

### Coverage of every Challenge 4 area

| Area | Where in the repo |
| --- | --- |
| **Navigation** | `backend/src/services/graph/astar.ts` (A* with 4 modes over 3,479-node graph). |
| **Crowd management** | `backend/src/services/crowd/simulator.ts` + low-crowd routing weights. |
| **Accessibility** | Step-free / sensory-safe routing weights; frontend large-text, reduced-motion, live captions, sign reader. |
| **Transportation** | Dedicated **Transit Agent** — `backend/src/services/agent/transit.ts`. Its own system prompt (`data/prompts/transit.system.md`), its own bounded tool set (`plan_ground_routes`, `estimate_carbon_footprint`, `recommend_best_mode`), and its own deterministic scorer. Invoked by the concierge via a `transit_handoff` tool (multi-agent orchestration). Plans all 5 ground modes via Google Routes v2. |
| **Sustainability** | Per-mode per-passenger CO₂ estimate on every option, sourced from a bundled DEFRA 2023 emissions-factor table (`backend/src/services/transit/carbon.ts`). Every result carries a `carbon_source` field so the UI can label the number honestly as an estimate, not a measurement. The Transit Agent's balanced scorer picks the Pareto-optimal mode across time and carbon; UI card shows CO₂ saved vs. driving. |
| **Multilingual assistance** | 10-language concierge, streamed Qwen answers. |
| **Operational intelligence** | `backend/src/routes/admin.ts` produces a structured AI briefing (headline, concerns, recommendations) from live crowd and incident state. |
| **Real-time decision support** | `backend/src/routes/alerts.ts` (SSE) + `backend/src/routes/navigation.ts` (advisory-aware route exclusion). |

### Coverage of Challenge 4 personas

| Persona | Surface |
| --- | --- |
| **Fans** | Public PWA — concierge, navigation, alerts, accessibility, transportation. |
| **Venue staff** | Tournament Operations Console (`/admin`) — crowd heatmap, incident/override injection, on-demand AI briefing. |
| **Tournament organizers** | Consume the same operations briefings and SSE stream as coordination artifacts. |

## Rubric map

| Evaluation domain | Evidence in this repository |
| --- | --- |
| **Code Quality** | Strict TypeScript workspace packages (`frontend`, `backend`, `shared`); shared Zod contracts; small testable API factory in `backend/src/app.ts`; deterministic routing and agent tools separated from transport code. |
| **Security** | Request schemas at API boundaries; Helmet, CORS allowlist, compression, and rate limits in `backend/src/app.ts`; constant-time admin-token comparison in `backend/src/middleware/admin-auth.ts`; server-only admin token; operator-only PA/TTS with a bounded cache; origin/size/concurrency guards for ASR WebSockets in `backend/src/services/audio/asr.ts`. |
| **Efficiency** | Cached core map/route assets in `frontend/src/lib/stadiumCache.ts`; route-level lazy loading in `frontend/src/app/App.tsx`; 3D view/tile initialization is deferred (the current Cesium runtime remains a global build dependency); trophy renders only while visible, pauses off-screen, and applies a handset quality tier; hidden tabs pause map/admin polling. |
| **Testing** | Vitest tests cover A* modes, crowd simulation, grounded tools, closure-aware route exclusions, and public route contracts. `backend/src/app.test.ts` verifies health, valid/invalid route contracts, fail-closed admin access, anonymous PA/TTS denial, and a simulated operational advisory detour without external AI services. |
| **Accessibility** | Step-free/sensory preferences feed routing; mobile map disclosure; keyboard/screen-reader landmarks and skip link; visible focus styles; large text/reduced-motion settings; accessible map zones; caption/sign-reader error states and text route instructions. |
| **Problem Statement Alignment** | The Qwen-backed concierge is bounded and designed to ground venue facts in tools; the route engine uses a bundled venue graph; crowd conditions are visibly labelled as simulation; the Tournament Operations Console demonstrates a real-time incident-to-fan-advisory flow with an on-demand structured AI briefing; multi-mode outdoor travel routing (Google Routes) covers the *transportation* area; the Transit Agent milestone adds carbon-aware *sustainability* scoring on top of it; ten-language concierge covers *multilingual assistance*. See the **Coverage of every Challenge 4 area** and **personas** tables above. |

## Smart, dynamic assistant evidence

1. `backend/src/services/agent/concierge.ts` streams a Qwen-backed turn and
   caps tool hops, preventing an unbounded agent loop.
2. `backend/src/services/agent/tools.ts` resolves facilities, routes, crowd
   data, and venue facts from deterministic services; when a fan asks about
   getting to the stadium, the concierge invokes `transit_handoff` and
   delegates to a specialist second agent (`backend/src/services/agent/transit.ts`)
   with its own prompt, bounded tools, and Pareto-aware time/carbon scorer.
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

- Crowd data is simulated for the hackathon and labelled in the UI. The
  crowd store carries a `source` field (`sim` / `injected` / `sensor`), so a
  real venue-telemetry adapter is a one-file swap.
- The venue graph is bundled demo data and should be validated by a venue
  operator before real deployment.
- Outdoor transportation routing uses a server-configured Google Routes API
  key; the key is already provisioned for the hosted demo.
- The Tournament Operations Console (`/admin`) uses a demo-tier auth posture:
  server-only passcode with fail-closed 401s, rate limits, and constant-time
  token comparison. Production would layer a full multi-user identity system.
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
