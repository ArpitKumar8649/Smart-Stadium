# Day 1 snapshot — 2026-07-08

_Written after the scaffold shipped and both sides smoke-tested green._

## What shipped

Structure
- Monorepo skeleton with npm workspaces (`shared`, `backend`, `frontend`) — root `package.json`, `.nvmrc` (20.11.1), `.editorconfig`, `.prettierrc.json`, `.gitignore` (guards `.env` and any `service-account*.json`).
- Full folder tree in place for D2–D12 work (features/, components/, lib/, data/, evidence/, .gemini/, .agents/).

Antigravity brain seed
- `.gemini/antigravity/brain/project.md` — constitution: mission, locked scope, non-goals, hard constraints, success criteria, voice rules.
- `.gemini/antigravity/brain/architecture.md` — ASCII service diagram, layer responsibilities, data flow example.
- `.gemini/antigravity/brain/glossary.md` — stadium, accessibility, crowd, tournament, agent, and i18n vocabulary.
- `.gemini/antigravity/brain/decisions/` — seven ADRs written: 0001 monorepo, 0002 SSE, 0003 Gemini AI Studio only, 0004 MetLife flagship, 0005 simulated crowd honesty, 0006 build-then-port workflow (with risk acknowledged), 0007 free-tier token bucket.
- `.agents/rules/` — five workspace rules: 00 house style, 10 security, 20 accessibility, 30 realtime, 40 i18n.

Shared package
- `@concourse/shared` builds cleanly. Exposes Zod schemas + inferred TS types for: venue graph, crowd, fixtures, chat, route, alerts, session, admin.
- Constants: `VENUE_ID`, `SUPPORTED_LOCALES` (12), `ROUTING_MODES`, `NODE_TYPES` (19), `ALERT_KINDS`, `GEMINI_MODELS`, `FREE_TIER` limits, `MATCH_IDS`.

Backend
- Express + TS + Zod env validation on boot (fails fast with formatted errors).
- pino + pino-http with redaction of authorization, cookies, image_b64, GEMINI_API_KEY.
- Health (`/api/health`) and version (`/api/version`) endpoints returning proper JSON.
- Error handler distinguishes ZodError (400), custom (statusCode), fallback (500).
- CORS bound to `ALLOWED_ORIGINS` env var; dev default is Vite origin.
- Dockerfile ready for Azure App Service F1 or container path.

Frontend
- Vite 5 + React 18 + TS strict + Tailwind (dark by default) + Google Fonts (Inter + Space Grotesk).
- Brand system: primary `#00B67A` (pitch green), accent `#FFC300` (hi-vis), surface neutrals 0–950.
- Landing page renders wordmark, hero, five feature cards, footer.
- Not-found route uses the same design language ("this concourse ring doesn't exist yet").
- Production build: 167 KB JS gzipped 54.9 KB, CSS gzipped 2.56 KB. Under our D9 initial-JS budget of 200 KB.

Data
- `data/venue/metlife.graph.json` v0.1.0 — 12 nodes (Gate A, security, concourse segments, restroom, concession, first-aid, elevator, sensory-safe zone, vom to Section 128, Section 128, Gate A exit) and 17 weighted, tagged edges.
- `data/fixtures/matches.json` — three MetLife matches (QF, SF, Final) with real dates + times + timezone, plus eight team metadata records (USA, ARG, BRA, FRA, ESP, GER, ENG, POR).

Dev experience
- `npm install` from root installs all workspaces.
- `npm run dev` at root brings backend on `:8080` and Vite on `:5173` via concurrently.
- Verified both boot cleanly: `GET /api/health` → 200, `GET /` on Vite → 200, `GET /api/does-not-exist` → 404 with proper envelope.

Evidence scaffolding
- `evidence/antigravity-prompts.md` initialised with format template.
- `evidence/README.md` documents the folder contract.
- `evidence/screenshots/` and `evidence/walkthroughs/` exist and are tracked.

## Post-D1 grafts (same day, after external blueprint review)

Two external smart-stadium blueprints were reviewed after the scaffold shipped. Four small ideas were grafted into the plan without disturbing existing scope:

- **Predictive crowd density (T+15 / T+30)** — extended `CrowdLevel` Zod schema with an optional `predictions[]` array. Simulator will sample its own phase curve forward in time on the 15s tick. Ghosted heatmap overlay renders the T+15 layer. See ADR 0008.
- **AI Operational Briefing on `/admin`** — new `Briefing` Zod schema and a Gemini 2.5 Pro call every ~5 min. Structured output: `occupancy_pct` and `top_fan_questions` tool-derived, `headline` / `summary` / `concerns[]` / `recommendations[]` LLM-authored. See ADR 0009.
- **Privacy by design** — codified the implicit stance into six explicit principles enforced by schema + middleware: no facial recognition ever, aggregate-only crowd (no `fan_id`), anonymous sessions default, ephemeral chat, COUNT-based query aggregation, opt-in notifications. See ADR 0010.
- **Research citations** — added a "Grounded in research" H2 to the blog citing Helbing–Molnár social force model (1995), FIFA Stadium Guidelines 5th ed. (2023), and ADA §221/§802. Rhetorical grounding for the design choices.

Files touched by the grafts:
- `shared/src/schemas/crowd.ts` — added `CrowdPredictionSchema`, `predictions[]` on `CrowdLevel`.
- `shared/src/schemas/briefing.ts` — new file.
- `shared/src/schemas/index.ts` — export briefing.
- `.gemini/antigravity/brain/decisions/0008-predictive-density-t15-t30.md` — new.
- `.gemini/antigravity/brain/decisions/0009-ai-operational-briefing-admin.md` — new.
- `.gemini/antigravity/brain/decisions/0010-privacy-by-design.md` — new.
- `.gemini/antigravity/brain/architecture.md` — ADR table extended to 10 rows.
- `.gemini/antigravity/brain/glossary.md` — added `Prediction/Projection`, `Briefing`, `Reversible recommendation`.
- `.gemini/antigravity/brain/project.md` — `/admin` scope updated, added privacy to uncertainty pattern.
- `README.md` — 2 features table rows updated, new "Privacy by design" H2, ADR digest table extended to 10 rows.
- `docs/BLOG.md` — new "Grounded in research" H2 after "The problem", T+15 addendum inside Feature 3, new "Privacy by design" H2 after Feature 3, new "The /admin briefing" H2 after Feature 5.

Shared package rebuilds clean after schema changes. Frontend not touched (no UI code yet).

## What was not shipped today (and why)

- No Firebase Admin SDK wired in yet — deferred to D2 (needs actual project ID/service account from user).
- No Gemini SDK calls yet — deferred to D2 (needs API key from user; scaffolding for the token-bucket lives in ADR 0007).
- No auth middleware — deferred to D8 with the /admin route.
- No RAG index yet — deferred to D2 as part of AI core.
- Venue graph is 12 nodes; PLAN §2 targets 60–120. Bulk expansion is D3 work.

## Surprises / small wins

- pino's `exactOptionalPropertyTypes` interaction required a `LoggerOptions` cast fork. Documented via the fix; will not surprise the next contributor (or the next Antigravity agent).
- `tsc -b` doesn't play with `--noEmit` when a referenced project already disables emit. Solved by dropping the reference and using flat `tsc -p`.
- Frontend gzipped JS came in almost 3× under budget — comfortable headroom for shadcn, Framer Motion, i18next, TanStack Query later.

## Follow-ups (opened, not yet triaged)

1. Expand venue graph to 60–120 nodes covering Levels 1, 2, 3 north/south/east/west.
2. Add ESLint configs to `backend/` and `frontend/` (not blocking D1; needed before CI.yml in D9).
3. `capacity_class` on edges is not yet used by A*; wire once routing lands (D3).
4. PWA manifest + icons + service worker — D9.
5. i18n key linter for CI — D5.
6. GitHub Actions workflows — D9.
7. Web Speech API compatibility check on Safari + Firefox — D5.
8. Firebase service account provisioning depends on user creating a Firebase project — flagged for user on D2.

## D2 handoff — what starts tomorrow

Per PLAN §5 timeline:
1. Gemini tool schemas (findRoute, getCrowdLevel, findNearest, describeImage, ragSearch, getMatchInfo, subscribeIncidents, ...).
2. The full production system prompt (concierge persona + admin persona) written to `data/prompts/concierge.system.md`.
3. First chat loop: `POST /api/chat` accepting a message, calling Gemini Flash with function-calling registered, streaming tokens back over SSE with the `ChatEvent` schema.
4. Token bucket rate limiter (ADR 0007) in front of every Gemini call.
5. In-memory venue graph loader + first tool implementation (`findNearest`).

Success criterion for D2: a Bengali fan can ask "where is the nearest step-free restroom from Section 128?" and get a correct, Bengali-language streamed answer that shows a `toolCall` chip for `findNearest`.

## Reminder for the future Antigravity agent

Read `.gemini/antigravity/brain/project.md` first, then this snapshot, then any newer snapshot in `snapshots/`. The build history from D1 up to your session date is contained in these files and in `evidence/antigravity-prompts.md`.
