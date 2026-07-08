# Concourse — Your AI companion at every gate, seat, and section.

**A GenAI stadium companion built for the FIFA World Cup 2026 Final. PromptWars Virtual Challenge 4.**

[![Built with Google Antigravity](https://img.shields.io/badge/Built%20with-Google%20Antigravity-4285F4?style=flat-square&logo=google&logoColor=white)](https://antigravity.google)
[![Powered by Gemini 2.5](https://img.shields.io/badge/Powered%20by-Gemini%202.5-1a73e8?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![React 18 + TypeScript](https://img.shields.io/badge/React%2018-TypeScript-3178C6?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Node 20 + Express](https://img.shields.io/badge/Node%2020-Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-00B67A?style=flat-square)](./LICENSE)
[![Live Preview](https://img.shields.io/badge/Live%20Preview-concourse.web.app-FFC300?style=flat-square&logo=firebase&logoColor=black)](https://concourse.web.app)

![Concourse hero](docs/media/hero.png)

---

## One-paragraph pitch

Concourse is a real-time GenAI companion for the 82,500 fans arriving at MetLife Stadium for the FIFA World Cup 2026 Final on July 19, 2026. It answers "where's the closest step-free restroom to Section 128 in Bengali?" in the fan's own language, routes them there over a hand-modelled venue graph, streams live crowd density, and nudges them toward exits before the halftime rush — all powered by a single Gemini 2.5 agent backbone with deterministic tool-grounding, so the model reasons but never invents a gate number. No credit card, no paid APIs, no fake sensors — the crowd feed is simulated and we say so, right in the UI.

Try it live: [concourse.web.app](https://concourse.web.app)

---

## Why Concourse (the problem it solves)

- **82,500 fans in one venue, 30+ languages spoken, and halftime surges that empty concourses in 15-minute windows.** A stadium's operational tempo doesn't match a static website's information architecture.
- **Static stadium websites can't answer "closest step-free restroom to Section 128 in Bengali."** They can't reroute a wheelchair user around a suddenly-crowded ramp. They can't translate an English wayfinding sign photographed on a phone into Spanish, then read it aloud.
- **FIFA World Cup 2026 spans 16 stadiums across 3 countries, 48 teams, 104 matches, and roughly 6 million ticket-holders** — the opportunity is real, and the tooling isn't there yet. The official app maps seats; it doesn't reason.
- **Accessibility is treated as a "mode" toggle almost everywhere.** That framing is wrong. A step-free route isn't a filter that excludes stairs — it's a preference that trades a few extra minutes for dignity, and it should degrade gracefully when the ideal path isn't available.

Concourse is one product, five capabilities, one Gemini agent. It's the companion the tournament deserves.

---

## Features

| Feature | What it does | How it works (the technical tell) |
|---|---|---|
| **Multilingual concierge** | Chat + voice Q&A in 30+ languages ("where's Gate C?", "when's kickoff?", "is Section 128 crowded?") | Gemini 2.5 Flash with function-calling; 12 seed languages via `react-i18next`, unseeded languages fall back to runtime Gemini translation with a UI indicator |
| **Smart indoor navigation** | Turn-by-turn routing between any two nodes at MetLife, narrated in the user's language | A* pathfinding over a hand-modelled 12-node venue graph; LLM narrates steps from typed tool results, never invents them |
| **Live crowd awareness** | Real-time zone density heatmap + queue estimates + a **T+15 / T+30 projected-density overlay** that shifts operators from monitoring to forecasting | Firestore doc-per-zone, client subscribes directly (resilient to backend cold starts); simulator writes deltas > 5%; every reading tagged `source: "sim" \| "injected" \| "sensor"` and forward-look sampled from the same phase curve |
| **Accessibility mode** | Step-free routing, sensory-safe zone awareness, camera → sign reader with TTS, high-contrast UI | Accessibility is a routing **weight** (β on step-count violations), not a hard filter; Gemini multimodal reads and translates signs in one call |
| **Real-time decision support** | Proactive SSE nudges: "gate change at Gate C", "leave now to catch the 10:47 metro", "halftime egress starting in 4 min" | Server-Sent Events over Express; token-bucket rate-limited (12/min); every alert is JSON with `severity`, `expiresAt`, and a source event |
| **`/admin` ops view** | Crowd heatmap, incident injector, aggregated fan-query feed, manual crowd-override sliders — **plus an AI Operational Briefing** the ops chief reads instead of the widgets | The judge's playground — one click closes food court 2, and connected fan apps reroute live via Firestore + SSE. Every ~5 min, Gemini 2.5 Pro emits a structured `Briefing` (headline + summary + concerns[] + recommendations[]) grounded in tool results, not vibes. |

### Design principles

> **Deterministic tool-grounding.** The LLM reasons; tools execute. Gates, sections, route steps, and crowd numbers only enter the model's mouth from a typed tool result. Enforced in the system prompt and validated by Zod on every tool response.

> **Accessibility as a routing weight, not a filter.** If the ideal step-free path is unavailable, Concourse says so and offers the least-step alternative — it never silently drops the user.

> **One Gemini backbone, not per-feature calls.** The same agent handles concierge, translation, sign-reading, and nudge generation. One system prompt, one function-calling loop, one tool registry. Fewer moving parts, cheaper cache reuse.

> **Simulated crowd is labelled.** The demo runs on a phase-curve simulator (pre-match ramp, kickoff drop, halftime surge, post-match egress). Every reading carries a `source` field, and the UI shows a "simulated" chip. We never claim to have sensors we don't have.

> **Zero paid services, zero credit card.** Google AI Studio free tier for Gemini, Firebase Spark plan, Azure Student F1 for the backend, Web Speech API for STT/TTS. If a judge wants to fork and run it, they can — for the price of a Google account.

> **Privacy by design — not an afterthought.** No facial recognition, ever. Aggregate zone density only — the schema has no notion of an individual fan. Anonymous sessions by default, ephemeral chat, opt-in notifications. See [ADR 0010](.gemini/antigravity/brain/decisions/0010-privacy-by-design.md).

---

## 🛡 Privacy by design

Most stadium tech treats privacy as a footer link. Concourse treats it as an architectural constraint. The six principles below are enforced by the schema and the middleware, not by policy:

1. **No facial recognition. Ever.** Not in the app, not in the simulator, not in the sensor-migration path. When real crowd data ships (roadmap v0.3), the edge-CV path emits bounding-box vectors only and drops the frames within the same process. Faces never leave the camera sensor.
2. **Aggregate crowd, not individual location.** The crowd data model has no `fan_id` — it is architecturally impossible to answer "where is fan X" because the schema doesn't carry a fan identity.
3. **Anonymous sessions by default.** Firebase Auth guest mode is the default. Google sign-in is optional and unlocks nothing except opt-in preference persistence across devices.
4. **Ephemeral chat.** The concierge does not persist chat history server-side. Session context (last ~10 turns) lives in memory for the SSE connection lifetime. Preferences are opt-in; everything else evaporates on tab close.
5. **COUNT-based aggregation for `/admin`.** The `top_fan_questions` feed shown in the AI Briefing is count-based, never full-text. "24 fans asked about halal food" is the shape; original messages are never surfaced to operators.
6. **Opt-in notifications.** The Notification API prompt is deferred until the fan asks for proactive nudges. Never triggered on landing.

Concretely enforced: Firestore security rules forbid client writes outside `/sessions/{ownSessionId}`; `pino` redacts `Authorization`, `Cookie`, `image_b64`, and service-account JSON; production CORS is a single-origin allowlist; `LOG_USER_INPUT=false` by default.

---

## Live demo (judge walkthrough)

**Skip the reading. Run the 90-second happy path.**

![Demo — Bengali concierge answering step-free restroom query](docs/media/demo-01-concierge.png)

### The 90-second happy path

1. **Land on `/`.** Pick "বাংলা" (Bengali) from the language switcher. The UI localizes; the concierge greeting speaks Bengali via Web Speech TTS.
2. **Ask the concierge:** _"সেকশন ১২৮-এর কাছে সিঁড়ি ছাড়া টয়লেট কোথায়?"_ ("Where's the step-free restroom near Section 128?") A tool-call chip appears under the reply — `findRoute({from: "section-128", to: "restroom", mode: "step-free"})` — with the route rendered on the mini-map.
3. **Toggle Accessibility Mode.** The routing weights shift; sensory-safe zones highlight; the sign-reader button becomes primary in the toolbar. Nothing in the UI is hidden — just re-weighted.
4. **Open `/admin` in a second tab.** You'll see the live heatmap. The concession node near Section 128 is green (low density).
5. **Drag the "Concession — Section 128" slider to 95%.** Within 2 seconds, the fan app in the first tab pushes a toast — _"Rerouting: concession near you is now crowded"_ — and the on-map path updates. That's the wow moment.

### The 30-second wow moment

![Admin injection → fan app reroute](docs/media/demo-02-admin-reroute.png)

Two browser tabs, side by side. Left: fan on `/` with an active route. Right: judge on `/admin` clicks **"Inject incident → Close: Food court 2"**. The fan app's route re-computes on the next Firestore snapshot; the concierge speaks the rerouting explanation in the fan's chosen language. No page reload. No polling.

### Sign-reader demo

![Sign reader — English wayfinding sign translated to Spanish](docs/media/demo-03-sign-reader.png)

Point the phone camera at an English wayfinding sign. Gemini 2.5 multimodal returns a translated caption in the user's language and TTS reads it aloud. One model call replaces Cloud Vision + Cloud Translation.

> **Video walkthrough:** [YouTube unlisted — 2 min](https://youtube.com/watch?v=REPLACE_ME) _(link updated Day 12)_

---

## Tech stack

Every choice below has a reason. This isn't a laundry list — it's a set of decisions.

### AI / ML

- **Google Antigravity** — the agentic IDE (Gemini 3 Pro backbone, currently in free public preview). Every feature was planned as a Plan Artifact, approved by the developer, and executed as an agent run. The full trail lives in [`evidence/`](./evidence). Antigravity is a mandatory PromptWars deliverable and, honestly, the reason the schedule holds.
- **Gemini 2.5 Flash + Pro via Google AI Studio** — free tier, 15 requests/min, 1500 requests/day. Function-calling + multimodal in a single model family. No credit card, no Vertex AI, no service accounts. See [ADR 0003](.gemini/antigravity/brain/decisions/0003-gemini-ai-studio-only.md).
- **`text-embedding-004`** (Gemini) for RAG over the venue graph and the FIFA fixtures corpus. Same key, same quota, same SDK.

### Frontend

- **React 18 + Vite 5 + TypeScript (strict mode)** — Vite for the sub-second HMR that keeps the dev loop honest.
- **Tailwind CSS + shadcn/ui + Framer Motion** — utility-first with a shared component library. Motion is scoped to route transitions and toast entrances; no gratuitous parallax.
- **`react-i18next`** for 12 seed languages (en, es, hi, bn, ta, ar, fr, de, pt, ja, ko, zh); unseeded languages fall back to Gemini runtime translation with a visible "translated live" badge.
- **Zustand** for client state (small, no boilerplate), **TanStack Query** for server state and SSE cache invalidation, **react-router-dom** for routing.
- **Gzipped initial JS: 54.9 KB** _(measured on the D1 build; budget is 200 KB)._

### Backend

- **Node 20 + Express + TypeScript** — thin, honest, boring. The interesting logic is in the Gemini agent loop and the A* routing module, not in the HTTP layer.
- **Zod** for runtime validation on every inbound request AND every tool-call result returned to the model. The model doesn't see anything that hasn't been type-checked.
- **pino** for structured JSON logs — one line per request, correlated by `x-request-id`.

### Realtime

- **Firestore** for crowd + incidents — the client subscribes directly, so the heatmap keeps ticking even if the Azure backend cold-starts. This is a deliberate architecture choice for the F1 tier, see [ADR 0002](.gemini/antigravity/brain/decisions/0002-sse-over-websockets.md).
- **Server-Sent Events** for streaming Gemini tokens and pushing decision-support nudges. One-way, HTTP/1.1-friendly, survives every proxy Azure puts in front of the app. **Never WebSockets** on F1.

### Data

- **`data/venue/metlife.graph.json`** — 12-node hand-modelled MetLife concourse subgraph, 17 tagged/weighted edges (`gate-a`, `security`, `vom-128`, `section-128`, `restroom`, `concession`, `first-aid`, `sensory-safe`, `elevator`, `exit`, and two connectors). Each edge carries `distance`, `steps`, `wheelchairAccessible`, and `zone`. Version 0.1.0 today; expandable.
- **`data/fixtures/matches.json`** — QF, SF, and Final at MetLife, plus 8 team metadata records (flag, group, FIFA code, colors).

### Voice + Vision

- **Web Speech API** — browser-native STT and TTS. Offline TTS on Chromium desktops, cloud fallback on Safari iOS. No cloud speech keys, no billing surface.
- **Gemini 2.5 multimodal** for the camera → sign reader. One model call in, translated caption + language tag out.

### Infra + CI/CD

- **Firebase Hosting** for the frontend, **Firebase Auth** for guest + Google sign-in, **Firestore** for realtime state. Spark plan (free), no card.
- **Azure App Service F1** (Student subscription) for the Node backend. 60 min/day CPU quota is enough for a demo; cold starts covered by the Firestore-first realtime path.
- **GitHub Actions** for CI. `typecheck`, `lint`, `test`, `build` on every PR; deploy on tag.

### Dev Tools

- **npm workspaces monorepo** — three packages: `frontend`, `backend`, `shared`. Shared holds the Zod schemas that both sides import, so a type change on one side won't compile on the other until fixed. See [ADR 0001](.gemini/antigravity/brain/decisions/0001-monorepo-npm-workspaces.md).
- **Antigravity brain** — persistent memory under `.gemini/antigravity/brain/` (project overview, architecture, glossary, 7 ADRs, workspace rules). This is what lets a fresh agent session pick up context without re-explaining the project.

---

## 🚀 Quick start (dev)

Fresh clone → both servers running → **60 seconds**.

### Prerequisites

- **Node 20.11.1** — install via [nvm](https://github.com/nvm-sh/nvm) so the `.nvmrc` is respected.
- **git**.
- **A Google AI Studio API key** — grab one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Free, no credit card.

### Boot it

```bash
git clone https://github.com/YOUR_USER/Smart-Stadium.git concourse
cd concourse
nvm use            # picks up Node 20.11.1 from .nvmrc
npm install        # installs all three workspaces
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# paste your GEMINI_API_KEY into backend/.env
npm run dev        # boots backend on :8080, frontend on :5173
```

### Verify it's alive

```bash
curl http://localhost:8080/api/health
# → {"ok":true,"uptime":3.14,"version":"0.1.0"}

curl http://localhost:8080/api/version
# → {"name":"concourse-backend","version":"0.1.0","commit":"0373e3e"}
```

Then open [http://localhost:5173](http://localhost:5173). You should see the Concourse landing page with the pitch-green primary and hi-vis accent.

### The `.env` shape

Both `.env.example` files are checked in. Here's what `backend/.env` looks like — nothing secret, one required key:

```json
{
  "PORT": 8080,
  "NODE_ENV": "development",
  "GEMINI_API_KEY": "your-key-from-aistudio-google-com",
  "FIRESTORE_PROJECT_ID": "concourse-dev",
  "LOG_LEVEL": "info",
  "RATE_LIMIT_BUCKET_SIZE": 12,
  "RATE_LIMIT_REFILL_PER_MIN": 12,
  "AGENT_MAX_HOPS": 6,
  "CROWD_SIM_TICK_MS": 15000,
  "CROWD_SIM_DELTA_THRESHOLD": 0.05
}
```

Every one of those keys is validated by Zod at boot. If `GEMINI_API_KEY` is missing, the backend refuses to start and tells you which key it wanted.

### If something breaks

- **`GEMINI_API_KEY` invalid?** Check [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — the free tier is 15 RPM / 1500 RPD. If you're hitting 429s, the token bucket is doing its job; see [ADR 0007](.gemini/antigravity/brain/decisions/0007-free-tier-ceiling.md).
- **Port 5173 in use?** Vite will offer the next free port; the backend proxies via the URL in `frontend/.env`.
- **Firestore auth?** Not needed for local dev — the simulator runs in-memory unless `FIRESTORE_PROJECT_ID` points at a real project.

That's it. From zero to a running local Concourse, no cloud accounts required beyond a free AI Studio key.

---

## 📁 Repository layout

```
Smart-Stadium/                          # git repo name; product is CONCOURSE
├── .agents/
│   └── rules/                          # workspace rules read by every agent turn
│       ├── 00-house-style.md
│       ├── 10-typescript.md
│       ├── 20-honesty-boundaries.md
│       ├── 30-accessibility.md
│       └── 40-i18n.md
├── .gemini/
│   └── antigravity/
│       └── brain/                      # persistent memory for the agent IDE
│           ├── project.md
│           ├── architecture.md
│           ├── glossary.md
│           └── decisions/              # ADRs 0001-0010
│               ├── 0001-monorepo-npm-workspaces.md
│               ├── 0002-sse-over-websockets.md
│               ├── 0003-gemini-ai-studio-only.md
│               ├── 0004-metlife-flagship-venue.md
│               ├── 0005-simulated-crowd-labelled.md
│               ├── 0006-claude-code-then-antigravity.md
│               └── 0007-free-tier-token-bucket.md
├── .github/
│   └── workflows/
│       ├── ci.yml                      # lint + typecheck + test on PR
│       ├── deploy-frontend.yml         # Firebase Hosting on main
│       └── deploy-backend.yml          # Azure App Service on main
├── shared/                             # Zod schemas + inferred TS types + constants
│   ├── src/
│   │   ├── schemas/                    # ChatRequest, RouteRequest, CrowdSample, Incident
│   │   ├── types/                      # z.infer<> re-exports
│   │   └── constants/                  # VENUE_IDS, LOCALES, ALERT_KINDS
│   └── package.json
├── backend/                            # Node 20 + Express + TS
│   ├── src/
│   │   ├── agent/                      # Gemini backbone + tool loop
│   │   │   ├── backbone.ts
│   │   │   ├── tools/                  # findRoute, getCrowdLevel, findNearest, ...
│   │   │   └── prompts/                # system prompt + few-shots
│   │   ├── router/                     # A* over venue graph
│   │   ├── crowd/                      # simulator + Firestore writer
│   │   ├── rag/                        # in-memory cosine over text-embedding-004
│   │   ├── alerts/                     # SSE fan-out + rule engine
│   │   ├── routes/                     # /api/health, /api/version, /api/chat, /api/route, /api/stream
│   │   ├── middleware/                 # zod validate, pino req log, error handler
│   │   └── index.ts
│   └── tests/                          # Vitest, in-process supertest
├── frontend/                           # React 18 + Vite 5 + TS + Tailwind
│   ├── src/
│   │   ├── features/                   # feature-first: concierge/, wayfinding/, crowd/, accessibility/, alerts/, admin/
│   │   ├── components/ui/              # shadcn/ui primitives
│   │   ├── lib/                        # firebase.ts, sse.ts, api.ts
│   │   ├── locales/                    # 12 seed languages, i18next JSON
│   │   ├── stores/                     # Zustand slices
│   │   └── main.tsx
│   └── index.html
├── data/
│   ├── venue/
│   │   └── metlife.graph.json          # 12 nodes, 17 weighted edges, v0.1.0
│   ├── fixtures/
│   │   └── matches.json                # QF/SF/Final + 8 team metadata
│   └── prompts/
│       ├── system.md                   # deterministic tool-grounding prompt
│       ├── few-shots.json
│       └── refusals.md
├── docs/
│   ├── PLAN.md                         # 5-section 14-day plan
│   ├── ARCHITECTURE.md
│   └── DEMO-SCRIPT.md
├── evidence/
│   ├── antigravity-prompts.md          # every prompt sent to Antigravity, timestamped
│   ├── screenshots/
│   └── recordings/
├── package.json                        # npm workspaces root
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── LICENSE
└── README.md
```

Feature-first modularity means each capability owns its slice — `features/wayfinding/` holds its components, hooks, and Zustand slice; `backend/src/router/` holds the A* implementation and its tests. Nothing crosses a folder boundary without going through `shared/` (schemas) or a typed tool call. The `brain/` and `.agents/rules/` directories ship inside the repo on purpose: the agent IDE reads them on every task, they get code-reviewed like any other file, and a new contributor (or a new agent) inherits the same context. Rules-as-code is not a novelty here — it is how the project stays coherent across a solo builder switching between Claude Code and Antigravity mid-cycle.

## 🧠 Architecture

```
                    ┌───────────────────────────────────────────┐
                    │   Fan device — Chromium PWA / iOS Safari  │
                    │  (React 18, Tailwind, Web Speech, WebXR*) │
                    └──────────────┬────────────────────────────┘
                                   │
                    Firebase Hosting (static, CDN, HTTP/3)
                                   │
                ┌──────────────────┼────────────────────────┐
                │                  │                        │
                │ POST /api/chat   │ SSE /api/stream        │ Firestore listener
                │ POST /api/route  │ (tokens + nudges)      │ (crowd + incidents)
                ▼                  ▼                        ▼
      ┌──────────────────────────────────────────┐   ┌───────────────────┐
      │  Node 20 + Express — Azure App Service   │   │     Firestore     │
      │  (F1, single instance, keep-alive ping)  │◄──┤  crowd/{zoneId}   │
      │                                          │   │  incidents/{id}   │
      │  ┌────────────────────────────────────┐  │   │  sessions/{uid}   │
      │  │  Agent backbone (Gemini 2.5)       │  │   └───────────────────┘
      │  │  ├─ system prompt (tool-grounded)  │  │
      │  │  ├─ function-calling loop (6 hops) │──┼──► Google AI Studio
      │  │  ├─ token bucket (12/min)          │  │    gemini-2.5-flash / pro
      │  │  └─ FIFO queue (depth 20)          │  │    text-embedding-004
      │  └───────────────┬────────────────────┘  │
      │                  │                       │
      │  ┌───────────────▼────────────────────┐  │
      │  │  Tool layer (deterministic)        │  │
      │  │  findRoute · getCrowdLevel         │  │
      │  │  findNearest · describeImage       │  │
      │  │  ragSearch · getMatchInfo          │  │
      │  │  subscribeIncidents                │  │
      │  └───────────────┬────────────────────┘  │
      │                  │                       │
      │  ┌───────────────▼────────────────────┐  │
      │  │  Data layer                        │  │
      │  │  venue/metlife.graph.json (LRU)    │  │
      │  │  fixtures/matches.json             │  │
      │  │  RAG corpus (in-memory cosine)     │  │
      │  └────────────────────────────────────┘  │
      └──────────────────────────────────────────┘
```

**Frontend layer** — presentation only, zero business logic. It subscribes to Firestore for crowd density (so the heatmap keeps updating even if the backend is cold-starting on Azure), POSTs user turns to `/api/chat`, and consumes an SSE stream from `/api/stream` for token-by-token replies plus proactive nudges. State is Zustand for UI slices, TanStack Query for HTTP, react-i18next for strings. No component ever hardcodes a gate number, a section, or a route step — those only arrive as typed tool results from the backend.

**Agent layer** — one Gemini backbone with a strict system prompt and a typed tool registry: `findRoute(from, to, mode)`, `getCrowdLevel(zoneId)`, `findNearest(kind, from)`, `describeImage(imageBase64, targetLocale)`, `ragSearch(query, topK)`, `getMatchInfo(matchId)`, `subscribeIncidents(sessionId)`. The function-calling loop caps at 6 hops per turn, retries with exponential backoff on 429s, and sits behind the token bucket so we never blow the free-tier ceiling mid-demo.

**Tool layer** — pure, deterministic functions. The venue graph is loaded once and cached in an LRU. The A* router computes `w(e) = distance + α·crowdPenalty(e.to.zone) + β·accessibilityViolation(e, mode)` where `α` and `β` are tuned per user mode (walking, step-free, sensory-safe). The crowd simulator ticks every 15 seconds with realistic phase curves (pre-match ramp, kickoff drop, halftime surge, post-match egress) and only writes deltas above 5% to Firestore. RAG is an in-memory cosine index over `text-embedding-004` vectors — small corpus, so no vector DB needed. The alert engine is a rule/LLM hybrid: hard rules (gate change, delay > 5 min, incident) fire deterministically; softer nudges ("leave now to catch the 22:14 to Penn") get a Gemini pass first.

**Data layer** — static JSON in the repo for things that do not change during a match (venue graph, fixtures, RAG corpus). Firestore for live state (crowd density, injected incidents, guest sessions). No Postgres, no Redis, no dedicated DB — the shape of the problem does not need one.

**Realtime layer** — two channels, neither optional. SSE from backend to browser for streamed tokens and pushed nudges (chosen over WebSockets because Azure F1 is finicky about long-lived duplex connections — see ADR 0002). Firestore listeners from browser directly to the database for crowd and incident deltas, which means the heatmap survives backend restarts.

> **Deterministic tool-grounding.** The LLM reasons; tools execute. The Gemini backbone is never allowed to invent a gate number, a section label, a route step, or a distance in metres. Every concrete venue reference in the user's reply must trace back to a typed tool result — the system prompt says this in as many words, few-shots demonstrate the refusal pattern, and the tool-call loop enforces it structurally (there is no free-text path to a route or a crowd number). This is the single most important discipline in the codebase. It is why the concierge cannot hallucinate you to a section that doesn't exist, and it is what makes a manual reviewer able to trust the demo.

## 🎯 Design decisions

Ten ADRs, one row each. Full text lives in `.gemini/antigravity/brain/decisions/`.

| # | Decision | Why |
|---|---|---|
| 1 | Monorepo (npm workspaces) | One install, one lint pass, shared Zod schemas without publishing. No Nx/Turbo overhead for a two-package tree. |
| 2 | SSE over WebSockets | Azure App Service F1 is finicky about long-lived duplex sockets. SSE is HTTP, one-way, and just works behind the App Service front-end. |
| 3 | Gemini via AI Studio only | No credit card required. No Vertex AI, no Cloud Speech, no Cloud Vision, no Cloud Translation — one API key, one SDK, one billing surface (free). |
| 4 | MetLife Stadium as flagship venue | The Final is on 2026-07-19 at MetLife. Building the app during the tournament that ends at this venue is the story. |
| 5 | Simulated crowd, labelled as such | Every crowd sample carries `source: "sim" \| "injected" \| "sensor"`. Honesty scores better in manual review than a fake sensor claim that a judge can poke at. |
| 6 | Build in Claude Code first, port to Antigravity on Day 10 | Antigravity's public preview is untested at hackathon scale. Brain/ is seeded densely pre-port; Prompt Pack #2 does real feature work post-port. Risk is acknowledged in the blog. |
| 7 | Free-tier ceiling → token bucket + FIFO queue | 15 RPM AI Studio limit → 12 RPM bucket (3 RPM headroom), queue depth 20, "one moment" fallback when full. No mid-demo 429s. |
| 8 | Predictive density (T+15 / T+30) as a ghosted heatmap layer | Every `CrowdLevel` carries an optional `predictions[]` sampled from the simulator's own phase curve. No ML claims; the forward-look uses the same signal that produced the current value. Turns `/admin` from monitoring into forecasting. |
| 9 | AI Operational Briefing on `/admin` | One Gemini 2.5 Pro call every ~5 min emits a structured `Briefing` (headline + summary + concerns + recommendations). LLM writes prose; numeric fields are tool-derived. Turns widgets into a chief-of-staff. |
| 10 | Privacy by design | No facial recognition anywhere. Aggregate zone density only — schema has no `fan_id`. Anonymous sessions default, ephemeral chat, opt-in notifications. Enforced by schema and middleware, not policy. |

Full ADRs live in `.gemini/antigravity/brain/decisions/`. Read them in order — 0001 sets up the shape of the repo, 0007 explains why the demo does not crash, 0010 is the constraint every future feature must satisfy.

## 🛠 Dev workflow

- **Git** — trunk-based on `main`, short-lived `feat/*` and `fix/*` branches, Conventional Commits (`feat(backend):`, `fix(frontend):`, `docs(brain):`, `chore(ci):`). Squash-merge only.
- **Type discipline** — TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Zero `any` in application code — the ESLint rule is set to `error`, not `warn`. Zod at every trust boundary (HTTP body, tool call args, Firestore reads).
- **Linting** — ESLint (typescript-eslint, react-hooks, tailwindcss, jsx-a11y) + Prettier. Config in root, workspaces inherit.
- **Tests** — Vitest across all workspaces. Backend tests exercise the Express app in-process via `supertest`. No Gemini mocks — behavioural tests use recorded fixtures (real API response bodies captured once, replayed deterministically) so we test the loop, not the model.
- **CI** — GitHub Actions.
  - `ci.yml` — lint + typecheck + test on every PR against `main`.
  - `deploy-frontend.yml` — build + Firebase Hosting deploy on push to `main`.
  - `deploy-backend.yml` — build + Azure App Service zip deploy on push to `main`.
  - Required secrets: `FIREBASE_TOKEN`, `AZURE_WEBAPP_PUBLISH_PROFILE`, `GEMINI_API_KEY` (used by behavioural tests in CI, sparingly, cached).
- **Local emulators** — Firebase Emulator Suite (Firestore + Auth). `npm run dev` boots frontend, backend, and emulator side-by-side. No cloud round-trips required to develop offline on a plane.

## 🚢 Deployment

### Frontend to Firebase Hosting

```bash
cd frontend
npm run build           # vite build → dist/
firebase deploy --only hosting
# or push to main; deploy-frontend.yml handles it
```

The Vite build outputs a hashed static bundle; `firebase.json` sets long-cache headers on `/assets/*` and no-cache on `index.html`. CDN + HTTP/3 for free.

### Backend to Azure App Service F1

```bash
cd backend
npm run build           # tsc → dist/
zip -r deploy.zip dist package.json package-lock.json
az webapp deploy \
  --resource-group concourse-rg \
  --name concourse-api \
  --src-path deploy.zip \
  --type zip
```

Alternatively, build a container, push to Azure Container Registry, and point the App Service at the image. F1 quirks worth naming: single instance (no horizontal scale), 60-minute idle shutdown (mitigated with a UptimeRobot 5-minute keep-alive ping to `/api/health`), 1 GB RAM ceiling. If the Azure Student subscription gives trouble, the fallback hosts are Render (750 free hours/month, no CC) and Fly.io (may require CC — flagged, not preferred).

### Environment variables

- `GEMINI_API_KEY` — BE — Google AI Studio API key, server-side only.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — BE — service account JSON for admin SDK writes to Firestore.
- `ADMIN_UIDS` — BE — comma-separated Firebase UIDs allowed into `/admin`.
- `ALLOWED_ORIGINS` — BE — CORS allow-list, comma-separated (Firebase Hosting URL + localhost:5173).
- `PORT` — BE — set by Azure App Service; defaults to 8080 locally.
- `VITE_API_BASE` — FE — base URL of the backend (e.g. `https://concourse-api.azurewebsites.net`).
- `VITE_FIREBASE_API_KEY` — FE — public Firebase web config.
- `VITE_FIREBASE_AUTH_DOMAIN` — FE — public Firebase web config.
- `VITE_FIREBASE_PROJECT_ID` — FE — public Firebase web config.
- `VITE_FIREBASE_APP_ID` — FE — public Firebase web config.
- `VITE_SENTRY_DSN` — FE — optional error reporting.

Secrets never go in git. `.env.local` is gitignored on both sides. Azure gets its values via App Service Application Settings (encrypted at rest, injected as env vars at process start). GitHub Actions pulls from Repository Secrets. Rotation is manual and documented in `docs/OPS.md`.

## 🗺 Roadmap

The migration story is the interesting part — every future version is a step from "simulated but honest" to "real and still honest."

- **v0.2 — Second venue.** SoFi Stadium (Los Angeles). Automated venue import from GeoJSON or CAD floor plans, replacing the hand-modelled MetLife graph. Proves the router is venue-agnostic.
- **v0.3 — Real crowd via edge CV.** Replace the simulator with bounding-box vectors emitted by edge cameras; only counts and zone IDs leave the device, never frames. `source` flips from `"sim"` to `"sensor"` and the honesty label in the UI updates automatically.
- **v0.4 — Transportation integration.** Real transit feeds where available — NJ Transit GTFS-RT for MetLife, LA Metro for SoFi. The "leave now to catch the 22:14" nudge stops being a rule and starts being a query.
- **v0.5 — AR wayfinding overlay.** WebXR overlay on top of the existing route — same A* result, same tool-grounded narration, new rendering surface. No native app.
- **v1.0 — Multi-tenant.** Venue operators self-onboard, upload their graph, get a branded fan URL. The agent backbone and tool contracts stay the same; venue data becomes tenant-scoped.

## 🤝 Contributing

- Feature-first folders. If a change touches more than one feature, it either goes through `shared/` or gets its own ADR.
- Anything non-obvious gets an ADR in `.gemini/antigravity/brain/decisions/`. If you cannot explain a decision in 200 words, it is not ready to merge.
- Coding standards live in `.agents/rules/00-house-style.md` and are read by every agent turn. Humans read them too.
- Every UI string must be i18n-translatable. No hardcoded English in a component — the ESLint rule catches obvious cases, code review catches the rest.
- Accessibility is not optional. `axe-core` runs on every PR via `@axe-core/playwright`; violations fail CI.
- Small PRs, single concern, squash-merge. If your diff needs a table of contents, split it.

## 🙏 Credits

- Built by [Arpit Kumar](https://github.com/) for **PromptWars Virtual Challenge 4 — Smart Stadiums & Tournament Operations**.
- **Google Cloud** and **Hack2Skill** for hosting PromptWars.
- **FIFA World Cup 2026** for the timing that made this narrative possible — building a stadium companion during the tournament that ends eleven days after Day 1 is not a coincidence, it is the point.
- **MetLife Stadium** for the publicly available venue documentation that made the graph honest.
- **Google Antigravity** and **Gemini 2.5** for the agent-first IDE and the LLM backbone.
- **Anthropic Claude Code** for the Day 1 – Day 9 scaffolding half of the workflow, per ADR 0006. Two agent IDEs, one project, one honest hand-off.

## 📄 License

MIT — see [`LICENSE`](LICENSE).

## 📚 Further reading

- Full 5-section implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
- Antigravity prompt log (every prompt, timestamped): [`evidence/antigravity-prompts.md`](evidence/antigravity-prompts.md)
- Architecture deep-dive: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Demo script (what the judge sees, in order): [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md)
- Blog — *Building Concourse: Day 1 to Day 12*: (blog-link-placeholder)
- LinkedIn thread: (placeholder)
